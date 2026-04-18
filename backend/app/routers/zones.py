# app/routers/zones.py
"""
GET /api/devices/{sn}/zones?start=<ISO>&end=<ISO>

Runs the zone pipeline synchronously (clustering is pure-Python and fast
enough that a queue is unnecessary). Returns polygons + centres + visit
points. The frontend names each zone using TPLMaps reverse geocoding.
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Annotated, List, Optional, Union

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.dependencies import get_current_account, get_mongo_service
from app.models.admin import AdminInDB
from app.models.user import UserInDB
from app.services.mongodb import MongoService
from app.services.zone_pipeline import process_zones_for_device

router = APIRouter(prefix="/api", tags=["zones"])
logger = logging.getLogger(__name__)


# ── Response models ───────────────────────────────────────────────────────────

class LatLng(BaseModel):
    lat: float
    lng: float


class ZoneVisit(BaseModel):
    lat:       float
    lng:       float
    timestamp: Optional[str] = None


class Zone(BaseModel):
    zone_id:      str
    polygon:      List[LatLng]
    center:       LatLng
    points:       List[ZoneVisit]
    total_points: int
    first_seen:   Optional[str] = None
    last_seen:    Optional[str] = None
    zone_key:     Optional[str] = None


class ZonesResponse(BaseModel):
    zones:     List[Zone]
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
    Returns activity zones for a device within a time window.

    Pipeline (synchronous):
      1. Fetch GPS points for sn in [start, end]
      2. Cluster (existing logic — not modified)
      3. Assign zone_id + zone_key onto points via bulkWrite
         (skipped if the point already has the same zone_key)
      4. Persist zones summary on the device doc
      5. Return zones (frontend names them via TPLMaps)
    """
    logger.info(
        "get_device_zones sn=%s start=%s end=%s actor=%s",
        sn, start, end, account.email,
    )
    await _assert_device_access(sn, account, mongo)

    zones = await process_zones_for_device(
        sn=sn,
        start=start,
        end=end,
        locations_col=mongo.locations,
        devices_col=mongo.devices,
    )

    return ZonesResponse(zones=zones, device_sn=sn)
