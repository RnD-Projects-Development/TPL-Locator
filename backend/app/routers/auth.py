from datetime import datetime, timezone, timedelta
import asyncio
import logging
import secrets
import os
import re
from pathlib import Path
from typing import Annotated, Optional, Any

from fastapi import APIRouter, Depends, HTTPException, status, Request, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, EmailStr, Field, TypeAdapter, field_validator
from pydantic import ValidationError as PydanticValidationError
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
from app.services.email_service import send_login_otp_email
from app.services.mongodb import MongoService
from app.account_identifier import normalize_phone, phone_placeholder_email, validate_signup_contact
from app.user_display import has_real_email, is_synthetic_phone_email


router = APIRouter(prefix="/api", tags=["auth"])
logger = logging.getLogger(__name__)

LOGIN_OTP_COLLECTION = "login_otps"
PROFILE_IMAGE_DIR = Path(__file__).resolve().parent.parent / "data" / "images"
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024


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


def _normalize_login_identifier(raw: str) -> str:
    value = raw.strip()
    if "@" in value:
        return value.lower()
    return normalize_phone(value)


def _normalize_optional_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


async def _normalize_profile_email(
    value: Any,
    *,
    account_id: str,
    mongo: MongoService,
) -> Optional[str]:
    """Validate an email a user is setting on their own profile.

    Returns the lowercased address, or None to clear it. Raises 400 for a malformed
    address, a legacy placeholder, or one already held by a different account.
    """
    cleaned = _normalize_optional_text(value if isinstance(value, str) else None)
    if cleaned is None:
        return None

    email = cleaned.lower()
    try:
        TypeAdapter(EmailStr).validate_python(email)
    except PydanticValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Enter a valid email address",
        ) from exc

    # Placeholder addresses are derivable from any phone number — never let one be
    # typed in by hand, or a user could claim another account's legacy identity.
    if is_synthetic_phone_email(email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Enter a valid email address",
        )

    owner = await mongo.get_account_by_email(email)
    if owner and str(owner.id) != account_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )
    return email


def _normalize_optional_date(value: Optional[str], field_name: str) -> Optional[str]:
    cleaned = _normalize_optional_text(value)
    if cleaned is None:
        return None
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", cleaned):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{field_name} must be in YYYY-MM-DD format")
    return cleaned


def _wire_email(email: Optional[str], phone: Optional[str]) -> str:
    """Value for the `email` field on the wire.

    Phone-only accounts store NULL, but these endpoints have always returned the
    synthetic placeholder address. Regenerate it here so responses stay
    byte-identical for clients built before email became nullable. Storage is
    unaffected — nothing fake is ever written to the database.
    """
    if email:
        return email
    return phone_placeholder_email(phone or "")


def _build_profile_response(doc: dict, request: Request) -> dict:
    image_url = None
    if doc.get("profile_image_filename"):
        image_url = str(request.url_for("get_my_profile_image"))
    return {
        "id": str(doc.get("_id")),
        "role": doc.get("role"),
        "name": doc.get("name"),
        "email": _wire_email(doc.get("email"), doc.get("phone")),
        "phone": doc.get("phone"),
        "cnic": doc.get("cnic"),
        "cnic_expiry": doc.get("cnic_expiry"),
        "driving_license_no": doc.get("driving_license_no"),
        "license_expiry": doc.get("license_expiry"),
        "emergency_contact": doc.get("emergency_contact"),
        "address": doc.get("address"),
        "profile_image_url": image_url,
    }


# ── Request / Response models ────────────────────────────────────────────────

class LoginRequest(BaseModel):
    identifier: str          # email address OR phone number
    password: Optional[str] = None
    otp: Optional[str] = Field(None, min_length=4, max_length=8)
    login_token: Optional[str] = Field(None, min_length=16)
    uid: Optional[str] = None  # only needed for admin login


class SendLoginOtpRequest(BaseModel):
    identifier: str


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
    phone: str
    password: str = Field(..., min_length=6)
    name: Optional[str] = None
    email: Optional[EmailStr] = None

    @field_validator("email", mode="before")
    @classmethod
    def _blank_email_is_omitted(cls, value):
        """Treat "" / "   " as "no email given" instead of failing EmailStr.

        Clients that always send the field (web form, mobile app) submit an empty
        string rather than omitting the key; without this they get a 422 and
        phone-only signup is impossible for them.
        """
        if isinstance(value, str) and not value.strip():
            return None
        return value


