"""TrackSolid Pro (Jimi) Open API client."""

from __future__ import annotations

import hashlib
import logging
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from dotenv import load_dotenv
from httpx import AsyncClient, HTTPStatusError, RequestError

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))

logger = logging.getLogger(__name__)


class TrackSolidError(Exception):
    pass


def _env(*keys: str) -> Optional[str]:
    for key in keys:
        raw = os.getenv(key)
        if raw is None:
            continue
        value = str(raw).strip().strip('"').strip("'")
        if value:
            return value
    return None


@dataclass(frozen=True)
class TrackSolidConfig:
    app_key: str
    app_secret: str
    account: str
    password_md5: str
    base_url: str


def get_tracksolid_config() -> Optional[TrackSolidConfig]:
    app_key = _env("TRACKSOLID_APP_KEY", "APP_KEY")
    app_secret = _env("TRACKSOLID_APP_SECRET", "APP_SECRET")
    account = _env("TRACKSOLID_ACCOUNT", "ACCOUNT")
    password_md5 = _env("TRACKSOLID_PASSWORD_MD5", "PASSWORD_MD5")
    base_url = _env("TRACKSOLID_BASE_URL", "BASE_URL") or "https://eu-open.tracksolidpro.com/route/rest"
    if not all([app_key, app_secret, account, password_md5]):
        return None
    return TrackSolidConfig(
        app_key=app_key,
        app_secret=app_secret,
        account=account,
        password_md5=password_md5.lower(),
        base_url=base_url.rstrip("/"),
    )


def sign_params(params: Dict[str, Any], app_secret: str) -> str:
    filtered = {
        k: v
        for k, v in params.items()
        if k != "sign" and v is not None and not isinstance(v, (bytes, bytearray))
    }
    ordered = "".join(f"{k}{filtered[k]}" for k in sorted(filtered))
    payload = f"{app_secret}{ordered}{app_secret}"
    return hashlib.md5(payload.encode("utf-8")).hexdigest().upper()


def utc_timestamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


class TrackSolidClient:
    def __init__(self, config: TrackSolidConfig):
        self.config = config
        self._access_token: Optional[str] = None

    async def _post(self, method: str, private: Dict[str, Any]) -> Dict[str, Any]:
        params: Dict[str, Any] = {
            "method": method,
            "timestamp": utc_timestamp(),
            "app_key": self.config.app_key,
            "sign_method": "md5",
            "v": "1.0",
            "format": "json",
            **private,
        }
        params["sign"] = sign_params(params, self.config.app_secret)

        try:
            async with AsyncClient(timeout=60.0) as client:
                response = await client.post(self.config.base_url, data=params)
                response.raise_for_status()
                payload = response.json()
        except (HTTPStatusError, RequestError) as exc:
            raise TrackSolidError(f"TrackSolid HTTP error: {exc}") from exc
        except ValueError as exc:
            raise TrackSolidError("TrackSolid returned invalid JSON") from exc

        if not isinstance(payload, dict):
            raise TrackSolidError("TrackSolid returned unexpected payload")

        if payload.get("code") != 0:
            raise TrackSolidError(payload.get("message") or f"TrackSolid API error code {payload.get('code')}")

        return payload

    async def get_access_token(self) -> str:
        if self._access_token:
            return self._access_token

        payload = await self._post(
            "jimi.oauth.token.get",
            {
                "user_id": self.config.account,
                "user_pwd_md5": self.config.password_md5,
                "expires_in": "7200",
            },
        )
        result = payload.get("result") or {}
        token = result.get("accessToken") or result.get("access_token")
        if not token:
            raise TrackSolidError("TrackSolid token response missing access token")

        self._access_token = str(token)
        return self._access_token

    async def list_device_locations(self) -> list[dict]:
        token = await self.get_access_token()
        payload = await self._post(
            "jimi.user.device.location.list",
            {
                "access_token": token,
                "target": self.config.account,
            },
        )
        result = payload.get("result")
        if isinstance(result, list):
            return result
        return []

    async def get_device_locations(self, imeis: list[str]) -> list[dict]:
        cleaned = [i.strip() for i in imeis if i and str(i).strip()]
        if not cleaned:
            return []
        token = await self.get_access_token()
        payload = await self._post(
            "jimi.device.location.get",
            {
                "access_token": token,
                "imeis": ",".join(cleaned),
            },
        )
        result = payload.get("result")
        if isinstance(result, list):
            return result
        if isinstance(result, dict):
            return [result]
        return []
