# CityTag API integration
# https://www.citytag.cn/
# 
import base64
import json
from typing import Any, Dict, List, Optional
from datetime import datetime
import httpx
from Crypto.Cipher import DES3
from Crypto.Util.Padding import pad, unpad

BLOCK_SIZE = 8  # 3DES block size in bytes


class CityTagError(Exception):
    """Raised when CityTag API returns an error."""


def _build_3des_key(token: str) -> bytes:
    """Build a valid 3DES key from the CityTag token."""
    key = token.encode("utf-8")
    if len(key) not in (16, 24):
        key = (key + b"0" * 24)[:24]
    return DES3.adjust_key_parity(key)


def encrypt_payload(payload: Dict[str, Any], token: str) -> str:
    """Encrypt JSON payload using 3DES-ECB with PKCS7 padding."""
    key = _build_3des_key(token)
    cipher = DES3.new(key, DES3.MODE_ECB)
    plaintext = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    padded = pad(plaintext, BLOCK_SIZE)
    encrypted = cipher.encrypt(padded)
    return base64.b64encode(encrypted).decode("utf-8")


def decrypt_payload(ciphertext: str, token: str) -> Dict[str, Any]:
    """Decrypt CityTag response 'data' field using 3DES-ECB PKCS7."""
    key = _build_3des_key(token)
    cipher = DES3.new(key, DES3.MODE_ECB)
    raw = base64.b64decode(ciphertext)
    padded = cipher.decrypt(raw)
    plaintext = unpad(padded, BLOCK_SIZE)
    return json.loads(plaintext.decode("utf-8"))


class CityTagClient:
    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")

    async def login(self, username: str, password: str) -> Dict[str, Any]:
        """Call CityTag login endpoint (no encryption)."""
        url = f"{self.base_url}/api/interface/login"
        data = {"username": username, "password": password}
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(url, data=data, headers={"Content-Type": "application/x-www-form-urlencoded"})
        resp.raise_for_status()
        body = resp.json()
        if body.get("code") != "00000":
            raise CityTagError(body.get("msg") or "CityTag login failed")
        return body["data"]

    async def get_devices(self, uid: str, token: str, sn: Optional[str] = None, page_no: int = 1, page_size: int = 20) -> List[Dict[str, Any]]:
        """Get list of devices for a user via encrypted payload."""
        url = f"{self.base_url}/api2/v4/device/{uid}"
        payload: Dict[str, Any] = {"pageNo": page_no, "pageSize": page_size}
        if sn:
            payload["sn"] = sn
        encryption = encrypt_payload(payload, token)
        body = {"encryption": encryption}
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(url, json=body)
        resp.raise_for_status()
        data = resp.json()
        if data.get("code") != "00000":
            raise CityTagError(data.get("msg") or "CityTag device list failed")
        encrypted_data = data.get("data")
        if not encrypted_data:
            return []

        decrypted = decrypt_payload(encrypted_data, token)

        # Common response shapes:
        # - {"list": [...]} or {"devices": [...]}
        # - {"data": {"list": [...]}} (nested)
        # - or directly a list
        if isinstance(decrypted, dict):
            # Direct keys we know about.
            for key in ("list", "devices"):
                value = decrypted.get(key)
                if isinstance(value, list):
                    return value

            # If there's a nested dict under "data", look for a list there.
            inner = decrypted.get("data")
            if isinstance(inner, dict):
                for value in inner.values():
                    if isinstance(value, list):
                        return value

            # Fallback: any list value inside the top-level dict.
            for value in decrypted.values():
                if isinstance(value, list):
                    return value

        if isinstance(decrypted, list):
            return decrypted

        return []

    async def get_all_devices(
        self,
        uid: str,
        token: str,
        *,
        page_size: int = 50,
        max_pages: int = 50,
    ) -> List[Dict[str, Any]]:
        """Page through CityTag device list until exhausted (for sync jobs).

        CityTag API rejects pageSize > 50 for /api2/v4/device/{uid}.
        """
        merged: List[Dict[str, Any]] = []
        page_no = 1
        while page_no <= max_pages:
            batch = await self.get_devices(uid=uid, token=token, sn=None, page_no=page_no, page_size=page_size)
            if not batch:
                break
            merged.extend(batch)
            if len(batch) < page_size:
                break
            page_no += 1
        return merged

    async def get_latest_location(self, uid: str, token: str, sn: str, page_no: int = 1, page_size: int = 20) -> Optional[Dict[str, Any]]:
        """Get latest location for a specific device SN."""
        url = f"{self.base_url}/api/interface/v2/device/{uid}"
        payload = {"uid": int(uid), "sn": sn, "pageNo": page_no, "pageSize": page_size}
        encryption = encrypt_payload(payload, token)
        body = {"encryption": encryption}
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(url, json=body)
        resp.raise_for_status()
        data = resp.json()
        if data.get("code") != "00000":
            raise CityTagError(data.get("msg") or "CityTag trajectory failed")
        encrypted_data = data.get("data")
        if not encrypted_data:
            return None
        decrypted = decrypt_payload(encrypted_data, token)
        history = decrypted.get("history") or []
        return history[-1] if history else None

    async def get_location_history(
        self,
        uid: str,
        token: str,
        sn: str,
        start_time: datetime,
        end_time: datetime,
        page_no: int = 1,
        page_size: int = 500,
    ) -> List[Dict[str, Any]]:
        """Fetch historical points for a device in the supplied time range."""
        url = f"{self.base_url}/api/interface/v2/device/{uid}"
        payload = {
            "uid": int(uid),
            "sn": sn,
            "pageNo": page_no,
            "pageSize": page_size,
            "startTime": start_time.strftime("%Y-%m-%d %H:%M:%S"),
            "endTime": end_time.strftime("%Y-%m-%d %H:%M:%S"),
        }
        encryption = encrypt_payload(payload, token)
        body = {"encryption": encryption}
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(url, json=body)
        resp.raise_for_status()
        data = resp.json()
        if data.get("code") != "00000":
            raise CityTagError(data.get("msg") or "CityTag history request failed")
        encrypted_data = data.get("data")
        if not encrypted_data:
            return []
        decrypted = decrypt_payload(encrypted_data, token)
        if isinstance(decrypted, dict):
            for key in ("history", "list", "points", "records", "data"):
                value = decrypted.get(key)
                if isinstance(value, list):
                    return [item for item in value if isinstance(item, dict)]
        return []
