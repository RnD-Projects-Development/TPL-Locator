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

router = APIRouter(prefix="/api/geofence", tags=["geofence"])
logger = logging.getLogger(__name__)


def _to_oid(v):
    try:
        return ObjectId(str(v))
    except Exception:
        return None


async def _admin_scope_oid(account, mongo: MongoService) -> Optional[ObjectId]:
    """The admin_id whose zones/devices this account may see."""
    if isinstance(account, AdminInDB):
        return _to_oid(account.id)
    if getattr(account, "admin_id", None):
        return _to_oid(account.admin_id)
    dev = await mongo.devices.find_one({"user_id": _to_oid(account.id)}, {"admin_id": 1})
    if dev and dev.get("admin_id"):
        return _to_oid(dev["admin_id"])
    return None


async def _user_own_sns(account, mongo: MongoService) -> set:
    docs = await mongo.devices.find({"user_id": _to_oid(account.id)}, {"sn": 1}).to_list(1000)
    return {d["sn"] for d in docs if d.get("sn")}


async def _mongo_zone_targets(account, mongo: MongoService) -> list[tuple[str, list, list[str], str]]:
    """
    Every zone in scope that has both a polygon and devices.

    Users are narrowed to their own devices within each zone.
    """
    admin_oid = await _admin_scope_oid(account, mongo)
    if not admin_oid:
        return []

    own_sns = None if isinstance(account, AdminInDB) else await _user_own_sns(account, mongo)

    targets: list[tuple[str, list, list[str], str]] = []
    async for doc in mongo.zones.find({"admin_id": admin_oid}):
        coords = doc.get("coordinates") or []
        sns = doc.get("device_sns") or []
        if own_sns is not None:
            sns = [s for s in sns if s in own_sns]
        if not coords or not sns:
            continue
        targets.append((str(doc["_id"]), coords, sns, doc.get("name") or str(doc["_id"])))
    return targets


async def _resolve_zone(zone_id: str, account, mongo: MongoService):
    """
    Resolve a zone id (Mongo ObjectId hex) to (polygon, sns, name).

    Returns None when the zone does not exist or is out of this account's scope,
    so callers can 404 uniformly.
    """
    oid = _to_oid(zone_id)
    if not oid:
        return None

    admin_oid = await _admin_scope_oid(account, mongo)
    if not admin_oid:
        return None

    doc = await mongo.zones.find_one({"_id": oid, "admin_id": admin_oid})
    if not doc:
        return None

    sns = doc.get("device_sns") or []
    if not isinstance(account, AdminInDB):
        own = await _user_own_sns(account, mongo)
        is_user_zone = (doc.get("user_id") == _to_oid(account.id))
        matching_sns = [s for s in sns if s in own]
        if not is_user_zone and not matching_sns:
            return None
        sns = matching_sns

    return (doc.get("coordinates") or []), sns, (doc.get("name") or zone_id)


def _check_geofence_access(account):
    if isinstance(account, AdminInDB):
        return
    if not (getattr(account, "geofence_access", False) or getattr(account, "geofence_create_access", False) or getattr(account, "fence_create_access", False)):
        raise HTTPException(
            status_code=403,
            detail="Geofence access is not enabled for your account. Please contact an administrator.",
        )


# ── GET /api/geofence/debug ──────────────────────────────────────────────────
@router.get("/debug")
async def geofence_debug(
    account: Annotated[Union[AdminInDB, UserInDB], Depends(get_current_account)],
    mongo:   Annotated[MongoService, Depends(get_mongo_service)],
):
    """Diagnostic: shows which zones and devices this token resolves to."""
    _check_geofence_access(account)
    role = "admin" if isinstance(account, AdminInDB) else "user"

    # Raw user doc from DB (unfiltered by Pydantic)
    raw_user = None
    if role == "user":
        raw_user = await mongo.accounts.find_one({"_id": _to_oid(account.id), "role": "user"}, {"admin_id": 1, "devices": 1})

    admin_oid = await _admin_scope_oid(account, mongo)
    targets = await _mongo_zone_targets(account, mongo)

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
        "admin_scope_oid":         str(admin_oid) if admin_oid else "UNRESOLVED",
        "zones_found":             len(targets),
        "zone_devices_found":      sum(len(sns) for _zid, _poly, sns, _name in targets),
        "zones": [
            {"zone_id": zid, "name": name, "device_sns": sns, "polygon_points": len(poly)}
            for zid, poly, sns, name in targets
        ],
    }


