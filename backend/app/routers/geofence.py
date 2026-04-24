# backend/app/routers/geofence.py
from __future__ import annotations

import asyncio
import logging
from typing import Annotated, Union

from fastapi import APIRouter, Depends, HTTPException
from bson import ObjectId

from app.dependencies import get_current_account, get_mongo_service
from app.models.admin import AdminInDB
from app.models.user import UserInDB
from app.services.mongodb import MongoService
from app.services.geofence import compute_device_zone_status, compute_zone_events
from app.data.kml_zones import KML_POLYGONS

router = APIRouter(prefix="/api/geofence", tags=["geofence"])
logger = logging.getLogger(__name__)


def _to_oid(v):
    try:
        return ObjectId(str(v))
    except Exception:
        return None


async def _get_assigned_devices(account, mongo: MongoService):
    """Return device docs that have a valid KML zone assigned."""
    if isinstance(account, AdminInDB):
        filter_q = {"admin_id": account.id, "zone": {"$in": list(KML_POLYGONS.keys())}}
    else:
        filter_q = {"user_id": account.id, "zone": {"$in": list(KML_POLYGONS.keys())}}
    return await mongo.devices.find(
        filter_q, {"sn": 1, "zone": 1, "name": 1, "user_id": 1}
    ).to_list(500)


# ── GET /api/geofence/status ──────────────────────────────────────────────────

@router.get("/status")
async def get_geofence_status(
    account: Annotated[Union[AdminInDB, UserInDB], Depends(get_current_account)],
    mongo:   Annotated[MongoService, Depends(get_mongo_service)],
):
    """
    For every device that has a KML zone assigned, compute INSIDE/OUTSIDE/OFFLINE.
    Returns: { zones: { zone_id: [{ sn, status, latest, first_seen, last_seen }] } }
    The frontend merges user_name from its DeviceCache.
    """
    device_docs = await _get_assigned_devices(account, mongo)
    if not device_docs:
        return {"zones": {}}

    tasks = [
        compute_device_zone_status(doc["sn"], KML_POLYGONS[doc["zone"]], mongo.locations)
        for doc in device_docs
    ]
    statuses = await asyncio.gather(*tasks, return_exceptions=True)

    zones: dict = {}
    for doc, status in zip(device_docs, statuses):
        if isinstance(status, Exception):
            logger.warning("Status computation failed for sn=%s: %s", doc["sn"], status)
            status = {"status": "OFFLINE", "latest": None, "first_seen": None, "last_seen": None}

        zone_id = doc["zone"]
        if zone_id not in zones:
            zones[zone_id] = []
        zones[zone_id].append({"sn": doc["sn"], **status})

    return {"zones": zones}


# ── GET /api/geofence/report/{zone_id} ───────────────────────────────────────

@router.get("/report/{zone_id}")
async def get_zone_report(
    zone_id: str,
    account: Annotated[Union[AdminInDB, UserInDB], Depends(get_current_account)],
    mongo:   Annotated[MongoService, Depends(get_mongo_service)],
):
    """
    Returns ENTER/EXIT event log for all devices assigned to the zone.
    If no data exists, returns empty events list.
    """
    if zone_id not in KML_POLYGONS:
        raise HTTPException(status_code=404, detail="Zone not found")

    device_docs  = await _get_assigned_devices(account, mongo)
    zone_devices = [d for d in device_docs if d["zone"] == zone_id]

    if not zone_devices:
        return {"zone_id": zone_id, "events": [], "first_seen": None, "last_seen": None}

    polygon = KML_POLYGONS[zone_id]

    all_events_tasks = [
        compute_zone_events(doc["sn"], polygon, mongo.locations)
        for doc in zone_devices
    ]
    results = await asyncio.gather(*all_events_tasks, return_exceptions=True)

    all_events = []
    for events in results:
        if isinstance(events, list):
            all_events.extend(events)

    all_events.sort(key=lambda e: e["timestamp"] or "")

    first_seen = all_events[0]["timestamp"] if all_events else None
    last_seen  = all_events[-1]["timestamp"] if all_events else None

    return {
        "zone_id":    zone_id,
        "events":     all_events,
        "first_seen": first_seen,
        "last_seen":  last_seen,
    }
