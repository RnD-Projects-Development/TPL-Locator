from datetime import datetime, timezone
import logging
from typing import Annotated, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from bson import ObjectId

from app.account_identifier import resolve_identifier
from app.dependencies import get_mongo_service, require_role, require_roles
from app.models.admin import AdminInDB, SuperUserInDB
from app.services.mongodb import MongoService
from app.user_display import public_contact, has_real_email
logger = logging.getLogger(__name__)


def _is_superuser(actor) -> bool:
    return getattr(actor, "role", None) == "superuser"


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
    role: Optional[str] = "user"          # admin may pass "superuser"
    superuser_id: Optional[str] = None    # admin may attach the new user to a super user


class UpdateUserRequest(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None
    superuser_id: Optional[str] = None    # admin-only: (re)assign owning super user; "" clears
    dashboard_access: Optional[bool] = None
    geofence_access: Optional[bool] = None
    geofence_create_access: Optional[bool] = None
    fence_create_access: Optional[bool] = None


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
    current_actor: Annotated[object, Depends(require_roles("admin", "superuser"))],
    mongo: Annotated[MongoService, Depends(get_mongo_service)],
):
    su_actor = _is_superuser(current_actor)
    logger.info("admin_create_user started actor=%s su=%s identifier=%s", current_actor.email, su_actor, payload.identifier)
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
            existing_phone = await mongo.accounts.find_one({"phone": phone})
            if existing_phone:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Phone already registered")

        # A super user may only create plain users, always under itself.
        requested_role = (payload.role or "user").strip().lower()
        if su_actor:
            requested_role = "user"

        if requested_role == "superuser":
            su = await mongo.create_superuser(email, payload.password, payload.name, phone, str(current_actor.id))
            created_at = _dt_iso(getattr(su, "created_at", None)) or _dt_iso(datetime.now(timezone.utc))
            logger.info("admin_create_user completed (superuser) admin=%s superuser_id=%s", current_actor.email, su.id)
            return {
                "id": str(su.id),
                "email": su.email if has_real_email(su.email) else None,
                "phone": su.phone,
                "name": su.name,
                "role": "superuser",
                "admin_id": str(su.admin_id) if su.admin_id else None,
                "superuser_id": None,
                "devices": [],
                "dashboard_access": True,
                "geofence_access": True,
                "geofence_create_access": True,
                "created_at": created_at,
            }

        if requested_role not in ("user", ""):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid role")

        # Resolve the owning super user for the new plain user.
        owning_su_oid = None
        if su_actor:
            owning_su_oid = _to_oid(current_actor.id)
        elif payload.superuser_id:
            owning_su = await mongo.get_superuser_by_id(payload.superuser_id)
            if not owning_su:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown super user")
            owning_su_oid = _to_oid(owning_su.id)

        admin_id_for_user = str(current_actor.admin_id) if su_actor and current_actor.admin_id else (
            None if su_actor else str(current_actor.id)
        )

        user = await mongo.create_user(email, payload.password, payload.name, phone)
        created_at = datetime.now(timezone.utc)
        set_fields = {"created_at": created_at, "phone": phone}
        if owning_su_oid is not None:
            set_fields["superuser_id"] = owning_su_oid
        await mongo.accounts.update_one(
            {"_id": ObjectId(str(user.id)), "role": "user"},
            {"$set": set_fields},
        )
        if admin_id_for_user:
            await mongo.update_user_admin(str(user.id), admin_id_for_user)
        updated = await mongo.get_user_by_id(str(user.id))
        if not updated:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Created user not found")
        device_map = await _load_device_map(mongo, updated.devices or [])
        devices = _populate_devices(updated.devices or [], device_map)
        response = {
            "id":                     str(updated.id),
            "email":                  updated.email if has_real_email(updated.email) else None,
            "phone":                  updated.phone,
            "name":                   updated.name,
            "role":                   updated.role or "user",
            "admin_id":               str(updated.admin_id) if updated.admin_id else None,
            "superuser_id":           str(updated.superuser_id) if getattr(updated, "superuser_id", None) else None,
            "devices":                devices,
            "geofence_access":        getattr(updated, "geofence_access", False),
            "geofence_create_access": getattr(updated, "geofence_create_access", False),
            "created_at":             _dt_iso(created_at),
        }
        logger.info("admin_create_user completed actor=%s user_id=%s", current_actor.email, response["id"])
        return response
    except HTTPException:
        raise
    except Exception as err:
        logger.exception("admin_create_user failed actor=%s identifier=%s", current_actor.email, payload.identifier)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(err))


