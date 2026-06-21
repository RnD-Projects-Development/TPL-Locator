"""Forgot-password flow: request OTP by email, then reset password after verification."""
from __future__ import annotations

import asyncio
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Annotated

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field

from app.auth_utils import hash_password, verify_password
from app.dependencies import get_mongo_service, get_settings
from app.services.email_service import send_otp_email
from app.services.mongodb import MongoService

router = APIRouter(prefix="/api/forgot-password", tags=["forgot-password"])
logger = logging.getLogger(__name__)

OTP_COLLECTION = "password_reset_otps"


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ForgotPasswordReset(BaseModel):
    reset_token: str = Field(..., min_length=16)
    otp: str = Field(..., min_length=4, max_length=8)
    new_password: str = Field(..., min_length=6)


def _generate_otp() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def _generate_reset_token() -> str:
    return secrets.token_urlsafe(32)


def _otp_expiry() -> datetime:
    minutes = get_settings()["otp_expire_minutes"]
    return datetime.now(timezone.utc) + timedelta(minutes=minutes)


def _as_utc_aware(dt: datetime | None) -> datetime | None:
    """PyMongo returns naive UTC datetimes; normalize before comparisons."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


@router.post("/request")
async def request_password_reset(
    payload: ForgotPasswordRequest,
    mongo: Annotated[MongoService, Depends(get_mongo_service)],
):
    """
    Send a one-time password to the account email.
    Returns 400 if no account exists for the email.
    """
    email = payload.email.strip().lower()
    account = await mongo.get_account_by_email(email)

    if not account:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No account found with this email address.",
        )

    reset_token = _generate_reset_token()
    otp = _generate_otp()
    now = datetime.now(timezone.utc)
    await mongo.db[OTP_COLLECTION].update_one(
        {"email": email},
        {
            "$set": {
                "email": email,
                "reset_token": reset_token,
                "otp_hash": hash_password(otp),
                "expires_at": _otp_expiry(),
                "updated_at": now,
            },
            "$setOnInsert": {"created_at": now},
        },
        upsert=True,
    )
    try:
        await asyncio.to_thread(send_otp_email, to_email=email, otp=otp)
    except RuntimeError as exc:
        logger.error("OTP delivery failed email=%s error=%s", email, exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to send reset email. Please try again later.",
        ) from exc
    logger.info("password reset OTP requested email=%s role=%s", email, account.role)

    return {
        "message": "A verification code has been sent to your email.",
        "reset_token": reset_token,
    }


@router.post("/reset")
async def reset_password_with_otp(
    payload: ForgotPasswordReset,
    mongo: Annotated[MongoService, Depends(get_mongo_service)],
):
    """Verify OTP and set a new password."""
    reset_token = payload.reset_token.strip()
    otp = payload.otp.strip()

    record = await mongo.db[OTP_COLLECTION].find_one({"reset_token": reset_token})
    if not record:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired code")

    email = record.get("email", "").strip().lower()
    expires_at = _as_utc_aware(record.get("expires_at"))
    if not email or not expires_at or expires_at < datetime.now(timezone.utc):
        await mongo.db[OTP_COLLECTION].delete_one({"reset_token": reset_token})
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired code")

    if not verify_password(otp, record.get("otp_hash", "")):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired code")

    account = await mongo.get_account_by_email(email)
    if not account:
        await mongo.db[OTP_COLLECTION].delete_one({"reset_token": reset_token})
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired code")

    await mongo.accounts.update_one(
        {"_id": ObjectId(str(account.id))},
        {"$set": {"password": hash_password(payload.new_password)}},
    )
    await mongo.db[OTP_COLLECTION].delete_one({"reset_token": reset_token})

    logger.info("password reset completed email=%s role=%s", email, account.role)
    return {"message": "Password updated successfully. You can log in with your new password."}
