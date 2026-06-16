from datetime import datetime, timezone
import logging
from typing import Annotated, Optional, Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from bson import ObjectId

from app.auth_utils import verify_password, hash_password
from app.dependencies import (
    create_access_token,
    get_mongo_service,
    admin_to_public,
    user_to_public,
    require_role,
)
from app.models.admin import AdminCreate, AdminPublic
from app.models.user import UserCreate, UserPublic
from app.services.mongodb import MongoService
from app.user_display import public_contact
from app.account_identifier import normalize_phone, resolve_identifier


router = APIRouter(prefix="/api", tags=["auth"])
logger = logging.getLogger(__name__)


# ── Request / Response models ────────────────────────────────────────────────

class LoginRequest(BaseModel):
    identifier: str          # email address OR phone number
    password: str
    uid: Optional[str] = None  # only needed for admin login


class LoginResponse(BaseModel):
    account: Optional[dict] = None
    access_token: str
    token_type: str = "bearer"


def _admin_account_payload(admin: AdminPublic) -> dict:
    return {
        "id": admin.id,
        "email": admin.email,
        "role": "admin",
        "uid": admin.uid,
        "created_at": admin.created_at,
        "reg_device": admin.reg_device,
        "reg_devices": admin.reg_devices,
        "name": None,
        "phone": None,
        "admin_id": None,
        "devices": [],
    }


def _user_account_payload(user: UserPublic) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "role": "user",
        "name": user.name,
        "phone": user.phone,
        "admin_id": user.admin_id,
        "devices": user.devices,
        "uid": None,
        "created_at": None,
        "reg_device": None,
        "reg_devices": [],
    }


class RegisterRequest(BaseModel):
    identifier: str          # email address OR phone number
    password: str
    name: Optional[str] = None


# ── Login ────────────────────────────────────────────────────────────────────

@router.post("/login", response_model=LoginResponse)
async def login(
    payload: LoginRequest,
    mongo: Annotated[MongoService, Depends(get_mongo_service)],
):
    """
    Login endpoint for admins and users.

    - If the identifier contains '@' it is treated as an email.
      Admins can only log in via email. Users can log in via email too.
    - If the identifier does not contain '@' it is treated as a phone number
      (users only — admin table is never checked by phone).

    Admin authentication is purely local (Mongo).
    CityTag interactions (token refresh + device/location sync) are handled by /sync endpoints.
    """
    raw = payload.identifier.strip()
    is_email = "@" in raw

    try:
        if is_email:
            email = raw.lower()

            # Admin check first (email only)
            admin = await mongo.get_admin_by_email(email)
            if admin:
                if not verify_password(payload.password, admin.password):
                    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid admin credentials")

                admin_data = AdminCreate(email=email, password=payload.password, uid=payload.uid or admin.uid or "")
                try:
                    admin = await mongo.create_or_update_admin(admin_data)
                except ValueError as e:
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
                logger.info("admin login completed email=%s admin_id=%s", email, admin.id)

                access_token = create_access_token(str(admin.id))
                return LoginResponse(account=_admin_account_payload(admin_to_public(admin)), access_token=access_token)

            # User by email
            user = await mongo.get_user_by_email(email)
            if user and verify_password(payload.password, user.password):
                await mongo.accounts.update_one(
                    {"_id": ObjectId(str(user.id))},
                    {"$set": {"last_logged_in": datetime.now(timezone.utc)}},
                )
                access_token = create_access_token(str(user.id))
                logger.info("user login completed email=%s user_id=%s", email, user.id)
                return LoginResponse(account=_user_account_payload(user_to_public(user)), access_token=access_token)

        else:
            # Phone path — users only, skip admin table
            phone = normalize_phone(raw)
            user = await mongo.get_user_by_phone(phone)
            if user and verify_password(payload.password, user.password):
                await mongo.accounts.update_one(
                    {"_id": ObjectId(str(user.id))},
                    {"$set": {"last_logged_in": datetime.now(timezone.utc)}},
                )
                access_token = create_access_token(str(user.id))
                logger.info("user login by phone completed phone=%s user_id=%s", phone, user.id)
                return LoginResponse(account=_user_account_payload(user_to_public(user)), access_token=access_token)

        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    except HTTPException:
        raise  # re-raise 401/400 as-is
    except Exception as exc:
        logger.exception("login failed for identifier=%s — MongoDB error: %s", raw, exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Database connection error: {type(exc).__name__}: {exc}",
        )


# ── Register ─────────────────────────────────────────────────────────────────

# FIX 1: removed `response_model=UserPublic` — we now return a custom dict
#         with access_token + user so SignupForm can call loginSuccess() and
#         redirect immediately. Previously returned UserPublic which has neither.
@router.post("/register")
async def register(
    payload: RegisterRequest,
    mongo: Annotated[MongoService, Depends(get_mongo_service)],
):
    """Create a new user account and auto-login on success."""
    raw = payload.identifier.strip()
    name = (payload.name or "").strip()

    try:
        email, phone = resolve_identifier(raw)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    if phone:
        existing_phone = await mongo.get_user_by_phone(phone)
        if existing_phone:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Phone already registered")
        logger.info("register started phone=%s email=%s", phone, email)
    else:
        logger.info("register started email=%s", email)

    existing_account = await mongo.get_account_by_email(email)
    logger.info("register check email=%s found=%s", email, existing_account is not None)
    if existing_account:
        role = existing_account.role if hasattr(existing_account, "role") else existing_account.get("role")
        logger.warning("register blocked: email already registered as %s: %s", role, email)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Email already registered as {role}")

    user = await mongo.create_user(email, payload.password, name, phone)

    # Ensure name/phone/created_at are present on the stored account document
    await mongo.accounts.update_one(
        {"_id": ObjectId(str(user.id)), "role": "user"},
        {"$set": {
            "name":       name,
            "phone":      phone,
            "created_at": datetime.now(timezone.utc),
        }},
    )

    refreshed = await mongo.get_user_by_id(str(user.id))
    display_email = public_contact(
        str(refreshed.email) if refreshed else email,
        phone or (refreshed.phone if refreshed else None),
    )

    access_token = create_access_token(str(user.id))
    logger.info("register completed identifier=%s user_id=%s", raw, user.id)
    return {
        "access_token": access_token,
        "user": {
            "id":    str(user.id),
            "email": display_email,
            "name":  name,
            "phone": phone,
            "role":  "user",
        },
    }


# ── Update own profile ────────────────────────────────────────────────────────

class UpdateProfileRequest(BaseModel):
    name: Optional[str] = None
    current_password: Optional[str] = None
    new_password: Optional[str] = None


@router.put("/me")
async def update_profile(
    payload: UpdateProfileRequest,
    current_account: Annotated[Any, Depends(require_role("any"))],
    mongo: Annotated[MongoService, Depends(get_mongo_service)],
):
    account_id = str(current_account.id)
    updates: dict = {}

    if payload.name is not None:
        updates["name"] = payload.name.strip()

    if payload.new_password:
        if not payload.current_password:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password required")
        doc = await mongo.accounts.find_one({"_id": ObjectId(account_id)})
        if not doc or not verify_password(payload.current_password, doc.get("password", "")):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")
        updates["password"] = hash_password(payload.new_password)

    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No changes provided")

    await mongo.accounts.update_one({"_id": ObjectId(account_id)}, {"$set": updates})
    return {"name": updates.get("name", getattr(current_account, "name", None))}
