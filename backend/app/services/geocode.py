"""Unified reverse geocoding — TPL Maps inside Pakistan, Google Maps worldwide."""

from __future__ import annotations

from typing import Optional

from app.services.google_geocode import google_reverse_geocode
from app.services.tpl_geocode import tpl_reverse_geocode

# Match frontend insidePakistan() bounding box.
PAK = {"min_lat": 23.5, "max_lat": 37.5, "min_lng": 60.5, "max_lng": 77.5}


def inside_pakistan(lat: float, lng: float) -> bool:
    return (
        lat >= PAK["min_lat"]
        and lat <= PAK["max_lat"]
        and lng >= PAK["min_lng"]
        and lng <= PAK["max_lng"]
    )


async def reverse_geocode(lat: float, lng: float) -> Optional[str]:
    """Pick TPL Maps for Pakistan, Google Maps elsewhere."""
    if lat == 0.0 and lng == 0.0:
        return None
    if inside_pakistan(lat, lng):
        return await tpl_reverse_geocode(lat, lng)
    return await google_reverse_geocode(lat, lng)
