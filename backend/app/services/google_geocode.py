"""Google Maps reverse geocoding (worldwide fallback outside Pakistan)."""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Any, Dict, Optional

import httpx
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))

logger = logging.getLogger(__name__)

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


def _format_landmark(primary: Optional[str], secondary: Optional[str]) -> Optional[str]:
    if not primary:
        return None
    if secondary and str(secondary) != str(primary):
        return f"{primary} — {secondary}"
    return str(primary)


def _component_name(components: list[dict[str, Any]], *types: str) -> Optional[str]:
    for type_name in types:
        for component in components:
            if type_name in (component.get("types") or []):
                name = component.get("long_name")
                if name:
                    return str(name)
    return None


async def _google_nearest_poi(lat: float, lng: float, api_key: str) -> Optional[Dict[str, str]]:
    params = {
        "location": f"{lat},{lng}",
        "radius": 150,
        "key": api_key,
    }
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                "https://maps.googleapis.com/maps/api/place/nearbysearch/json",
                params=params,
            )
        resp.raise_for_status()
        payload = resp.json()
        if payload.get("status") not in ("OK", "ZERO_RESULTS"):
            return None
        results = payload.get("results") or []
        if not results:
            return None
        name = results[0].get("name")
        return {"name": str(name)} if name else None
    except Exception as exc:
        logger.warning("google_poi failed lat=%s lng=%s err=%s", lat, lng, exc)
        return None


async def _google_reverse_area(lat: float, lng: float, api_key: str) -> Optional[Dict[str, Optional[str]]]:
    params = {"latlng": f"{lat},{lng}", "key": api_key}
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                "https://maps.googleapis.com/maps/api/geocode/json",
                params=params,
            )
        resp.raise_for_status()
        payload = resp.json()
        if payload.get("status") != "OK":
            return None
        results = payload.get("results") or []
        if not results:
            return None
        components = results[0].get("address_components") or []
        area = _component_name(
            components,
            "neighborhood",
            "sublocality",
            "sublocality_level_1",
            "locality",
        )
        if not area:
            return None
        place = _component_name(components, "locality", "administrative_area_level_1")
        secondary = place if place and place != area else None
        return {"area": area, "secondary": secondary}
    except Exception as exc:
        logger.warning("google_geocode failed lat=%s lng=%s err=%s", lat, lng, exc)
        return None


async def google_reverse_geocode(lat: float, lng: float) -> Optional[str]:
    """Reverse geocode via Google Places + Geocoding APIs."""
    if lat == 0.0 and lng == 0.0:
        return None

    key = _cache_key(lat, lng)
    if key in _cache:
        return _cache[key]

    api_key = _env_strip("GOOGLE_MAPS_API_KEY")
    if not api_key:
        logger.warning("google_geocode skipped: GOOGLE_MAPS_API_KEY not set")
        _cache[key] = None
        return None

    poi, area = await asyncio.gather(
        _google_nearest_poi(lat, lng, api_key),
        _google_reverse_area(lat, lng, api_key),
    )

    landmark = None
    if poi:
        landmark = _format_landmark(poi.get("name"), area.get("area") if area else None)
    elif area:
        landmark = _format_landmark(area.get("area"), area.get("secondary"))

    _cache[key] = landmark
    return landmark