# ── GET /api/geofence/status ──────────────────────────────────────────────────

@router.get("/status")
async def get_geofence_status(
    account: Annotated[Union[AdminInDB, UserInDB], Depends(get_current_account)],
    mongo:   Annotated[MongoService, Depends(get_mongo_service)],
    zone_id: Optional[str] = Query(default=None, description="Scope to a single zone"),
):
    """
    For every device assigned to a zone, compute INSIDE/OUTSIDE/OFFLINE.

    Returns: {
      zones:      { zone_id: [{ sn, status, latest, first_seen, last_seen }] },
      zone_names: { zone_id: "Display name" },
    }
    The frontend merges user_name from its DeviceCache.
    """
    _check_geofence_access(account)
    # (sn, zone_id, polygon) — a device can belong to multiple zones
    pairs: list[tuple[str, str, list]] = []
    zone_names: dict[str, str] = {}

    # ── Single-zone fast path ─────────────────────────────────────────────────
    # Live monitoring polls this every minute; without scoping it would walk
    # every zone the admin owns on each tick.
    if zone_id and zone_id.strip():
        resolved = await _resolve_zone(zone_id.strip(), account, mongo)
        if resolved is None:
            raise HTTPException(status_code=404, detail="Zone not found")
        polygon, sns, name = resolved
        zone_names[zone_id.strip()] = name
        pairs = [(sn, zone_id.strip(), polygon) for sn in sns] if polygon else []
    else:
        # ── Every zone in scope ───────────────────────────────────────────────
        for zid, polygon, sns, name in await _mongo_zone_targets(account, mongo):
            zone_names.setdefault(zid, name)
            for sn in sns:
                pairs.append((sn, zid, polygon))

    if not pairs:
        # Keep zone_names so a zone with no devices still resolves to its label.
        return {"zones": {}, "zone_names": zone_names}

    tasks = [
        compute_device_zone_status(sn, polygon, mongo.locations)
        for sn, _zid, polygon in pairs
    ]
    statuses = await asyncio.gather(*tasks, return_exceptions=True)

    zones: dict = {}
    for (sn, zid, _polygon), status in zip(pairs, statuses):
        if isinstance(status, Exception):
            logger.warning("Status computation failed for sn=%s zone=%s: %s", sn, zid, status)
            status = {"status": "OFFLINE", "latest": None, "first_seen": None, "last_seen": None}
        if zid not in zones:
            zones[zid] = []
        zones[zid].append({"sn": sn, **status})

    logger.info("[geofence] status actor=%s zones=%d pairs=%d", account.email, len(zones), len(pairs))
    return {"zones": zones, "zone_names": zone_names}


# ── GET /api/geofence/report/{zone_id} ───────────────────────────────────────

@router.get("/report/{zone_id}")
async def get_zone_report(
    zone_id: str,
    account: Annotated[Union[AdminInDB, UserInDB], Depends(get_current_account)],
    mongo:   Annotated[MongoService, Depends(get_mongo_service)],
    start:   Optional[datetime] = Query(default=None),
    end:     Optional[datetime] = Query(default=None),
):
    """
    Returns the ENTER/EXIT event log for all devices assigned to the zone.

    Pass start/end to scope the walk to a window — without them every call re-reads each device's
    full history, which is wasteful for pollers that only want recent crossings.
    """
    _check_geofence_access(account)
    resolved = await _resolve_zone(zone_id, account, mongo)
    if resolved is None:
        raise HTTPException(status_code=404, detail="Zone not found")

    polygon, sns, zone_name = resolved

    if not polygon or not sns:
        return {"zone_id": zone_id, "zone_name": zone_name, "events": [], "first_seen": None, "last_seen": None}

    all_events_tasks = [
        compute_zone_events(sn, polygon, mongo.locations, start=start, end=end)
        for sn in sns
    ]
    results = await asyncio.gather(*all_events_tasks, return_exceptions=True)

    all_events = []
    for events in results:
        if isinstance(events, list):
            all_events.extend(events)

    all_events.sort(key=lambda e: e["timestamp"] or "")

    first_seen = all_events[0]["timestamp"] if all_events else None
    last_seen  = all_events[-1]["timestamp"] if all_events else None

    logger.info("[geofence] report zone=%s actor=%s devices=%d events=%d",
                zone_id, account.email, len(sns), len(all_events))

    return {
        "zone_id":    zone_id,
        "zone_name":  zone_name,
        "events":     all_events,
        "first_seen": first_seen,
        "last_seen":  last_seen,
    }


