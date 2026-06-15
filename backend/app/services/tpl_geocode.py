"""TPL Maps reverse geocoding via REST API."""

from __future__ import annotations

import logging
import os
from typing import Any, Dict, List, Optional, Union

import httpx
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))

logger = logging.getLogger(__name__)

DEFAULT_RGEOCODE_URL = "https://api1.tplmaps.com:8888/search/rgeocode"
_cache: dict[str, Optional[str]] = {}


def _env_strip(key: str) -> Optional[str]:
    raw = os.getenv(key)
    if raw is None:
        return None
    s = str(raw).strip()
    if len(s) >= 2 and ((s[0] == s[-1] == '"') or (s[0] == s[-1] == "'")):
        s = s[1:-1].strip()
    return s or None


def _cache_key(lat: float, lng: float) -> str:
    return f"{lat:.5f},{lng:.5f}"


def parse_landmark_record(data: Dict[str, Any]) -> Optional[str]:
    """Match frontend tplGeocode.js label logic."""
    name = data.get("name") or None
    street = data.get("address") or None
    area = data.get("parent") or None
    city = data.get("parent2") or None

    primary = name or street or area or city
    if not primary:
        return None

    if name:
        secondary = street or (f"{area}, {city}" if area and city else area or city)
    else:
        secondary = f"{area}, {city}" if area and city else area or city

    if secondary and str(secondary) != str(primary):
        return f"{primary} — {secondary}"
    return str(primary)


def _normalize_records(payload: Union[list, dict, None]) -> List[Dict[str, Any]]:
    if payload is None:
        return []
    if isinstance(payload, list):
        return [x for x in payload if isinstance(x, dict)]
    if isinstance(payload, dict):
        for key in ("data", "results", "features"):
            nested = payload.get(key)
            if isinstance(nested, list):
                return [x for x in nested if isinstance(x, dict)]
        return [payload]
    return []


async def reverse_geocode(lat: float, lng: float) -> Optional[str]:
    """Reverse geocode lat/lng to a human-readable landmark string."""
    if lat == 0.0 and lng == 0.0:
        return None

    key = _cache_key(lat, lng)
    if key in _cache:
        return _cache[key]

    api_key = _env_strip("TPL_MAPS_API_KEY")
    if not api_key:
        logger.warning("tpl_geocode skipped: TPL_MAPS_API_KEY not set")
        _cache[key] = None
        return None

    base_url = _env_strip("TPL_MAPS_RGEOCODE_URL") or DEFAULT_RGEOCODE_URL
    params = {"point": f"{lat};{lng}", "apikey": api_key}

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(base_url, params=params)
        resp.raise_for_status()
        payload = resp.json()
    except Exception as exc:
        logger.warning("tpl_geocode failed lat=%s lng=%s err=%s", lat, lng, exc)
        _cache[key] = None
        return None

    records = _normalize_records(payload)
    landmark = parse_landmark_record(records[0]) if records else None
    _cache[key] = landmark
    return landmark
