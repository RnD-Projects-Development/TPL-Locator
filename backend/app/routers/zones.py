from __future__ import annotations

import logging
from datetime import datetime
from typing import Annotated, List, Optional, Union

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.dependencies import get_current_account, get_mongo_service
from app.models.admin import AdminInDB
from app.models.user import UserInDB
from app.services.mongodb import MongoService

router = APIRouter(prefix="/api/zones", tags=["zones"])
logger = logging.getLogger(__name__)


def _to_oid(v):
    try:
        return ObjectId(str(v))
    except Exception:
        return None


def _zone_out(doc: dict) -> dict:
    zone_id = str(doc["_id"])
    coords = doc.get("coordinates") or []
    return {
        "zone_id":     zone_id,
        "name":        doc.get("name", ""),
        "company":     doc.get("company"),
        "color":       doc.get("color", "#C1121F"),
        "shape":       doc.get("shape", "polygon"),
        "coordinates": coords,
        "center":      doc.get("center"),
        "radius":      doc.get("radius"),
        "device_sns":  doc.get("device_sns") or [],
        "user_id":     str(doc["user_id"]) if doc.get("user_id") else None,
        # compat: zonePolygonManager reads zone.polygon, sidebar reads zone.beat
        "polygon":     coords,
        "beat":        doc.get("name", ""),
        "uc_name":     "",
        "tehsil":      "",
        "isUserZone":  True,
    }


async def _resolve_admin_scope(account, mongo: MongoService):
    """Resolve the admin_id a non-admin account is scoped under.

    Mirrors the fallback used in geofence._get_assigned_devices: prefer the
    admin_id already stamped on the account, else fall back to whichever
    admin owns a device already bound to this user.
    """
    if isinstance(account, AdminInDB):
        return _to_oid(account.id)
    if account.admin_id:
        return _to_oid(account.admin_id)
    user_oid = _to_oid(account.id)
    dev = await mongo.devices.find_one({"user_id": user_oid}, {"admin_id": 1})
    if dev and dev.get("admin_id"):
        return _to_oid(dev["admin_id"])
    return None


async def _zone_ownership_filter(oid, account, mongo: MongoService):
    """Query filter that scopes a zone lookup to what this account may touch.

    Admins may touch any zone under their admin_id; users may only touch
    zones they personally created. Returns None if a non-admin has no
    resolvable admin scope (i.e. they could not own any zone).
    """
    if isinstance(account, AdminInDB):
        return {"_id": oid, "admin_id": _to_oid(account.id)}
    admin_oid = await _resolve_admin_scope(account, mongo)
    if not admin_oid:
        return None
    return {"_id": oid, "admin_id": admin_oid, "user_id": _to_oid(account.id)}


class ZoneCreate(BaseModel):
    name: str
    company: Optional[str] = None
    color: str = "#C1121F"
    shape: str = "polygon"                    # "polygon" | "circle"
    coordinates: Optional[List[dict]] = None  # [{lat, lng}] for polygon
    center: Optional[dict] = None             # {lat, lng} for circle
    radius: Optional[float] = None            # metres for circle


class ZoneAssign(BaseModel):
    sn: str


@router.get("", response_model=List[dict])
async def list_zones(
    account: Annotated[Union[AdminInDB, UserInDB], Depends(get_current_account)],
    mongo:   Annotated[MongoService, Depends(get_mongo_service)],
):
    admin_oid = await _resolve_admin_scope(account, mongo)
    if not admin_oid:
        return []

    if isinstance(account, AdminInDB):
        # Admins see every zone created by themselves or any of their users.
        query = {"admin_id": admin_oid}
    else:
        # Users only ever see zones they personally created.
        query = {"admin_id": admin_oid, "user_id": _to_oid(account.id)}

    docs = await mongo.zones.find(query).to_list(500)
    return [_zone_out(d) for d in docs]


@router.post("", status_code=201)
async def create_zone(
    body:    ZoneCreate,
    account: Annotated[Union[AdminInDB, UserInDB], Depends(get_current_account)],
    mongo:   Annotated[MongoService, Depends(get_mongo_service)],
):
    admin_oid = await _resolve_admin_scope(account, mongo)
    if not admin_oid:
        raise HTTPException(status_code=400, detail="Bind a device before creating zones")

    user_oid = None if isinstance(account, AdminInDB) else _to_oid(account.id)
    doc = {
        "admin_id":    admin_oid,
        "user_id":     user_oid,
        "name":        body.name.strip(),
        "company":     body.company.strip() if body.company else None,
        "color":       body.color,
        "shape":       body.shape,
        "coordinates": body.coordinates,
        "center":      body.center,
        "radius":      body.radius,
        "device_sns":  [],
        "created_at":  datetime.utcnow(),
    }
    result = await mongo.zones.insert_one(doc)
    doc["_id"] = result.inserted_id
    logger.info("[zones] created zone_id=%s owner=%s", str(result.inserted_id), account.email)
    return _zone_out(doc)