@router.get("/users")
async def admin_list_users(
    current_actor: Annotated[object, Depends(require_roles("admin", "superuser"))],
    mongo: Annotated[MongoService, Depends(get_mongo_service)],
    role: Optional[str] = None,
) -> List[dict]:
    su_actor = _is_superuser(current_actor)
    logger.info("admin_list_users started actor=%s su=%s role_filter=%s", current_actor.email, su_actor, role)
    try:
        if su_actor:
            # A super user only ever sees its own plain users.
            query = {"role": "user", "superuser_id": _to_oid(current_actor.id)}
        elif role in ("user", "superuser"):
            query = {"role": role}
        else:
            # Admin default: every user AND every super user.
            query = {"role": {"$in": ["user", "superuser"]}}
        users_cursor = mongo.accounts.find(query)
        user_dicts = await users_cursor.to_list(None)

        # Resolve super user display names for the `superuser_name` column.
        su_ids = {u.get("superuser_id") for u in user_dicts if u.get("superuser_id")}
        su_names: dict[str, str] = {}
        if su_ids:
            async for su_doc in mongo.accounts.find({"_id": {"$in": list(su_ids)}, "role": "superuser"}):
                su_names[str(su_doc["_id"])] = (su_doc.get("name") or su_doc.get("email") or su_doc.get("phone") or "")

        all_device_ids = []
        for user_dict in user_dicts:
            all_device_ids.extend(user_dict.get("devices", []))
        device_map = await _load_device_map(mongo, all_device_ids)

        # Super user rows carry no `devices` array — their fleet is linked the
        # other way round (device.superuser_id). Resolve those here.
        su_row_ids = [u["_id"] for u in user_dicts if u.get("role") == "superuser"]
        su_devices_map: dict[str, list] = {}
        if su_row_ids:
            async for dev in mongo.devices.find({"superuser_id": {"$in": su_row_ids}}):
                su_devices_map.setdefault(str(dev.get("superuser_id")), []).append(dev)

        result = []
        for user_dict in user_dicts:
            if user_dict.get("role") == "superuser":
                raw_devices = []
                devices = [
                    _device_payload(dev, str(dev["_id"]))
                    for dev in su_devices_map.get(str(user_dict["_id"]), [])
                ]
            else:
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
            create_access = bool(
                user_dict.get("geofence_create_access", user_dict.get("fence_create_access", False))
            )
            row_role = user_dict.get("role", "user")
            su_oid = user_dict.get("superuser_id")
            result.append({
                "id":                     str(user_dict.get("_id", "")),
                "email":                  raw_email if has_real_email(raw_email) else None,
                "phone":                  raw_phone,
                "name":                   user_dict.get("name", ""),
                "role":                   row_role,
                "admin_id":               str(user_dict.get("admin_id", "")) if user_dict.get("admin_id") else None,
                "superuser_id":           str(su_oid) if su_oid else None,
                "superuser_name":         su_names.get(str(su_oid)) if su_oid else None,
                "devices":                devices,
                "dashboard_access":       bool(user_dict.get("dashboard_access", True)) if row_role == "user" else True,
                "geofence_access":        bool(user_dict.get("geofence_access", False)) if row_role == "user" else True,
                "geofence_create_access": create_access if row_role == "user" else True,
                "created_at":             created_at,
                "last_logged_in":         last_logged_in,
                "last_logged_out":        last_logged_out,
                "is_online":              is_online,
            })
        logger.info("admin_list_users completed actor=%s count=%s", current_actor.email, len(result))
        return result
    except Exception as err:
        logger.exception("admin_list_users failed actor=%s", current_actor.email)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to list users: {str(err)}")


async def _load_target_account(mongo: MongoService, user_id: str):
    """Return the raw account doc for a users-tab target (role user or superuser)."""
    oid = _to_oid(user_id)
    if not oid:
        return None
    return await mongo.accounts.find_one({"_id": oid, "role": {"$in": ["user", "superuser"]}})


def _assert_actor_manages(current_actor, target_doc):
    """403 unless the actor may manage this target account."""
    target_role = target_doc.get("role", "user")
    if _is_superuser(current_actor):
        if target_role != "user" or str(target_doc.get("superuser_id") or "") != str(current_actor.id):
            raise HTTPException(status_code=403, detail="You do not manage this user")
    # Admin: single-company deployment — may manage any user/super user.


@router.get("/superusers")
async def admin_list_superusers(
    current_admin: Annotated[AdminInDB, Depends(require_role("admin"))],
    mongo: Annotated[MongoService, Depends(get_mongo_service)],
) -> List[dict]:
    """List every super user with how many users and devices sit under it. Admin only."""
    docs = await mongo.accounts.find({"role": "superuser"}).to_list(None)
    result = []
    for doc in docs:
        su_oid = doc["_id"]
        user_count = await mongo.accounts.count_documents({"role": "user", "superuser_id": su_oid})
        device_count = await mongo.devices.count_documents({"superuser_id": su_oid})
        raw_email = doc.get("email", "")
        last_in = doc.get("last_logged_in")
        last_out = doc.get("last_logged_out")
        is_online = isinstance(last_in, datetime) and (
            not isinstance(last_out, datetime) or last_in > last_out
        )
        result.append({
            "id": str(su_oid),
            "email": raw_email if has_real_email(raw_email) else None,
            "phone": doc.get("phone"),
            "name": doc.get("name", ""),
            "role": "superuser",
            "admin_id": str(doc.get("admin_id")) if doc.get("admin_id") else None,
            "user_count": user_count,
            "device_count": device_count,
            "created_at": _dt_iso(doc.get("created_at")),
            "last_logged_in": _dt_iso(last_in),
            "last_logged_out": _dt_iso(last_out),
            "is_online": is_online,
        })
    return result


