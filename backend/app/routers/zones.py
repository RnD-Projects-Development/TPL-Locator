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


def _require_admin_or_fence_create(account):
    """Zone management (create/edit/delete/assign) is allowed for admins and users with fence create access."""
    if isinstance(account, AdminInDB):
        return
    if getattr(account, "geofence_create_access", False) or getattr(account, "fence_create_access", False):
        return
    raise HTTPException(status_code=403, detail="Permission denied: Geofence create access required")


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


def _zone_ownership_filter(oid, account):
    """Query filter scoping a zone write (update/delete) to the account's owned zones.

    Admins may update/delete any zone under their own admin_id.
    Users may ONLY update/delete zones they created themselves (user_id == account.id).
    """
    if isinstance(account, AdminInDB):
        return {"_id": oid, "admin_id": _to_oid(account.id)}
    return {"_id": oid, "user_id": _to_oid(account.id)}


class ZoneCreate(BaseModel):
    name: str
    company: Optional[str] = None
    color: str = "#C1121F"
    shape: str = "polygon"                    # "polygon" | "circle"
    coordinates: Optional[List[dict]] = None  # [{lat, lng}] for polygon
    center: Optional[dict] = None             # {lat, lng} for circle
    radius: Optional[float] = None            # metres for circle


class ZoneAssign(BaseModel):
    sn: Optional[str] = None
    sns: Optional[List[str]] = None


@router.get("", response_model=List[dict])
async def list_zones(
    account: Annotated[Union[AdminInDB, UserInDB], Depends(get_current_account)],
    mongo:   Annotated[MongoService, Depends(get_mongo_service)],
):
    admin_oid = await _resolve_admin_scope(account, mongo)
    if not admin_oid:
        return []

    if isinstance(account, AdminInDB):
        # Admins see every zone under their admin scope.
        query = {"admin_id": admin_oid}
    else:
        # Users should NEVER see admin-created zones unless their assigned devices are in the zone.
        # They also see any zones they created themselves.
        user_oid = _to_oid(account.id)
        user_devices = await mongo.devices.find(
            {"user_id": user_oid}, {"sn": 1}
        ).to_list(1000)
        sns = [d["sn"] for d in user_devices if d.get("sn")]

        user_conditions = [{"user_id": user_oid}]
        if sns:
            user_conditions.append({"admin_id": admin_oid, "device_sns": {"$in": sns}})

        query = {"$or": user_conditions}

    docs = await mongo.zones.find(query).to_list(500)
    return [_zone_out(d) for d in docs]


