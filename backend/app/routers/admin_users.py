from datetime import datetime, timezone
import logging
from typing import Annotated, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from bson import ObjectId

from app.dependencies import get_mongo_service, require_role
from app.models.admin import AdminInDB
from app.services.mongodb import MongoService
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin_users"])


class CreateUserRequest(BaseModel):
    email: EmailStr
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
    logger.info("admin_create_user started admin=%s email=%s", current_admin.email, payload.email)
    try:
        existing = await mongo.get_user_by_email(payload.email)
        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

        user = await mongo.create_user(payload.email, payload.password, payload.name, payload.role or "user")
        created_at = datetime.now(timezone.utc)
        await mongo.accounts.update_one(
            {"_id": ObjectId(str(user.id)), "role": "user"},
            {"$set": {"created_at": created_at}},
        )
        await mongo.update_user_admin(str(user.id), str(current_admin.id))
        updated = await mongo.get_user_by_id(str(user.id))
        if not updated:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Created user not found")
        device_map = await _load_device_map(mongo, updated.devices or [])
        devices = _populate_devices(updated.devices or [], device_map)
        response = {
            "id":         str(updated.id),
            "email":      updated.email,
            "name":       updated.name,
            "role":       updated.role or "user",
            "admin_id":   str(updated.admin_id) if updated.admin_id else None,
            "devices":    devices,
            "created_at": created_at.isoformat(),
        }
        logger.info("admin_create_user completed admin=%s user_id=%s", current_admin.email, response["id"])
        return response
    except HTTPException:
        raise
    except Exception as err:
        logger.exception("admin_create_user failed admin=%s email=%s", current_admin.email, payload.email)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(err))


@router.get("/users")
async def admin_list_users(
    current_admin: Annotated[AdminInDB, Depends(require_role("admin"))],
    mongo: Annotated[MongoService, Depends(get_mongo_service)],
) -> List[dict]:
    logger.info("admin_list_users started admin=%s", current_admin.email)
    try:
        admin_id_obj = _to_oid(current_admin.id)
        users_cursor = mongo.accounts.find({
            "role": "user",
            "$or": [
                {"admin_id": admin_id_obj},
                {"admin_id": None},
                {"admin_id": {"$exists": False}},
            ]
        })
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
                    created_at = user_dict["_id"].generation_time.isoformat()
                except Exception:
                    created_at = None
            elif isinstance(created_at, datetime):
                created_at = created_at.isoformat()
            last_logged_in = user_dict.get("last_logged_in")
            if isinstance(last_logged_in, datetime):
                last_logged_in = last_logged_in.isoformat()
            result.append({
                "id":             str(user_dict.get("_id", "")),
                "email":          user_dict.get("email", ""),
                "name":           user_dict.get("name", ""),
                "role":           user_dict.get("role", "user"),
                "admin_id":       str(user_dict.get("admin_id", "")) if user_dict.get("admin_id") else None,
                "devices":        devices,
                "created_at":     created_at,
                "last_logged_in": last_logged_in,
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
        "email":      updated.email,
        "name":       updated.name,
        "role":       updated.role or "user",
        "admin_id":   str(updated.admin_id) if updated.admin_id else None,
        "devices":    devices,
        "created_at": updated.created_at.isoformat() if updated.created_at else None,
    }
    logger.info("admin_update_user completed admin=%s target_user_id=%s", current_admin.email, user_id)
    return response