@router.delete("/users/{user_id}")
async def admin_delete_user(
    user_id: str,
    current_actor: Annotated[object, Depends(require_roles("admin", "superuser"))],
    mongo: Annotated[MongoService, Depends(get_mongo_service)],
):
    logger.info("admin_delete_user started actor=%s target=%s", current_actor.email, user_id)
    target = await _load_target_account(mongo, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    _assert_actor_manages(current_actor, target)

    if target.get("role") == "superuser":
        deleted = await mongo.delete_superuser(user_id)
    else:
        deleted = await mongo.delete_user(user_id)
    if not deleted:
        raise HTTPException(status_code=500, detail="Failed to delete user")
    logger.info("admin_delete_user completed actor=%s target=%s", current_actor.email, user_id)
    return {"status": "ok"}


@router.put("/users/{user_id}")
async def admin_update_user(
    user_id: str,
    payload: UpdateUserRequest,
    current_actor: Annotated[object, Depends(require_roles("admin", "superuser"))],
    mongo: Annotated[MongoService, Depends(get_mongo_service)],
):
    logger.info("admin_update_user started actor=%s target=%s", current_actor.email, user_id)
    target = await _load_target_account(mongo, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    _assert_actor_manages(current_actor, target)
    target_role = target.get("role", "user")
    su_actor = _is_superuser(current_actor)

    update_fields = {}
    if payload.name is not None:
        update_fields["name"] = payload.name
    if payload.phone is not None:
        if payload.phone:
            from app.account_identifier import normalize_phone, validate_pakistani_phone
            normalized = normalize_phone(payload.phone)
            if not validate_pakistani_phone(normalized):
                raise HTTPException(status_code=400, detail="Invalid phone number (must be a valid Pakistani number)")
            existing = await mongo.accounts.find_one({"phone": normalized})
            if existing and str(existing["_id"]) != user_id:
                raise HTTPException(status_code=400, detail="Phone already registered to another account")
            update_fields["phone"] = normalized
        else:
            update_fields["phone"] = None
    if payload.password is not None:
        from app.auth_utils import hash_password
        update_fields["password"] = hash_password(payload.password)

    # Role / super-user assignment: admin only, and only for plain users.
    if not su_actor and target_role == "user":
        if payload.role is not None and payload.role in ("user", "superuser"):
            update_fields["role"] = payload.role
        if payload.superuser_id is not None:
            if payload.superuser_id == "":
                update_fields["superuser_id"] = None
            else:
                owning_su = await mongo.get_superuser_by_id(payload.superuser_id)
                if not owning_su:
                    raise HTTPException(status_code=400, detail="Unknown super user")
                update_fields["superuser_id"] = _to_oid(owning_su.id)

    if target_role == "user":
        if payload.dashboard_access is not None:
            update_fields["dashboard_access"] = payload.dashboard_access
        if payload.geofence_access is not None:
            update_fields["geofence_access"] = payload.geofence_access
        if payload.geofence_create_access is not None:
            update_fields["geofence_create_access"] = payload.geofence_create_access
        elif payload.fence_create_access is not None:
            update_fields["geofence_create_access"] = payload.fence_create_access

    if update_fields:
        await mongo.accounts.update_one({"_id": ObjectId(user_id)}, {"$set": update_fields})

    updated = await mongo.accounts.find_one({"_id": ObjectId(user_id)})
    if not updated:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Updated user not found")
    raw_devices = updated.get("devices", [])
    device_map = await _load_device_map(mongo, raw_devices)
    devices = _populate_devices(raw_devices, device_map)
    su_oid = updated.get("superuser_id")
    response = {
        "id":                     str(updated["_id"]),
        "email":                  updated.get("email") if has_real_email(updated.get("email")) else None,
        "phone":                  updated.get("phone"),
        "name":                   updated.get("name"),
        "role":                   updated.get("role") or "user",
        "admin_id":               str(updated.get("admin_id")) if updated.get("admin_id") else None,
        "superuser_id":           str(su_oid) if su_oid else None,
        "devices":                devices,
        "dashboard_access":       bool(updated.get("dashboard_access", True)),
        "geofence_access":        bool(updated.get("geofence_access", False)),
        "geofence_create_access": bool(updated.get("geofence_create_access", False)),
        "created_at":             _dt_iso(updated.get("created_at")),
    }
    logger.info("admin_update_user completed actor=%s target=%s", current_actor.email, user_id)
    return response