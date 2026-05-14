"""TrackSolid / Jimi Open API (async). Token persisted under `app/data/`."""

from __future__ import annotations

import hashlib
import json
import logging
import os
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)


class TrackSolidError(Exception):
    """TrackSolid API returned an error."""


def _calculate_sign(params: Dict[str, Any], app_secret: str) -> str:
    params = {k: v for k, v in params.items() if k != "sign" and v is not None}
    sorted_params = sorted(params.items())
    sign_str = app_secret
    for key, value in sorted_params:
        sign_str += f"{key}{value}"
    sign_str += app_secret
    return hashlib.md5(sign_str.encode("utf-8")).hexdigest().upper()


class TrackSolidClient:
    def __init__(
        self,
        *,
        base_url: str,
        app_key: str,
        app_secret: str,
        account: str,
        password_md5: str,
        token_path: Path,
    ):
        self.base_url = base_url.rstrip("/")
        self.app_key = app_key
        self.app_secret = app_secret
        self.account = account
        self.password_md5 = password_md5
        self.token_path = token_path

    def _load_token(self) -> Optional[str]:
        if not self.token_path.exists():
            return None
        try:
            with self.token_path.open("r", encoding="utf-8") as fp:
                data = json.load(fp)
        except Exception:
            logger.exception("tracksolid token read failed")
            return None
        expires_at = data.get("expires_at")
        token = data.get("accessToken")
        if not token:
            return None
        if not expires_at:
            return str(token)
        try:
            exp = datetime.fromisoformat(str(expires_at).replace("Z", "+00:00"))
            if exp.tzinfo is not None:
                exp = exp.replace(tzinfo=None)
            if exp > datetime.utcnow():
                return str(token)
        except Exception:
            logger.warning("tracksolid token expires_at parse failed")
        return None

    def _save_token(self, result: Dict[str, Any]) -> None:
        expires_in = result.get("expiresIn") or result.get("expires_in") or 7200
        try:
            sec = int(float(expires_in))
        except (TypeError, ValueError):
            sec = 7200
        # Refresh slightly before provider expiry
        margin = min(300, sec // 10)
        expires_at = (datetime.utcnow() + timedelta(seconds=max(60, sec - margin))).isoformat()
        payload = dict(result)
        payload["expires_at"] = expires_at
        self.token_path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.token_path.with_suffix(".tmp")
        with tmp.open("w", encoding="utf-8") as fp:
            json.dump(payload, fp, indent=2, ensure_ascii=False)
        os.replace(tmp, self.token_path)
        logger.info("tracksolid token saved expires_at=%s", expires_at)

    async def _api_call(self, method: str, extra: Dict[str, Any], token: Optional[str]) -> Any:
        ts = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        params: Dict[str, Any] = {
            "method": method,
            "timestamp": ts,
            "app_key": self.app_key,
            "sign_method": "md5",
            "v": "1.0",
            "format": "json",
        }
        if token:
            params["access_token"] = token
        params.update(extra)
        params["sign"] = _calculate_sign(params, self.app_secret)

        async with httpx.AsyncClient(timeout=40.0) as client:
            resp = await client.post(self.base_url, data=params)
        resp.raise_for_status()
        try:
            return resp.json()
        except Exception:
            logger.error("tracksolid non-json response text=%s", resp.text[:500])
            return None

    async def get_valid_token(self) -> str:
        existing = self._load_token()
        if existing:
            return existing

        logger.info("tracksolid fetching new access token")
        body = await self._api_call(
            "jimi.oauth.token.get",
            {
                "user_id": self.account,
                "user_pwd_md5": self.password_md5,
                "expires_in": "7200",
            },
            token=None,
        )
        if not isinstance(body, dict) or body.get("code") != 0:
            raise TrackSolidError(str(body.get("message") if isinstance(body, dict) else body))

        result = body.get("result")
        if not isinstance(result, dict) or not result.get("accessToken"):
            raise TrackSolidError("tracksolid token response missing accessToken")

        self._save_token(result)
        return str(result["accessToken"])

    async def list_device_locations(self, token: str) -> List[Dict[str, Any]]:
        body = await self._api_call("jimi.user.device.location.list", {"target": self.account}, token)
        if not isinstance(body, dict):
            raise TrackSolidError("invalid response")
        if body.get("code") != 0:
            raise TrackSolidError(body.get("message") or "jimi.user.device.location.list failed")
        result = body.get("result")
        if isinstance(result, list):
            return [x for x in result if isinstance(x, dict)]
        return []
