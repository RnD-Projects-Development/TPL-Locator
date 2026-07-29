from datetime import datetime, timezone
import logging
from typing import Annotated, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from bson import ObjectId

from app.account_identifier import resolve_identifier
from app.dependencies import get_mongo_service, require_role
from app.models.admin import AdminInDB
from app.services.mongodb import MongoService
from app.user_display import public_contact
logger = logging.getLogger(__name__)


def _dt_iso(dt) -> str | None:
    """Serialize datetime to ISO 8601 with explicit UTC offset.

    PyMongo strips tzinfo when reading back from MongoDB, turning aware UTC
    datetimes into naive ones.  Calling .isoformat() on a naive datetime
    produces a string without 'Z'/'+00:00', so JavaScript in non-UTC locales
    (e.g. PKT = UTC+5) interprets it as local time and shows a stale age.
    This helper reattaches UTC before serialising so the JS side is always correct.
    """
    if dt is None:
        return None
    if not isinstance(dt, datetime):
        return str(dt)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()

router = APIRouter(prefix="/api/admin", tags=["admin_users"])


class CreateUserRequest(BaseModel):
    identifier: str  # email address OR phone number
    password: str
    name: str = ""
    role: Optional[str] = "user"


class UpdateUserRequest(BaseModel):
    name: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None


def _to_oid(value) -> Optional[ObjectId]:
    if value is None:
        return None
    if isinstance(value, ObjectId):
        return value
    try:
        return ObjectId(str(value))
    except Exception:
        return None


def _device_payload(device_doc: dict | None, fallback_id: str) -> dict:
    if not device_doc:
        return {"id": fallback_id, "sn": fallback_id, "name": ""}
    device_id = str(device_doc["_id"])
    return {
        "id": device_id,
        "sn": device_doc.get("sn", device_id),
        "name": device_doc.get("name", ""),
    }


async def _load_device_map(mongo: MongoService, device_ids: list) -> dict[str, dict]:
    unique_oids = []
    seen: set[str] = set()
    for d_id in device_ids:
        oid = _to_oid(d_id)
        if not oid:
            continue
        key = str(oid)
        if key in seen:
            continue
        seen.add(key)
        unique_oids.append(oid)

    if not unique_oids:
        return {}

    device_map: dict[str, dict] = {}
    async for device_doc in mongo.devices.find({"_id": {"$in": unique_oids}}):
        device_map[str(device_doc["_id"])] = device_doc
    return device_map


def _populate_devices(device_ids: list, device_map: dict[str, dict]) -> list:
    return [_device_payload(device_map.get(str(d_id)), str(d_id)) for d_id in device_ids]


@router.post("/users")
async def admin_create_user(
    payload: CreateUserRequest,
    current_admin: Annotated[AdminInDB, Depends(require_role("admin"))],
    mongo: Annotated[MongoService, Depends(get_mongo_service)],
):
    logger.info("admin_create_user started admin=%s identifier=%s", current_admin.email, payload.identifier)
    try:
        try:
            email, phone = resolve_identifier(payload.identifier)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

        if email:
            existing = await mongo.get_account_by_email(email)
            if existing:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

        if phone:
            existing_phone = await mongo.get_user_by_phone(phone)
            if existing_phone:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Phone already registered")

        user = await mongo.create_user(email, payload.password, payload.name, phone)
        created_at = datetime.now(timezone.utc)
        await mongo.accounts.update_one(
            {"_id": ObjectId(str(user.id)), "role": "user"},
            {"$set": {"created_at": created_at, "phone": phone}},
        )
        await mongo.update_user_admin(str(user.id), str(current_admin.id))
        updated = await mongo.get_user_by_id(str(user.id))
        if not updated:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Created user not found")
        device_map = await _load_device_map(mongo, updated.devices or [])
        devices = _populate_devices(updated.devices or [], device_map)
        response = {
            "id":         str(updated.id),
            "email":      public_contact(updated.email, updated.phone),
            "phone":      updated.phone,
            "name":       updated.name,
            "role":       updated.role or "user",
            "admin_id":   str(updated.admin_id) if updated.admin_id else None,
            "devices":    devices,
            "created_at": _dt_iso(created_at),
        }
        logger.info("admin_create_user completed admin=%s user_id=%s", current_admin.email, response["id"])
        return response
    except HTTPException:
        raise
    except Exception as err:
        logger.exception("admin_create_user failed admin=%s identifier=%s", current_admin.email, payload.identifier)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(err))


