from datetime import datetime, timezone, timedelta
import asyncio
import logging
import secrets
from typing import Annotated, Optional, Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from bson import ObjectId

from app.auth_utils import verify_password, hash_password
from app.dependencies import (
    create_access_token,
    get_mongo_service,
    get_settings,
    admin_to_public,
    user_to_public,
    require_role,
)
from app.models.admin import AdminCreate, AdminPublic
from app.models.user import UserCreate, UserPublic
from app.services.email_service import send_signup_verification_email
from app.services.mongodb import MongoService
from app.user_display import public_contact
from app.account_identifier import normalize_phone, resolve_identifier, resolve_register_identity


router = APIRouter(prefix="/api", tags=["auth"])
logger = logging.getLogger(__name__)

SIGNUP_OTP_COLLECTION = "signup_verification_otps"


def _generate_otp() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def _generate_verification_token() -> str:
    return secrets.token_urlsafe(32)


def _otp_expiry() -> datetime:
    minutes = get_settings()["otp_expire_minutes"]
    return datetime.now(timezone.utc) + timedelta(minutes=minutes)


def _as_utc_aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


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
    email: EmailStr
    password: str
    name: Optional[str] = None
    verification_token: str = Field(..., min_length=16)
    otp: str = Field(..., min_length=4, max_length=8)


class SendSignupVerificationRequest(BaseModel):
    email: EmailStr
    identifier: Optional[str] = None


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

@router.post("/register/send-verification")
async def send_signup_verification(
    payload: SendSignupVerificationRequest,
    mongo: Annotated[MongoService, Depends(get_mongo_service)],
):
    """Send a one-time code to verify the user's email before signup."""
    email = payload.email.strip().lower()
    identifier = (payload.identifier or "").strip()

    if identifier:
        try:
            resolve_register_identity(identifier, email)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    existing_account = await mongo.get_account_by_email(email)
    if existing_account:
        role = existing_account.role if hasattr(existing_account, "role") else existing_account.get("role")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Email already registered as {role}",
        )

    if identifier and "@" not in identifier:
        phone = normalize_phone(identifier)
        existing_phone = await mongo.get_user_by_phone(phone)
        if existing_phone:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Phone already registered")

    verification_token = _generate_verification_token()
    otp = _generate_otp()
    now = datetime.now(timezone.utc)
    await mongo.db[SIGNUP_OTP_COLLECTION].update_one(
        {"email": email},
        {
            "$set": {
                "email": email,
                "verification_token": verification_token,
                "otp_hash": hash_password(otp),
                "expires_at": _otp_expiry(),
                "updated_at": now,
            },
            "$setOnInsert": {"created_at": now},
        },
        upsert=True,
    )

    try:
        await asyncio.to_thread(send_signup_verification_email, to_email=email, otp=otp)
    except RuntimeError as exc:
        logger.error("signup OTP delivery failed email=%s error=%s", email, exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to send verification email. Please try again later.",
        ) from exc

    logger.info("signup verification OTP sent email=%s", email)
    return {
        "message": "A verification code has been sent to your email.",
        "verification_token": verification_token,
    }


async def _verify_signup_otp(mongo: MongoService, *, verification_token: str, email: str, otp: str) -> None:
    token = verification_token.strip()
    code = otp.strip()
    record = await mongo.db[SIGNUP_OTP_COLLECTION].find_one({"verification_token": token})
    if not record:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired verification code")

    record_email = record.get("email", "").strip().lower()
    if record_email != email.strip().lower():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired verification code")

    expires_at = _as_utc_aware(record.get("expires_at"))
    if not expires_at or expires_at < datetime.now(timezone.utc):
        await mongo.db[SIGNUP_OTP_COLLECTION].delete_one({"verification_token": token})
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired verification code")

    if not verify_password(code, record.get("otp_hash", "")):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired verification code")

    await mongo.db[SIGNUP_OTP_COLLECTION].delete_one({"verification_token": token})


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
    email = payload.email.strip().lower()

    await _verify_signup_otp(
        mongo,
        verification_token=payload.verification_token,
        email=email,
        otp=payload.otp,
    )

    try:
        email, phone = resolve_register_identity(raw, email)
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