@router.put("/{zone_id}")
async def update_zone(
    zone_id: str,
    body:    ZoneCreate,
    account: Annotated[Union[AdminInDB, UserInDB], Depends(get_current_account)],
    mongo:   Annotated[MongoService, Depends(get_mongo_service)],
):
    oid = _to_oid(zone_id)
    if not oid:
        raise HTTPException(status_code=404, detail="Invalid zone ID")

    query_filter = await _zone_ownership_filter(oid, account, mongo)
    if not query_filter:
        raise HTTPException(status_code=404, detail="Zone not found")

    updated = await mongo.zones.find_one_and_update(
        query_filter,
        {"$set": {
            "name":        body.name.strip(),
            "company":     body.company.strip() if body.company else None,
            "color":       body.color,
            "shape":       body.shape,
            "coordinates": body.coordinates,
            "center":      body.center,
            "radius":      body.radius,
            "updated_at":  datetime.utcnow(),
        }},
        return_document=True,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Zone not found")

    logger.info("[zones] updated zone_id=%s admin=%s", zone_id, account.email)
    return _zone_out(updated)


@router.delete("/{zone_id}", status_code=204)
async def delete_zone(
    zone_id: str,
    account: Annotated[Union[AdminInDB, UserInDB], Depends(get_current_account)],
    mongo:   Annotated[MongoService, Depends(get_mongo_service)],
):
    oid = _to_oid(zone_id)
    if not oid:
        raise HTTPException(status_code=404, detail="Invalid zone ID")

    query_filter = await _zone_ownership_filter(oid, account, mongo)
    if not query_filter:
        raise HTTPException(status_code=404, detail="Zone not found")

    result = await mongo.zones.delete_one(query_filter)
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Zone not found")

    # Remove this zone_id from whichever devices carried it. Scoped to the
    # zone's own device_sns rather than the whole admin fleet so a user
    # deleting their own zone can't touch devices outside their zone.
    await mongo.devices.update_many(
        {"fence_zone_ids": zone_id},
        {"$pull": {"fence_zone_ids": zone_id}},
    )
    logger.info("[zones] deleted zone_id=%s owner=%s", zone_id, account.email)


@router.post("/{zone_id}/assign", status_code=200)
async def assign_device_to_zone(
    zone_id: str,
    body:    ZoneAssign,
    account: Annotated[Union[AdminInDB, UserInDB], Depends(get_current_account)],
    mongo:   Annotated[MongoService, Depends(get_mongo_service)],
):
    oid = _to_oid(zone_id)
    if not oid:
        raise HTTPException(status_code=404, detail="Invalid zone ID")

    sn = body.sn.strip()
    if not sn:
        raise HTTPException(status_code=400, detail="Device SN is required")

    query_filter = await _zone_ownership_filter(oid, account, mongo)
    if not query_filter:
        raise HTTPException(status_code=404, detail="Zone not found")

    zone = await mongo.zones.find_one(query_filter)
    if not zone:
        raise HTTPException(status_code=404, detail="Zone not found")

    device = await mongo.devices.find_one({"sn": sn})
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    # Users may only assign devices bound to themselves into their own zone.
    if not isinstance(account, AdminInDB) and str(device.get("user_id")) != str(account.id):
        raise HTTPException(status_code=403, detail="You can only assign your own devices")

    await mongo.zones.update_one({"_id": oid}, {"$addToSet": {"device_sns": sn}})
    await mongo.devices.update_one({"sn": sn}, {"$addToSet": {"fence_zone_ids": zone_id}})
    logger.info("[zones] assigned sn=%s to zone_id=%s owner=%s", sn, zone_id, account.email)
    return {"status": "ok", "zone_id": zone_id, "sn": sn}


@router.delete("/{zone_id}/assign/{sn}", status_code=200)
async def unassign_device_from_zone(
    zone_id: str,
    sn:      str,
    account: Annotated[Union[AdminInDB, UserInDB], Depends(get_current_account)],
    mongo:   Annotated[MongoService, Depends(get_mongo_service)],
):
    oid = _to_oid(zone_id)
    if not oid:
        raise HTTPException(status_code=404, detail="Invalid zone ID")

    query_filter = await _zone_ownership_filter(oid, account, mongo)
    if not query_filter:
        raise HTTPException(status_code=404, detail="Zone not found")

    result = await mongo.zones.update_one(
        query_filter,
        {"$pull": {"device_sns": sn}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Zone not found")

    await mongo.devices.update_one(
        {"sn": sn},
        {"$pull": {"fence_zone_ids": zone_id}},
    )
    logger.info("[zones] unassigned sn=%s from zone_id=%s owner=%s", sn, zone_id, account.email)
    return {"status": "ok", "zone_id": zone_id, "sn": sn}