@router.get("/users")
async def admin_list_users(
    current_admin: Annotated[AdminInDB, Depends(require_role("admin"))],
    mongo: Annotated[MongoService, Depends(get_mongo_service)],
) -> List[dict]:
    logger.info("admin_list_users started admin=%s", current_admin.email)
    try:
        # Single-company deployment: all admin logins manage one shared fleet and
        # user pool, so every registered end-user must be bindable from any admin.
        # (Previously scoped to admin_id == self OR null, which silently hid users
        #  linked to a different admin — that's the "missing from bind dropdown" bug.)
        users_cursor = mongo.accounts.find({"role": "user"})
        user_dicts = await users_cursor.to_list(None)

        all_device_ids = []
        for user_dict in user_dicts:
            all_device_ids.extend(user_dict.get("devices", []))
        device_map = await _load_device_map(mongo, all_device_ids)

        result = []
        for user_dict in user_dicts:
            raw_devices = user_dict.get("devices", [])
            devices = _populate_devices(raw_devices, device_map)
            created_at = user_dict.get("created_at")
            if not created_at:
                try:
                    created_at = _dt_iso(user_dict["_id"].generation_time)
                except Exception:
                    created_at = None
            elif isinstance(created_at, datetime):
                created_at = _dt_iso(created_at)
            last_logged_in = user_dict.get("last_logged_in")
            last_logged_out = user_dict.get("last_logged_out")
            # Online = logged in and no logout recorded since that login.
            is_online = isinstance(last_logged_in, datetime) and (
                not isinstance(last_logged_out, datetime)
                or last_logged_in > last_logged_out
            )
            if isinstance(last_logged_in, datetime):
                last_logged_in = _dt_iso(last_logged_in)
            if isinstance(last_logged_out, datetime):
                last_logged_out = _dt_iso(last_logged_out)
            raw_email = user_dict.get("email", "")
            raw_phone = user_dict.get("phone")
            result.append({
                "id":             str(user_dict.get("_id", "")),
                "email":          public_contact(raw_email, raw_phone),
                "phone":          raw_phone,
                "name":           user_dict.get("name", ""),
                "role":           user_dict.get("role", "user"),
                "admin_id":       str(user_dict.get("admin_id", "")) if user_dict.get("admin_id") else None,
                "devices":        devices,
                "created_at":     created_at,
                "last_logged_in": last_logged_in,
                "last_logged_out": last_logged_out,
                "is_online":      is_online,
            })
        logger.info("admin_list_users completed admin=%s count=%s", current_admin.email, len(result))
        return result
    except Exception as err:
        logger.exception("admin_list_users failed admin=%s", current_admin.email)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to list users: {str(err)}")


@router.delete("/users/{user_id}")
async def admin_delete_user(
    user_id: str,
    current_admin: Annotated[AdminInDB, Depends(require_role("admin"))],
    mongo: Annotated[MongoService, Depends(get_mongo_service)],
):
    logger.info("admin_delete_user started admin=%s target_user_id=%s", current_admin.email, user_id)
    user = await mongo.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.admin_id and str(user.admin_id) != str(current_admin.id):
        raise HTTPException(status_code=403, detail="You do not manage this user")
    deleted = await mongo.delete_user(user_id)
    if not deleted:
        raise HTTPException(status_code=500, detail="Failed to delete user")
    logger.info("admin_delete_user completed admin=%s target_user_id=%s", current_admin.email, user_id)
    return {"status": "ok"}


@router.put("/users/{user_id}")
async def admin_update_user(
    user_id: str,
    payload: UpdateUserRequest,
    current_admin: Annotated[AdminInDB, Depends(require_role("admin"))],
    mongo: Annotated[MongoService, Depends(get_mongo_service)],
):
    logger.info("admin_update_user started admin=%s target_user_id=%s", current_admin.email, user_id)
    user = await mongo.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.admin_id and str(user.admin_id) != str(current_admin.id):
        raise HTTPException(status_code=403, detail="You do not manage this user")

    update_fields = {}
    if payload.name is not None:
        update_fields["name"] = payload.name
    if payload.password is not None:
        from app.auth_utils import hash_password
        update_fields["password"] = hash_password(payload.password)
    if payload.role is not None:
        update_fields["role"] = payload.role

    if update_fields:
        await mongo.accounts.update_one({"_id": ObjectId(user_id), "role": "user"}, {"$set": update_fields})

    updated = await mongo.get_user_by_id(user_id)
    if not updated:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Updated user not found")
    device_map = await _load_device_map(mongo, updated.devices or [])
    devices = _populate_devices(updated.devices or [], device_map)
    response = {
        "id":         str(updated.id),
        "email":      public_contact(updated.email, updated.phone),
        "phone":      updated.phone,
        "name":       updated.name,
        "role":       updated.role or "user",
        "admin_id":   str(updated.admin_id) if updated.admin_id else None,
        "devices":    devices,
        "created_at": _dt_iso(updated.created_at),
    }
    logger.info("admin_update_user completed admin=%s target_user_id=%s", current_admin.email, user_id)
    return response