@router.post("", status_code=201)
async def create_zone(
    body:    ZoneCreate,
    account: Annotated[Union[AdminInDB, UserInDB], Depends(get_current_account)],
    mongo:   Annotated[MongoService, Depends(get_mongo_service)],
):
    _require_admin_or_fence_create(account)
    admin_oid = await _resolve_admin_scope(account, mongo)
    doc = {
        "admin_id":    admin_oid,
        "user_id":     _to_oid(account.id) if not isinstance(account, AdminInDB) else None,
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


@router.post("/batch", status_code=201, response_model=List[dict])
async def create_zones_batch(
    body:    List[ZoneCreate],
    account: Annotated[Union[AdminInDB, UserInDB], Depends(get_current_account)],
    mongo:   Annotated[MongoService, Depends(get_mongo_service)],
):
    _require_admin_or_fence_create(account)
    if not body:
        return []

    admin_oid = await _resolve_admin_scope(account, mongo)
    user_oid = _to_oid(account.id) if not isinstance(account, AdminInDB) else None
    now = datetime.utcnow()

    docs = []
    for item in body:
        docs.append({
            "admin_id":    admin_oid,
            "user_id":     user_oid,
            "name":        item.name.strip() if item.name else "Imported Zone",
            "company":     item.company.strip() if item.company else None,
            "color":       item.color or "#C1121F",
            "shape":       item.shape or "polygon",
            "coordinates": item.coordinates,
            "center":      item.center,
            "radius":      item.radius,
            "device_sns":  [],
            "created_at":  now,
        })

    result = await mongo.zones.insert_many(docs)
    for i, inserted_id in enumerate(result.inserted_ids):
        docs[i]["_id"] = inserted_id

    logger.info("[zones] batch created %d zones owner=%s", len(docs), account.email)
    return [_zone_out(d) for d in docs]


@router.put("/{zone_id}")
async def update_zone(
    zone_id: str,
    body:    ZoneCreate,
    account: Annotated[Union[AdminInDB, UserInDB], Depends(get_current_account)],
    mongo:   Annotated[MongoService, Depends(get_mongo_service)],
):
    _require_admin_or_fence_create(account)
    oid = _to_oid(zone_id)
    if not oid:
        raise HTTPException(status_code=404, detail="Invalid zone ID")

    query_filter = _zone_ownership_filter(oid, account)

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
        raise HTTPException(status_code=404, detail="Zone not found or access denied")

    logger.info("[zones] updated zone_id=%s admin=%s", zone_id, account.email)
    return _zone_out(updated)


@router.delete("/{zone_id}", status_code=204)
async def delete_zone(
    zone_id: str,
    account: Annotated[Union[AdminInDB, UserInDB], Depends(get_current_account)],
    mongo:   Annotated[MongoService, Depends(get_mongo_service)],
):
    _require_admin_or_fence_create(account)
    oid = _to_oid(zone_id)
    if not oid:
        raise HTTPException(status_code=404, detail="Invalid zone ID")

    query_filter = _zone_ownership_filter(oid, account)

    result = await mongo.zones.delete_one(query_filter)
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Zone not found or access denied")

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
    _require_admin_or_fence_create(account)
    oid = _to_oid(zone_id)
    if not oid:
        raise HTTPException(status_code=404, detail="Invalid zone ID")

    sns_to_assign = []
    if body.sns:
        sns_to_assign = [s.strip() for s in body.sns if s and str(s).strip()]
    elif body.sn and body.sn.strip():
        sns_to_assign = [body.sn.strip()]

    if not sns_to_assign:
        raise HTTPException(status_code=400, detail="Device SN(s) required")

    admin_oid = await _resolve_admin_scope(account, mongo)
    zone = await mongo.zones.find_one({"_id": oid})
    if not zone:
        raise HTTPException(status_code=404, detail="Zone not found")

    if not isinstance(account, AdminInDB):
        user_oid = _to_oid(account.id)
        # Check zone accessibility: user created it OR it's under user's admin scope
        if zone.get("user_id") != user_oid and _to_oid(zone.get("admin_id")) != admin_oid:
            raise HTTPException(status_code=403, detail="Zone not accessible")

    devices = await mongo.devices.find({"sn": {"$in": sns_to_assign}}).to_list(len(sns_to_assign))
    found_sns = [d["sn"] for d in devices]

    # If user is assigning, ensure all found devices belong to them
    if not isinstance(account, AdminInDB):
        for d in devices:
            if _to_oid(d.get("user_id")) != _to_oid(account.id):
                raise HTTPException(status_code=403, detail="You can only assign devices belonging to your account")

    if not found_sns:
        raise HTTPException(status_code=404, detail="No matching devices found")

    await mongo.zones.update_one({"_id": oid}, {"$addToSet": {"device_sns": {"$each": found_sns}}})
    await mongo.devices.update_many({"sn": {"$in": found_sns}}, {"$addToSet": {"fence_zone_ids": zone_id}})
    logger.info("[zones] assigned sns=%s to zone_id=%s owner=%s", found_sns, zone_id, account.email)
    return {"status": "ok", "zone_id": zone_id, "sns": found_sns, "sn": found_sns[0] if len(found_sns) == 1 else None}


@router.delete("/{zone_id}/assign/{sn}", status_code=200)
async def unassign_device_from_zone(
    zone_id: str,
    sn:      str,
    account: Annotated[Union[AdminInDB, UserInDB], Depends(get_current_account)],
    mongo:   Annotated[MongoService, Depends(get_mongo_service)],
):
    _require_admin_or_fence_create(account)
    oid = _to_oid(zone_id)
    if not oid:
        raise HTTPException(status_code=404, detail="Invalid zone ID")

    zone = await mongo.zones.find_one({"_id": oid})
    if not zone:
        raise HTTPException(status_code=404, detail="Zone not found")

    # If user is unassigning, ensure the device belongs to them
    if not isinstance(account, AdminInDB):
        device = await mongo.devices.find_one({"sn": sn})
        if not device or _to_oid(device.get("user_id")) != _to_oid(account.id):
            raise HTTPException(status_code=403, detail="You can only unassign devices belonging to your account")

    result = await mongo.zones.update_one(
        {"_id": oid},
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
