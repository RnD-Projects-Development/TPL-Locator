# backend/app/routers/geofence.py
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Annotated, Optional, Union

from fastapi import APIRouter, Depends, HTTPException, Query
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
    """
    Return device docs that have a valid KML zone assigned.
    Admins → scoped by their own admin_id.
    Users  → scoped by their parent admin's admin_id (4-tier fallback).
    """
    ZONE_KEYS = list(KML_POLYGONS.keys())
    PROJ = {"sn": 1, "zone": 1, "fence_zone_ids": 1, "name": 1, "user_id": 1, "admin_id": 1}
    user_oid = _to_oid(account.id)
    zone_filter = {"$or": [{"fence_zone_ids": {"$in": ZONE_KEYS}}, {"zone": {"$in": ZONE_KEYS}}]}

    # ── Admin: direct query ────────────────────────────────────────────────────
    if isinstance(account, AdminInDB):
        admin_oid = _to_oid(account.id)
        results = await mongo.devices.find(
            {"admin_id": admin_oid, **zone_filter}, PROJ
        ).to_list(500)
        logger.info("[geofence] admin=%s zone_devices=%d", account.email, len(results))
        return results

    # ── User: find parent admin_id via 4 independent methods ──────────────────
    admin_oid = None

    # Method 1: admin_id field on Pydantic model (set by update_user_admin)
    if account.admin_id:
        admin_oid = _to_oid(account.admin_id)
        logger.info("[geofence] user=%s method=model admin_oid=%s", account.email, admin_oid)

    # Method 2: re-fetch user doc directly from DB (bypass Pydantic deserialization)
    if not admin_oid:
        raw = await mongo.users.find_one({"_id": user_oid}, {"admin_id": 1})
        if raw and raw.get("admin_id"):
            admin_oid = _to_oid(raw["admin_id"])
            logger.info("[geofence] user=%s method=db_refetch admin_oid=%s", account.email, admin_oid)

    # Method 3: find any device directly assigned to this user (user_id on device)
    if not admin_oid:
        dev = await mongo.devices.find_one({"user_id": user_oid}, {"admin_id": 1})
        if dev and dev.get("admin_id"):
            admin_oid = _to_oid(dev["admin_id"])
            logger.info("[geofence] user=%s method=device_user_id admin_oid=%s", account.email, admin_oid)

    # Method 4: check devices from account.devices ObjectId list
    if not admin_oid and account.devices:
        dev = await mongo.devices.find_one(
            {"_id": {"$in": [_to_oid(d) for d in account.devices if d]}},
            {"admin_id": 1},
        )
        if dev and dev.get("admin_id"):
            admin_oid = _to_oid(dev["admin_id"])
            logger.info("[geofence] user=%s method=account_devices admin_oid=%s", account.email, admin_oid)

    if not admin_oid:
        logger.error(
            "[geofence] user=%s id=%s — all 4 methods failed to resolve admin_id. "
            "Check that this user was created via the admin panel (update_user_admin must have been called).",
            account.email, account.id,
        )
        return []

    results = await mongo.devices.find(
        {"admin_id": admin_oid, "user_id": user_oid, **zone_filter}, PROJ
    ).to_list(500)
    logger.info("[geofence] user=%s admin_oid=%s zone_devices=%d", account.email, admin_oid, len(results))
    return results


# ── GET /api/geofence/debug ──────────────────────────────────────────────────
@router.get("/debug")
async def geofence_debug(
    account: Annotated[Union[AdminInDB, UserInDB], Depends(get_current_account)],
    mongo:   Annotated[MongoService, Depends(get_mongo_service)],
):
    """Diagnostic: shows what _get_assigned_devices resolves for this token."""
    role = "admin" if isinstance(account, AdminInDB) else "user"

    # Raw user doc from DB (unfiltered by Pydantic)
    raw_user = None
    if role == "user":
        raw_user = await mongo.users.find_one({"_id": _to_oid(account.id)}, {"admin_id": 1, "devices": 1})

    devices = await _get_assigned_devices(account, mongo)

    return {
        "role":                    role,
        "account_id":              str(account.id),
        "account_email":           account.email,
        # For users — shows what the DB actually stores
        "db_admin_id":             str(raw_user.get("admin_id", "NOT_SET")) if raw_user else "n/a",
        "db_devices_count":        len(raw_user.get("devices", [])) if raw_user else "n/a",
        # What Pydantic model gives us
        "model_admin_id":          str(getattr(account, "admin_id", "n/a")),
        # Result
        "zone_devices_found":      len(devices),
        "devices": [
            {"sn": d["sn"], "fence_zone_ids": d.get("fence_zone_ids") or [], "zone": d.get("zone"), "admin_id": str(d.get("admin_id", ""))}
            for d in devices
        ],
    }


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

    # Build (sn, zone_id) pairs — a device can belong to multiple zones
    pairs: list[tuple[str, str]] = []
    for doc in device_docs:
        sn = doc["sn"]
        assigned = doc.get("fence_zone_ids") or []
        if not assigned and doc.get("zone"):
            assigned = [doc["zone"]]  # backward compat: old single-zone field
        for zone_id in assigned:
            if zone_id in KML_POLYGONS:
                pairs.append((sn, zone_id))

    if not pairs:
        return {"zones": {}}

    tasks = [
        compute_device_zone_status(sn, KML_POLYGONS[zone_id], mongo.locations)
        for sn, zone_id in pairs
    ]
    statuses = await asyncio.gather(*tasks, return_exceptions=True)

    zones: dict = {}
    for (sn, zone_id), status in zip(pairs, statuses):
        if isinstance(status, Exception):
            logger.warning("Status computation failed for sn=%s zone=%s: %s", sn, zone_id, status)
            status = {"status": "OFFLINE", "latest": None, "first_seen": None, "last_seen": None}
        if zone_id not in zones:
            zones[zone_id] = []
        zones[zone_id].append({"sn": sn, **status})

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
    zone_devices = [
        d for d in device_docs
        if zone_id in (d.get("fence_zone_ids") or []) or d.get("zone") == zone_id
    ]

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