# ── GET /api/geofence/tracks/{zone_id} ───────────────────────────────────────

POINTS_PER_DEVICE_CAP = 5000


async def _fetch_points_for_sns(sns: list[str], mongo: MongoService, start: datetime, end: datetime) -> list[dict]:
    """Query mongo.locations for each SN and return [{sn, points}] list.

    Points come back oldest-first, but the query itself sorts newest-first so
    that when a device has more reports than POINTS_PER_DEVICE_CAP the cap drops
    the *oldest* points rather than the most recent ones. The frontend decides
    in/out-of-zone from the newest report, so silently truncating the recent end
    of the track would flip that badge to a stale answer.
    """
    result_devices = []
    for sn in sns:
        try:
            total_in_range = await mongo.locations.count_documents(
                {"sn": sn, "timestamp": {"$gte": start, "$lte": end}}
            )
            cursor = (
                mongo.locations
                .find(
                    {"sn": sn, "timestamp": {"$gte": start, "$lte": end}},
                    {"lat": 1, "lng": 1, "timestamp": 1, "_id": 0},
                )
                .sort("timestamp", -1)
                .limit(POINTS_PER_DEVICE_CAP)
            )
            points_raw = await cursor.to_list(length=POINTS_PER_DEVICE_CAP)
            points_raw.reverse()  # back to chronological order for the client
            points = [
                {
                    "lat":       p["lat"],
                    "lng":       p["lng"],
                    "timestamp": p["timestamp"].isoformat() if isinstance(p["timestamp"], datetime) else str(p["timestamp"]),
                }
                for p in points_raw
                if p.get("lat") is not None and p.get("lng") is not None
            ]
            truncated = max(0, total_in_range - len(points_raw))
            if truncated:
                logger.warning(
                    "[tracks] device sn=%s truncated=%d (in_range=%d cap=%d) — oldest points dropped",
                    sn, truncated, total_in_range, POINTS_PER_DEVICE_CAP,
                )
            logger.info(
                "[tracks] device sn=%s in_range=%d points_raw=%d points_clean=%d",
                sn, total_in_range, len(points_raw), len(points),
            )
            result_devices.append({"sn": sn, "points": points, "truncated": truncated})
        except Exception as exc:
            logger.error("[tracks] device_error sn=%s error=%s", sn, exc)
            result_devices.append({"sn": sn, "points": [], "error": str(exc)})
    return result_devices


@router.get("/tracks/{zone_id}")
async def get_zone_tracks(
    zone_id: str,
    account: Annotated[Union[AdminInDB, UserInDB], Depends(get_current_account)],
    mongo:   Annotated[MongoService, Depends(get_mongo_service)],
    start:   Optional[datetime] = Query(default=None),
    end:     Optional[datetime] = Query(default=None),
):
    """
    Return all raw GPS points (lat, lng, timestamp) from the locations table
    for every device assigned to the zone (24-char hex ObjectId).

    Debug logs:
        [tracks] role  actor  zone  admin_scope
        [tracks] device sn  points_in_range  points_returned
        [tracks] done  zone  total_points
    """
    _check_geofence_access(account)
    role = "admin" if isinstance(account, AdminInDB) else "user"

    # Default: last 7 days (frontend sends explicit start/end via TRACK_RANGES)
    if end is None:
        end = datetime.now(tz=timezone.utc)
    if start is None:
        start = end - timedelta(days=7)

    admin_scope = str(account.id) if isinstance(account, AdminInDB) else str(getattr(account, "admin_id", "none"))
    logger.info("[tracks] role=%s actor=%s zone=%s admin_scope=%s start=%s end=%s",
                role, account.email, zone_id, admin_scope, start.isoformat(), end.isoformat())

    resolved = await _resolve_zone(zone_id, account, mongo)
    if resolved is None:
        logger.warning("[tracks] zone_not_found zone=%s actor=%s", zone_id, account.email)
        raise HTTPException(status_code=404, detail="Zone not found")

    _polygon, sns, zone_name = resolved
    logger.info("[tracks] zone=%s name=%s devices_in_zone=%d", zone_id, zone_name, len(sns))

    if not sns:
        return {"zone_id": zone_id, "zone_name": zone_name, "devices": []}

    devices = await _fetch_points_for_sns(sns, mongo, start, end)
    return {"zone_id": zone_id, "zone_name": zone_name, "devices": devices}
