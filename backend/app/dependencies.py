from datetime import datetime, timedelta
import os
from typing import Annotated

import jwt
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, Request, status

from app.models.admin import AdminInDB, AdminPublic
from app.models.user import UserInDB, UserPublic
from app.services.mongodb import MongoService
from app.services.citytag import CityTagClient
from app.services.location import LocationService


load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))


def _env_strip(key: str, default: str | None = None) -> str | None:
    raw = os.getenv(key, default)
    if raw is None:
        return None
    s = str(raw).strip()
    if len(s) >= 2 and ((s[0] == s[-1] == '"') or (s[0] == s[-1] == "'")):
        s = s[1:-1].strip()
    return s


def get_settings():
    return {
        "mongo_uri": os.getenv("MONGO_URI", "mongodb://localhost:27017"),
        "citytag_base_url": os.getenv("CITYTAG_BASE_URL", "http://citytag.yuminstall.top"),
        "jwt_secret_key": os.getenv("JWT_SECRET_KEY", "change_this_secret_key"),
        "jwt_algorithm": os.getenv("JWT_ALGORITHM", "HS256"),
        "jwt_expire_minutes": int(os.getenv("JWT_EXPIRE_MINUTES", "1440")),
        # CityTag sync account (device registry + polling)
        "citytag_sync_email": _env_strip("CITYTAG_SYNC_EMAIL", "abdulsaboornaeem@gmail.com"),
        "citytag_sync_password": _env_strip("CITYTAG_SYNC_PASSWORD")
        or _env_strip("CITYTAG_PASSWORD")
        or "Trakker123",
        "citytag_sync_uid": _env_strip("CITYTAG_SYNC_UID", "251799"),
        # TrackSolid / Jimi
        "tracksolid_app_key": _env_strip("TRACKSOLID_APP_KEY") or _env_strip("APP_KEY", ""),
        "tracksolid_app_secret": _env_strip("TRACKSOLID_APP_SECRET") or _env_strip("APP_SECRET", ""),
        "tracksolid_account": _env_strip("TRACKSOLID_ACCOUNT") or _env_strip("ACCOUNT", ""),
        "tracksolid_password_md5": _env_strip("TRACKSOLID_PASSWORD_MD5") or _env_strip("PASSWORD_MD5", ""),
        "tracksolid_base_url": _env_strip("TRACKSOLID_BASE_URL") or _env_strip(
            "BASE_URL", "https://eu-open.tracksolidpro.com/route/rest"
        ),
        # Zoqin
        "zoqin_login_url": _env_strip("ZOQIN_LOGIN_URL", "https://www.zoqin.com/ZQGPS/User/Login"),
        "zoqin_bind_url": _env_strip(
            "ZOQIN_BIND_URL", "https://www.zoqin.com/ZQGPS/Bind/allBind"
        ),
        "zoqin_location_url": _env_strip(
            "ZOQIN_LOCATION_URL", "https://www.zoqin.com/ZQGPS/Device/getLocationListByTimeAndSN"
        ),
        "zoqin_admin_email": _env_strip("ZOQIN_ADMIN_EMAIL", "abdul.saboor@tpltrakker.com"),
        "zoqin_admin_password": _env_strip("ZOQIN_ADMIN_PASSWORD", "Trakker123"),
        # Device registry admins
        "vendor_admin_tpl_email": _env_strip("VENDOR_ADMIN_TPL_EMAIL", "tpl@gmail.com"),
        "vendor_admin_citytag_email": _env_strip(
            "VENDOR_ADMIN_CITYTAG_EMAIL", "abdulsaboornaeem@gmail.com"
        ),
    }


def get_mongo_service() -> MongoService:
    settings = get_settings()
    return MongoService(settings["mongo_uri"])


def get_citytag_client() -> CityTagClient:
    settings = get_settings()
    return CityTagClient(settings["citytag_base_url"])


def create_access_token(subject: str) -> str:
    settings = get_settings()
    now = datetime.utcnow()
    expire = now + timedelta(minutes=settings["jwt_expire_minutes"])
    payload = {
        "sub": subject,
        "iat": now.timestamp(),
        "exp": expire.timestamp(),
    }
    token = jwt.encode(payload, settings["jwt_secret_key"], algorithm=settings["jwt_algorithm"])
    return token


async def get_current_admin(
    request: Request,
    mongo: Annotated[MongoService, Depends(get_mongo_service)],
) -> AdminInDB:
    """JWT-based auth dependency – returns current admin."""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization token",
        )

    token = auth_header.split(" ", 1)[1].strip()
    settings = get_settings()
    try:
        payload = jwt.decode(
            token,
            settings["jwt_secret_key"],
            algorithms=[settings["jwt_algorithm"]],
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    admin_id = payload.get("sub")
    if not admin_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    admin = await mongo.get_admin_by_id(admin_id)
    if not admin:
        raise HTTPException(status_code=403, detail="Not an admin token")

    return admin


async def get_current_user(
    request: Request,
    mongo: Annotated[MongoService, Depends(get_mongo_service)],
):
    """JWT-based auth dependency – returns current non-admin user."""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization token",
        )
    token = auth_header.split(" ", 1)[1].strip()
    settings = get_settings()
    try:
        payload = jwt.decode(
            token,
            settings["jwt_secret_key"],
            algorithms=[settings["jwt_algorithm"]],
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    user = await mongo.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=403, detail="Not a user token")

    return user


async def get_current_account(
    request: Request,
    mongo: Annotated[MongoService, Depends(get_mongo_service)],
):
    """Return either AdminInDB or UserInDB depending on token subject."""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization token",
        )
    token = auth_header.split(" ", 1)[1].strip()
    settings = get_settings()
    try:
        payload = jwt.decode(
            token,
            settings["jwt_secret_key"],
            algorithms=[settings["jwt_algorithm"]],
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    sub = payload.get("sub")
    if not sub:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    admin = await mongo.get_admin_by_id(sub)
    if admin:
        return admin

    user = await mongo.get_user_by_id(sub)
    if user:
        return user

    raise HTTPException(status_code=401, detail="Account not found")


def admin_to_public(admin: AdminInDB) -> AdminPublic:
    primary_device = admin.reg_devices[0] if admin.reg_devices else ""
    return AdminPublic(
        id=str(admin.id),
        email=admin.email,
        uid=admin.uid,
        created_at=admin.created_at,
        reg_device=primary_device,
        reg_devices=admin.reg_devices,
    )


def user_to_public(user: UserInDB) -> UserPublic:
    return UserPublic(
        id=str(user.id),
        email=user.email,
        name=user.name,
        admin_id=str(user.admin_id) if user.admin_id else None,
        devices=[str(d) for d in user.devices],
    )


def get_location_service(
    mongo: Annotated[MongoService, Depends(get_mongo_service)]
) -> LocationService:
    return LocationService(mongo.db)