# ── Login ────────────────────────────────────────────────────────────────────

async def _resolve_user_for_login_otp(mongo: MongoService, identifier: str):
    """Return (delivery_email, user) for OTP login. Users only — not admins."""
    raw = identifier.strip()
    is_email = "@" in raw

    if is_email:
        email = raw.lower()
        admin = await mongo.get_admin_by_email(email)
        if admin:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="OTP login is not available for admin accounts. Use your password.",
            )
        user = await mongo.get_user_by_email(email)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No account found with this identifier.",
            )
        return email, user

    phone = normalize_phone(raw)
    user = await mongo.get_user_by_phone(phone)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No account found with this identifier.",
        )
    if not has_real_email(user.email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OTP login requires an email address. Log in with your email or use password.",
        )
    return str(user.email).strip().lower(), user


async def _verify_login_otp(
    mongo: MongoService,
    *,
    login_token: str,
    identifier: str,
    otp: str,
):
    token = login_token.strip()
    code = otp.strip()
    record = await mongo.db[LOGIN_OTP_COLLECTION].find_one({"login_token": token})
    if not record:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired verification code")

    record_identifier = record.get("identifier", "").strip().lower()
    if record_identifier != _normalize_login_identifier(identifier):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired verification code")

    expires_at = _as_utc_aware(record.get("expires_at"))
    if not expires_at or expires_at < datetime.now(timezone.utc):
        await mongo.db[LOGIN_OTP_COLLECTION].delete_one({"login_token": token})
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired verification code")

    if not verify_password(code, record.get("otp_hash", "")):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired verification code")

    await mongo.db[LOGIN_OTP_COLLECTION].delete_one({"login_token": token})


@router.post("/login/send-verification")
async def send_login_otp(
    payload: SendLoginOtpRequest,
    mongo: Annotated[MongoService, Depends(get_mongo_service)],
):
    """Send a one-time code to the user's email for passwordless login."""
    delivery_email, _user = await _resolve_user_for_login_otp(mongo, payload.identifier)

    login_token = _generate_verification_token()
    otp = _generate_otp()
    normalized_identifier = _normalize_login_identifier(payload.identifier)
    now = datetime.now(timezone.utc)
    await mongo.db[LOGIN_OTP_COLLECTION].update_one(
        {"identifier": normalized_identifier},
        {
            "$set": {
                "identifier": normalized_identifier,
                "email": delivery_email,
                "login_token": login_token,
                "otp_hash": hash_password(otp),
                "expires_at": _otp_expiry(),
                "updated_at": now,
            },
            "$setOnInsert": {"created_at": now},
        },
        upsert=True,
    )

    try:
        await asyncio.to_thread(send_login_otp_email, to_email=delivery_email, otp=otp)
    except RuntimeError as exc:
        logger.error("login OTP delivery failed email=%s error=%s", delivery_email, exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to send verification email. Please try again later.",
        ) from exc

    logger.info("login OTP sent identifier=%s email=%s", payload.identifier.strip(), delivery_email)
    return {
        "message": "A login code has been sent to your email.",
        "login_token": login_token,
        "delivery_email": delivery_email,
    }


async def _resolve_user_for_passwordless_login(mongo: MongoService, identifier: str):
    """Resolve a user account by email or phone for password-less login.

    Users only — admin accounts are rejected (admins must use /login/portal with
    a password). Unlike the OTP flow this does NOT require a real email address,
    since no verification code is delivered.
    """
    raw = identifier.strip()
    is_email = "@" in raw

    if is_email:
        email = raw.lower()
        admin = await mongo.get_admin_by_email(email)
        if admin:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Password-less login is not available for admin accounts. Use your password.",
            )
        user = await mongo.get_user_by_email(email)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No account found with this identifier.",
            )
        return user

    phone = normalize_phone(raw)
    user = await mongo.get_user_by_phone(phone)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No account found with this identifier.",
        )
    return user