# ── GET /api/geofence/tracks/{zone_id} ───────────────────────────────────────

@router.get("/tracks/{zone_id}")
async def get_zone_tracks(
    zone_id: str,
    account: Annotated[Union[AdminInDB, UserInDB], Depends(get_current_account)],
    mongo:   Annotated[MongoService, Depends(get_mongo_service)],
    start:   Optional[datetime] = Query(default=None),
    end:     Optional[datetime] = Query(default=None),
):
    """
    Return all raw GPS points (lat, lng, timestamp) for every device
    assigned to the zone, accessible by both admins and users.

    Users are scoped to their parent admin's devices so they see all zone
    devices — not just the single device bound to their account.

    Debug logs:
        [tracks] role  actor  zone  admin_scope
        [tracks] device sn  points_in_range  points_returned
        [tracks] done  zone  total_points
    """
    role = "admin" if isinstance(account, AdminInDB) else "user"

    if zone_id not in KML_POLYGONS:
        logger.warning("[tracks] zone_not_found zone=%s actor=%s", zone_id, account.email)
        raise HTTPException(status_code=404, detail="Zone not found")

    # Default: last 30 days
    if end is None:
        end = datetime.now(tz=timezone.utc)
    if start is None:
        start = end - timedelta(days=30)

    admin_scope = str(account.id) if isinstance(account, AdminInDB) else str(getattr(account, "admin_id", "none"))
    logger.info("[tracks] role=%s actor=%s zone=%s admin_scope=%s start=%s end=%s",
                role, account.email, zone_id, admin_scope, start.isoformat(), end.isoformat())

    device_docs  = await _get_assigned_devices(account, mongo)
    zone_devices = [
        d for d in device_docs
        if zone_id in (d.get("fence_zone_ids") or []) or d.get("zone") == zone_id
    ]

    logger.info("[tracks] zone=%s devices_in_zone=%d", zone_id, len(zone_devices))

    if not zone_devices:
        logger.info("[tracks] no_devices zone=%s role=%s admin_scope=%s", zone_id, role, admin_scope)
        return {"zone_id": zone_id, "devices": []}

    result_devices = []
    total_points   = 0

    for doc in zone_devices:
        sn = doc["sn"]
        try:
            cursor = (
                mongo.locations
                .find(
                    {"sn": sn, "timestamp": {"$gte": start, "$lte": end}},
                    {"lat": 1, "lng": 1, "timestamp": 1, "_id": 0},
                )
                .sort("timestamp", 1)
                .limit(5000)
            )
            points_raw = await cursor.to_list(length=5000)
            points = [
                {
                    "lat":       p["lat"],
                    "lng":       p["lng"],
                    "timestamp": p["timestamp"].isoformat() if isinstance(p["timestamp"], datetime) else str(p["timestamp"]),
                }
                for p in points_raw
                if p.get("lat") is not None and p.get("lng") is not None
            ]
            logger.info("[tracks] device sn=%s points_raw=%d points_clean=%d", sn, len(points_raw), len(points))
            result_devices.append({"sn": sn, "points": points})
            total_points += len(points)
        except Exception as exc:
            logger.error("[tracks] device_error sn=%s error=%s", sn, exc)
            result_devices.append({"sn": sn, "points": [], "error": str(exc)})

    logger.info("[tracks] done zone=%s total_points=%d", zone_id, total_points)
    return {"zone_id": zone_id, "devices": result_devices}
