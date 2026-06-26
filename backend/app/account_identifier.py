"""Resolve login/signup identifiers (email or Pakistani phone) for account creation."""

from __future__ import annotations

import re
from typing import Optional, Tuple

INVALID_PHONE_MSG = "Enter a valid Pakistani number (03XXXXXXXXX or +92XXXXXXXXX)"


def normalize_phone(raw: str) -> str:
    return re.sub(r"[\s\-\(\)]", "", raw)


def validate_pakistani_phone(phone: str) -> bool:
    p = normalize_phone(phone)
    return bool(re.fullmatch(r"03\d{9}", p) or re.fullmatch(r"\+92\d{10}", p))


def phone_placeholder_email(phone: str) -> str:
    digits = re.sub(r"\D", "", phone)
    return f"p{digits}@accounts.tpllocator.com"


def resolve_register_identity(raw: str, email: str) -> Tuple[str, Optional[str]]:
    """
    Parse signup identifier plus verified email.
    Returns (account_email, phone_or_none).
    """
    identifier = (raw or "").strip()
    verified_email = (email or "").strip().lower()
    if not verified_email:
        raise ValueError("Email is required")

    if "@" in identifier:
        id_email = identifier.strip().lower()
        if id_email != verified_email:
            raise ValueError("Email must match the email used as identifier")
        return verified_email, None

    phone = normalize_phone(identifier)
    if not validate_pakistani_phone(phone):
        raise ValueError(INVALID_PHONE_MSG)

    return verified_email, phone


def resolve_identifier(raw: str) -> Tuple[str, Optional[str]]:
    """
    Parse email or phone identifier.
    Returns (storage_email, phone_or_none).
    """
    value = (raw or "").strip()
    if not value:
        raise ValueError("Email or phone is required")

    if "@" in value:
        return value.lower(), None

    phone = normalize_phone(value)
    if not validate_pakistani_phone(phone):
        raise ValueError(INVALID_PHONE_MSG)

    return phone_placeholder_email(phone), phone
