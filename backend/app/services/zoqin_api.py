"""Zoqin HTTP helpers (login, bind list) with optional session cache."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)

# Zoqin gateway often returns 405 for bare python-httpx GET; Postman sends browser-like headers.
_ZOQIN_REQUEST_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Referer": "https://www.zoqin.com/",
    "Origin": "https://www.zoqin.com",
    "X-Requested-With": "XMLHttpRequest",
}

SESSION_PATH = Path(__file__).resolve().parents[1] / "data" / "zoqin_session.json"

_LOGIN_BODY_VARIANTS = (
    ("json", {"email": None, "pwd": None}),
    ("form", {"email": None, "pwd": None}),
    ("json", {"username": None, "password": None}),
    ("form", {"username": None, "password": None}),
)


def invalidate_zoqin_session() -> None:
    try:
        if SESSION_PATH.exists():
            SESSION_PATH.unlink()
    except Exception:
        logger.exception("zoqin session delete failed")


def _read_session() -> Optional[str]:
    if not SESSION_PATH.exists():
        return None
    try:
        with SESSION_PATH.open("r", encoding="utf-8") as fp:
            data = json.load(fp)
        code = data.get("user_code") or data.get("code")
        return str(code).strip() if code else None
    except Exception:
        logger.exception("zoqin session read failed")
        return None


def _write_session(user_code: str) -> None:
    SESSION_PATH.parent.mkdir(parents=True, exist_ok=True)
    with SESSION_PATH.open("w", encoding="utf-8") as fp:
        json.dump({"user_code": user_code}, fp, indent=2)


def _zoqin_https_url(url: str) -> str:
    """Zoqin allBind over http:// often returns 405; production uses https://www.zoqin.com/..."""
    u = (url or "").strip()
    if "zoqin.com" in u.lower() and u.startswith("http://"):
        return "https://" + u[7:]
    return u


def _login_url_candidates(login_url: str) -> list[str]:
    base = _zoqin_https_url(login_url).rstrip("/")
    urls = [base]
    if base.endswith("/Login"):
        urls.append(base[:-6] + "/login")
    elif base.endswith("/login"):
        urls.append(base[:-6] + "/Login")
    seen: set[str] = set()
    out: list[str] = []
    for url in urls:
        if url not in seen:
            seen.add(url)
            out.append(url)
    return out


def _parse_login_code(payload: Any) -> Optional[str]:
    if not isinstance(payload, dict):
        return None
    data = payload.get("data")
    if isinstance(data, str) and data.strip():
        return data.strip()
    if isinstance(data, dict):
        for key in ("userCode", "code", "token", "user_code"):
            v = data.get(key)
            if v is not None and str(v).strip():
                return str(v).strip()
    for key in ("userCode", "user_code"):
        v = payload.get(key)
        if isinstance(v, str) and v.strip():
            return v.strip()
    return None


async def zoqin_login(client: httpx.AsyncClient, login_url: str, email: str, pwd: str) -> str:
    errors: list[str] = []
    headers_base = dict(_ZOQIN_REQUEST_HEADERS)

    for url in _login_url_candidates(login_url):
        for mode, template in _LOGIN_BODY_VARIANTS:
            body = dict(template)
            if "email" in body:
                body["email"] = email
                body["pwd"] = pwd
            else:
                body["username"] = email
                body["password"] = pwd

            headers = dict(headers_base)
            try:
                if mode == "json":
                    headers["Content-Type"] = "application/json"
                    resp = await client.post(url, json=body, headers=headers)
                else:
                    headers["Content-Type"] = "application/x-www-form-urlencoded"
                    resp = await client.post(url, data=body, headers=headers)

                if resp.status_code == 404:
                    errors.append(f"{url} [{mode}] 404")
                    continue
                resp.raise_for_status()

                try:
                    payload = resp.json()
                except Exception:
                    errors.append(f"{url} [{mode}] non-JSON {resp.status_code}")
                    continue

                code = _parse_login_code(payload)
                if code:
                    _write_session(code)
                    logger.info("zoqin login ok url=%s mode=%s", url, mode)
                    return code

                errors.append(f"{url} [{mode}] no userCode in response")
            except httpx.HTTPStatusError as exc:
                errors.append(f"{url} [{mode}] HTTP {exc.response.status_code}")
            except Exception as exc:
                errors.append(f"{url} [{mode}] {exc}")

    logger.error("zoqin login failed for all variants: %s", "; ".join(errors[:6]))
    raise ValueError(
        "zoqin login failed: the configured login URL returned 404 or an invalid response. "
        "Confirm ZOQIN_LOGIN_URL with Zoqin or set ZOQIN_USER_CODE in .env."
    )


async def get_zoqin_user_code(
    client: httpx.AsyncClient,
    *,
    login_url: str,
    email: str,
    password: str,
    force_refresh: bool = False,
    static_code: str | None = None,
) -> str:
    if static_code and str(static_code).strip():
        return str(static_code).strip()
    if not force_refresh:
        cached = _read_session()
        if cached:
            return cached
    return await zoqin_login(client, login_url, email, password)


def parse_bind_devices(payload: Any) -> List[Dict[str, Any]]:
    """Normalize allBind JSON into dict rows with at least `sn`."""
    if payload is None:
        return []
    data = payload.get("data") if isinstance(payload, dict) else None
    if data is None and isinstance(payload, dict):
        data = payload.get("Data")
    candidates: List[Any] = []
    if isinstance(data, list):
        candidates = data
    elif isinstance(data, dict):
        for key in ("list", "bindList", "devices", "rows", "records"):
            v = data.get(key)
            if isinstance(v, list):
                candidates = v
                break
        if not candidates:
            candidates = list(data.values()) if data else []
    elif isinstance(payload, list):
        candidates = payload

    out: List[Dict[str, Any]] = []
    for item in candidates:
        if isinstance(item, str) and item.strip():
            out.append({"sn": item.strip()})
            continue
        if not isinstance(item, dict):
            continue
        sn = (
            item.get("sn")
            or item.get("SN")
            or item.get("deviceSn")
            or item.get("imei")
            or item.get("IMEI")
        )
        if sn:
            row = dict(item)
            row["sn"] = str(sn).strip()
            out.append(row)
    return out


async def zoqin_all_bind(client: httpx.AsyncClient, bind_url: str, user_code: str) -> List[Dict[str, Any]]:
    """
    List bound devices for ``userCode``.

    Production gateway accepts POST form-urlencoded; GET often returns 405.
    """
    url = _zoqin_https_url(bind_url)
    h = _ZOQIN_REQUEST_HEADERS

    async def _parse(resp: httpx.Response) -> List[Dict[str, Any]]:
        resp.raise_for_status()
        payload = resp.json()
        if isinstance(payload, dict):
            c = payload.get("code")
            if c not in (None, 200, "200", 0, "0"):
                logger.warning("zoqin allBind non-success code=%s body=%s", c, payload)
        return parse_bind_devices(payload)

    # 1) POST form (works on current Zoqin gateway)
    resp = await client.post(
        url,
        data={"userCode": user_code},
        headers={**h, "Content-Type": "application/x-www-form-urlencoded"},
    )
    if resp.status_code not in (404, 405):
        return await _parse(resp)

    # 2) GET (legacy / Postman)
    resp = await client.get(url, params={"userCode": user_code}, headers=h)
    if resp.status_code != 405:
        return await _parse(resp)

    logger.info("zoqin allBind GET returned 405; retrying POST JSON")
    # 3) POST JSON
    resp = await client.post(
        url,
        json={"userCode": user_code},
        headers={**h, "Content-Type": "application/json"},
    )
    return await _parse(resp)