@router.post("/login", response_model=LoginResponse)
async def login(
    payload: LoginRequest,
    mongo: Annotated[MongoService, Depends(get_mongo_service)],
):
    """
    Password-less login for users (identifier = email address OR phone number).

    Provide only an `identifier`. Any `password`, `otp`, or `login_token` field is
    accepted for request-shape compatibility with the previous /login but is
    ignored — no credential is required or checked.

    Users only: admin accounts are rejected. Admin login, password login, and OTP
    login for this web app all live at /login/portal instead.
    """
    raw = payload.identifier.strip()
    if not raw:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Identifier is required")

    try:
        user = await _resolve_user_for_passwordless_login(mongo, raw)
        await mongo.accounts.update_one(
            {"_id": ObjectId(str(user.id))},
            {"$set": {"last_logged_in": datetime.now(timezone.utc)}},
        )
        access_token = create_access_token(str(user.id))
        logger.info("user password-less login completed identifier=%s user_id=%s", raw, user.id)
        return LoginResponse(account=_user_account_payload(user_to_public(user)), access_token=access_token)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("password-less login failed for identifier=%s — MongoDB error: %s", raw, exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Database connection error: {type(exc).__name__}: {exc}",
        ) from exc


# ── Portal login (exact duplicate of /login) ───────────────────────────────────

@router.post("/login/portal", response_model=LoginResponse)
async def login_portal(
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

    # OTP login path (users only)
    if payload.otp and payload.login_token:
        if payload.password:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Provide either password or OTP, not both")
        await _verify_login_otp(
            mongo,
            login_token=payload.login_token,
            identifier=raw,
            otp=payload.otp,
        )
        try:
            _delivery_email, user = await _resolve_user_for_login_otp(mongo, raw)
            await mongo.accounts.update_one(
                {"_id": ObjectId(str(user.id))},
                {"$set": {"last_logged_in": datetime.now(timezone.utc)}},
            )
            access_token = create_access_token(str(user.id))
            logger.info("user OTP login completed identifier=%s user_id=%s", raw, user.id)
            return LoginResponse(account=_user_account_payload(user_to_public(user)), access_token=access_token)
        except HTTPException:
            raise
        except Exception as exc:
            logger.exception("OTP login failed for identifier=%s — MongoDB error: %s", raw, exc)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Database connection error: {type(exc).__name__}: {exc}",
            ) from exc

    if not payload.password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password or OTP is required")

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


# ── Logout ───────────────────────────────────────────────────────────────────

@router.post("/logout")
async def logout(
    current_account: Annotated[Any, Depends(require_role("any"))],
    mongo: Annotated[MongoService, Depends(get_mongo_service)],
):
    """
    Stamp last_logged_out on the account. Presence semantics: an account is
    "online" from login until it logs out (last_logged_in > last_logged_out),
    and its "last active" time is the logout timestamp.
    """
    await mongo.accounts.update_one(
        {"_id": ObjectId(str(current_account.id))},
        {"$set": {"last_logged_out": datetime.now(timezone.utc)}},
    )
    logger.info("logout completed account_id=%s", current_account.id)
    return {"message": "Logged out"}


# ── Register ─────────────────────────────────────────────────────────────────

@router.post("/register")
async def register(
    payload: RegisterRequest,
    mongo: Annotated[MongoService, Depends(get_mongo_service)],
):
    """Create a new user account and auto-login on success.

    Required: phone, password
    Optional: name, email
    """
    name = (payload.name or "").strip()

    try:
        email, phone = validate_signup_contact(payload.email, payload.phone)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    existing_phone = await mongo.get_user_by_phone(phone)
    if existing_phone:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Phone already registered")
    logger.info("register started phone=%s email=%s", phone, email)

    # Phone-only signups store no email, so there is nothing to conflict-check.
    if email:
        existing_account = await mongo.get_account_by_email(email)
        logger.info("register check email=%s found=%s", email, existing_account is not None)
        if existing_account:
            role = existing_account.role if hasattr(existing_account, "role") else existing_account.get("role")
            logger.warning("register blocked: email already registered as %s: %s", role, email)
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Email already registered as {role}")

    user = await mongo.create_user(email, payload.password, name, phone)

    await mongo.accounts.update_one(
        {"_id": ObjectId(str(user.id)), "role": "user"},
        {"$set": {
            "name": name,
            "phone": phone,
            "created_at": datetime.now(timezone.utc),
        }},
    )

    access_token = create_access_token(str(user.id))
    logger.info("register completed email=%s phone=%s user_id=%s", email, phone, user.id)
    return {
        "access_token": access_token,
        "user": {
            "id": str(user.id),
            "email": _wire_email(email, phone),
            "name": name,
            "phone": phone,
            "role": "user",
        },
    }


