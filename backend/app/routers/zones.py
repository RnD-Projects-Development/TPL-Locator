# app/routers/zones.py
"""
GET /api/devices/{sn}/zones?start=<ISO>&end=<ISO>

Derives activity zones for a device by clustering its GPS points within the
requested time window. No static zone database — computed on-the-fly.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Annotated, Optional, Union

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.dependencies import get_current_account, get_mongo_service
from app.models.admin import AdminInDB
from app.models.user import UserInDB
from app.services.mongodb import MongoService
from app.services.zone_clustering import MAX_POINTS, cluster_gps_points

router = APIRouter(prefix="/api", tags=["zones"])
logger = logging.getLogger(__name__)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _to_naive_utc(dt: datetime) -> datetime:
    """Strip timezone after converting to UTC (stored timestamps are naive UTC)."""
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


# ── Response models ───────────────────────────────────────────────────────────

class LatLng(BaseModel):
    lat: float
    lng: float


class ZoneVisit(BaseModel):
    lat:       float
    lng:       float
    timestamp: str | None = None


class Zone(BaseModel):
    zone_id:      str
    name:         str
    polygon:      list[LatLng]    # convex-hull boundary vertices
    center:       LatLng
    points:       list[ZoneVisit] # GPS visit points inside the zone
    total_points: int
    first_seen:   str | None      # oldest recorded fix inside this zone
    last_seen:    str | None      # newest recorded fix inside this zone


class ZonesResponse(BaseModel):
    zones:     list[Zone]
    device_sn: str


# ── Auth helper ───────────────────────────────────────────────────────────────

async def _assert_device_access(
    sn: str,
    account: Union[AdminInDB, UserInDB],
    mongo: MongoService,
) -> None:
    device = await mongo.get_device_by_sn(sn)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    if isinstance(account, AdminInDB):
        if device.admin_id and str(device.admin_id) != str(account.id):
            raise HTTPException(status_code=403, detail="Access denied")
    else:
        if str(device.user_id) != str(account.id):
            raise HTTPException(status_code=403, detail="Device not assigned to you")


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.get("/devices/{sn}/zones", response_model=ZonesResponse)
async def get_device_zones(
    sn:      str,
    start:   Annotated[Optional[datetime], Query(description="Range start (ISO 8601)")] = None,
    end:     Annotated[Optional[datetime], Query(description="Range end (ISO 8601)")]   = None,
    account: Annotated[Union[AdminInDB, UserInDB], Depends(get_current_account)]        = None,
    mongo:   Annotated[MongoService, Depends(get_mongo_service)]                        = None,
):
    """
    Return auto-generated activity zones for a device within a time window.

    Zones are derived by:
      1. Fetching up to MAX_POINTS GPS fixes within [start, end] from MongoDB.
      2. Binning fixes into ~110 m grid cells; discarding sparse cells.
      3. Merging nearby dense cells (≤ 200 m) via union-find into clusters.
      4. Wrapping each cluster in a padded convex-hull polygon.

    The frontend reverse-geocodes each zone centre to get human-readable names.
    """
    logger.info(
        "get_device_zones started actor=%s sn=%s start=%s end=%s",
        account.email, sn, start, end,
    )

    await _assert_device_access(sn, account, mongo)

    # Build the MongoDB filter — timestamp range is optional
    query: dict = {
        "sn":  sn,
        "lat": {"$exists": True},
        "lng": {"$exists": True},
    }

    if start or end:
        ts_filter: dict = {}
        if start: ts_filter["$gte"] = _to_naive_utc(start)
        if end:   ts_filter["$lte"] = _to_naive_utc(end)
        query["timestamp"] = ts_filter

    cursor = mongo.locations.find(
        query,
        {"lat": 1, "lng": 1, "timestamp": 1, "_id": 0},
        sort=[("timestamp", -1)],
    ).limit(MAX_POINTS)

    raw = []
    async for doc in cursor:
        lat = doc.get("lat")
        lng = doc.get("lng")
        if lat is not None and lng is not None:
            raw.append({
                "lat":       float(lat),
                "lng":       float(lng),
                "timestamp": doc.get("timestamp"),
            })

    logger.info("get_device_zones fetched sn=%s points=%d", sn, len(raw))

    zones = cluster_gps_points(raw)

    logger.info("get_device_zones completed sn=%s zones=%d", sn, len(zones))
    return ZonesResponse(zones=zones, device_sn=sn)
