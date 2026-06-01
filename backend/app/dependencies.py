from datetime import datetime, timedelta
import os
from typing import Annotated, Callable, Any

import jwt
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, Request, status

from app.models.admin import AccountInDB, AdminInDB, AdminPublic
from app.models.user import UserInDB, UserPublic
from app.user_display import public_contact
from app.services.mongodb import MongoService
from app.services.citytag import CityTagClient
from app.services.location import LocationService


load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))


def get_settings():
    return {
        "mongo_uri": os.getenv("MONGO_URI", "mongodb://localhost:27017"),
        "citytag_base_url": os.getenv("CITYTAG_BASE_URL", "http://citytag.yuminstall.top"),
        "jwt_secret_key": os.getenv("JWT_SECRET_KEY", "change_this_secret_key"),
        "jwt_algorithm": os.getenv("JWT_ALGORITHM", "HS256"),
        "jwt_expire_minutes": int(os.getenv("JWT_EXPIRE_MINUTES", "1440")),
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
    account = await _get_account_from_request(request, mongo)
    if account.role != "admin":
        raise HTTPException(status_code=403, detail="Not an admin token")

    return AdminInDB(**account.dict())


async def get_current_user(
    request: Request,
    mongo: Annotated[MongoService, Depends(get_mongo_service)],
):
    """JWT-based auth dependency – returns current non-admin user."""
    account = await _get_account_from_request(request, mongo)
    if account.role != "user":
        raise HTTPException(status_code=403, detail="Not a user token")

    from app.models.user import UserInDB

    return UserInDB(**account.dict())


async def get_current_account(
    request: Request,
    mongo: Annotated[MongoService, Depends(get_mongo_service)],
):
    """Return either AdminInDB or UserInDB depending on token subject."""
    account = await _get_account_from_request(request, mongo)
    if account.role == "admin":
        return AdminInDB(**account.dict())
    if account.role == "user":
        from app.models.user import UserInDB

        return UserInDB(**account.dict())
    raise HTTPException(status_code=401, detail="Account not found")


def _decode_jwt_from_request(request: Request) -> dict[str, Any]:
    """Extract and decode JWT from Authorization header, raising HTTP errors on failure."""
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

    if not isinstance(payload, dict):
        raise HTTPException(status_code=401, detail="Invalid token payload")

    return payload


async def _get_account_from_request(
    request: Request,
    mongo: MongoService,
) -> AccountInDB:
    payload = _decode_jwt_from_request(request)
    sub = payload.get("sub")
    if not sub:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    account = await mongo.get_account_by_id(sub)
    if not account:
        raise HTTPException(status_code=401, detail="Account not found")

    return account


def require_role(role: str) -> Callable[..., Any]:
    """Factory for FastAPI dependencies that enforce a specific role.

    Usage: `Depends(require_role("admin"))` or `Depends(require_role("user"))`.
    """

    async def _dependency(
        request: Request,
        mongo: Annotated[MongoService, Depends(get_mongo_service)],
    ):
        account = await _get_account_from_request(request, mongo)

        if role not in {"admin", "user", "any"}:
            raise HTTPException(status_code=500, detail="Invalid role requirement")

        if role != "any" and account.role != role:
            raise HTTPException(status_code=403, detail=f"{role.capitalize()} role required")

        if account.role == "admin":
            return AdminInDB(**account.dict())

        if account.role == "user":
            from app.models.user import UserInDB

            return UserInDB(**account.dict())

        raise HTTPException(status_code=403, detail="Insufficient role")

    return _dependency


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
        email=public_contact(str(user.email), user.phone),
        name=user.name,
        phone=user.phone,
        admin_id=str(user.admin_id) if user.admin_id else None,
        devices=[str(d) for d in user.devices],
    )


def get_location_service(
    mongo: Annotated[MongoService, Depends(get_mongo_service)]
) -> LocationService:
    return LocationService(mongo.db)