# ── Generic profile API ───────────────────────────────────────────────────────

@router.get("/me/profile")
async def get_my_profile(
    request: Request,
    current_account: Annotated[Any, Depends(require_role("any"))],
    mongo: Annotated[MongoService, Depends(get_mongo_service)],
):
    doc = await mongo.accounts.find_one({"_id": ObjectId(str(current_account.id))})
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")
    return _build_profile_response(doc, request)


@router.get("/me/profile/image", name="get_my_profile_image")
async def get_my_profile_image(
    current_account: Annotated[Any, Depends(require_role("any"))],
    mongo: Annotated[MongoService, Depends(get_mongo_service)],
):
    doc = await mongo.accounts.find_one(
        {"_id": ObjectId(str(current_account.id))},
        {"profile_image_filename": 1},
    )
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")

    filename = doc.get("profile_image_filename")
    if not filename:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile image not found")

    path = PROFILE_IMAGE_DIR / filename
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile image not found")

    return FileResponse(path=str(path))


@router.put("/me/profile")
async def update_my_profile(
    request: Request,
    current_account: Annotated[Any, Depends(require_role("any"))],
    mongo: Annotated[MongoService, Depends(get_mongo_service)],
):
    account_id = str(current_account.id)
    existing = await mongo.accounts.find_one({"_id": ObjectId(account_id)})
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")

    content_type = (request.headers.get("content-type") or "").lower()
    payload: dict[str, Any] = {}
    profile_image: UploadFile | None = None

    if "application/json" in content_type:
        payload = await request.json()
        if not isinstance(payload, dict):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON body")
    else:
        form = await request.form()
        payload = dict(form)
        maybe_file = form.get("profile_image")
        # request.form() can yield Starlette UploadFile instances; use duck-typing
        # instead of strict FastAPI UploadFile isinstance checks.
        if getattr(maybe_file, "filename", None) is not None and callable(getattr(maybe_file, "read", None)):
            profile_image = maybe_file

    updates: dict[str, Any] = {}
    if "name" in payload:
        updates["name"] = _normalize_optional_text(payload.get("name")) or ""
    if "email" in payload:
        updates["email"] = await _normalize_profile_email(
            payload.get("email"), account_id=account_id, mongo=mongo
        )
    if "cnic" in payload:
        updates["cnic"] = _normalize_optional_text(payload.get("cnic"))
    if "cnic_expiry" in payload:
        updates["cnic_expiry"] = _normalize_optional_date(payload.get("cnic_expiry"), "cnic_expiry")
    if "driving_license_no" in payload:
        updates["driving_license_no"] = _normalize_optional_text(payload.get("driving_license_no"))
    if "license_expiry" in payload:
        updates["license_expiry"] = _normalize_optional_date(payload.get("license_expiry"), "license_expiry")
    if "emergency_contact" in payload:
        updates["emergency_contact"] = _normalize_optional_text(payload.get("emergency_contact"))
    if "address" in payload:
        updates["address"] = _normalize_optional_text(payload.get("address"))

    old_filename = existing.get("profile_image_filename")
    if profile_image is not None:
        ext = Path(profile_image.filename or "").suffix.lower()
        if ext not in ALLOWED_IMAGE_EXTENSIONS:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid image format")

        content = await profile_image.read()
        if not content:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Profile image is empty")
        if len(content) > MAX_PROFILE_IMAGE_BYTES:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Profile image must be <= 5MB")

        os.makedirs(PROFILE_IMAGE_DIR, exist_ok=True)
        filename = f"{account_id}_{int(datetime.now(timezone.utc).timestamp())}{ext}"
        output_path = PROFILE_IMAGE_DIR / filename
        with open(output_path, "wb") as f:
            f.write(content)
        logger.info("profile image saved account_id=%s filename=%s bytes=%s", account_id, filename, len(content))
        updates["profile_image_filename"] = filename

    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No changes provided")

    await mongo.accounts.update_one({"_id": ObjectId(account_id)}, {"$set": updates})
    updated = await mongo.accounts.find_one({"_id": ObjectId(account_id)})
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")

    if profile_image is not None and old_filename and old_filename != updates.get("profile_image_filename"):
        old_path = PROFILE_IMAGE_DIR / old_filename
        if old_path.exists() and old_path.is_file():
            old_path.unlink()

    return _build_profile_response(updated, request)


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
