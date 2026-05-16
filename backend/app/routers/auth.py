from datetime import datetime, timezone
import logging
import re
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from bson import ObjectId

from app.auth_utils import verify_password
from app.dependencies import (
    create_access_token,
    get_mongo_service,
    admin_to_public,
    user_to_public,
)
from app.models.admin import AdminCreate, AdminPublic
from app.models.user import UserCreate, UserPublic
from app.services.mongodb import MongoService


router = APIRouter(prefix="/api", tags=["auth"])
logger = logging.getLogger(__name__)


# ── Phone helpers ────────────────────────────────────────────────────────────

def _normalize_phone(raw: str) -> str:
    """Strip spaces, dashes, and brackets from a phone string."""
    return re.sub(r'[\s\-\(\)]', '', raw)


def _validate_pakistani_phone(phone: str) -> bool:
    """Return True if the normalized phone matches 03XXXXXXXXX or +92XXXXXXXXX."""
    p = _normalize_phone(phone)
    return bool(re.fullmatch(r'03\d{9}', p) or re.fullmatch(r'\+92\d{10}', p))


# ── Request / Response models ────────────────────────────────────────────────

class LoginRequest(BaseModel):
    identifier: str          # email address OR phone number
    password: str
    uid: Optional[str] = None  # only needed for admin login


class LoginResponse(BaseModel):
    admin: Optional[AdminPublic] = None
    user: Optional["UserPublic"] = None
    role: str
    access_token: str
    token_type: str = "bearer"


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: Optional[str] = None
    phone: str               # required — Pakistani format


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
                return LoginResponse(admin=admin_to_public(admin), role="admin", access_token=access_token)

            # User by email
            user = await mongo.get_user_by_email(email)
            if user and verify_password(payload.password, user.password):
                await mongo.accounts.update_one(
                    {"_id": ObjectId(str(user.id))},
                    {"$set": {"last_logged_in": datetime.now(timezone.utc)}},
                )
                access_token = create_access_token(str(user.id))
                logger.info("user login completed email=%s user_id=%s", email, user.id)
                return LoginResponse(user=user_to_public(user), role="user", access_token=access_token)

        else:
            # Phone path — users only, skip admin table
            phone = _normalize_phone(raw)
            user = await mongo.get_user_by_phone(phone)
            if user and verify_password(payload.password, user.password):
                await mongo.accounts.update_one(
                    {"_id": ObjectId(str(user.id))},
                    {"$set": {"last_logged_in": datetime.now(timezone.utc)}},
                )
                access_token = create_access_token(str(user.id))
                logger.info("user login by phone completed phone=%s user_id=%s", phone, user.id)
                return LoginResponse(user=user_to_public(user), role="user", access_token=access_token)

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
    email = payload.email.strip().lower()
    logger.info("register started email=%s", email)
    
    # Check if email already exists in accounts collection with any role
    existing_account = await mongo.get_account_by_email(email)
    logger.info("register check email=%s found=%s", email, existing_account is not None)
    if existing_account:
        role = existing_account.role if hasattr(existing_account, 'role') else existing_account.get("role")
        logger.warning("register blocked: email already registered as %s: %s", role, email)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Email already registered as {role}")
    
    name = (payload.name or "").strip()

    user = await mongo.create_user(email, payload.password, name, phone)



    # FIX 2: explicitly stamp name + phone + created_at on the doc.
    # create_user() may not write these fields depending on its implementation.
    await mongo.accounts.update_one(
        {"_id": ObjectId(str(user.id)), "role": "user"},
        {"$set": {
            "name":       name,
            "phone":      phone,
            "created_at": datetime.now(timezone.utc),
        }},
    )

    access_token = create_access_token(str(user.id))
    logger.info("register completed email=%s user_id=%s", payload.email, user.id)
    return {
        "access_token": access_token,
        "user": {
            "id":    str(user.id),
            "email": user.email,
            "name":  name,

            "phone": phone,

            "role":  "user",

        },
    }
