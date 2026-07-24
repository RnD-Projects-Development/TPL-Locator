"""Resolve login/signup identifiers (email or Pakistani phone) for account creation."""

from __future__ import annotations

import re
from typing import Optional, Tuple

INVALID_PHONE_MSG = "Enter a valid Pakistani number (03XXXXXXXXX or +92XXXXXXXXX)"


def normalize_phone(raw: str) -> str:
    """Canonicalize a Pakistani number to the local 03XXXXXXXXX form.

    Strips separators, then folds the country code so the same number always
    produces the same lookup key:

        03001234567       -> 03001234567
        +923001234567     -> 03001234567
        0300-123 4567     -> 03001234567
        00923001234567    -> 03001234567

    Storage and lookup both go through here, so a user who signed up in one form
    can log in with the other, and the duplicate check at registration catches a
    number already held in the other form.
    """
    value = re.sub(r"[\s\-\(\)]", "", raw or "")
    for prefix in ("+92", "0092", "92"):
        if value.startswith(prefix):
            rest = value[len(prefix):]
            # Only fold when what follows is a full 10-digit subscriber number;
            # otherwise leave it alone rather than mangling unexpected input.
            if len(rest) == 10 and rest.isdigit():
                return "0" + rest
            break
    return value


def validate_pakistani_phone(phone: str) -> bool:
    p = normalize_phone(phone)
    return bool(re.fullmatch(r"03\d{9}", p) or re.fullmatch(r"\+92\d{10}", p))


def phone_placeholder_email(phone: str) -> str:
    """Legacy synthetic address for a phone-only account.

    No longer written to storage — email is NULL for phone-only accounts now.
    Retained purely to regenerate the historical value at response time so the
    API stays wire-compatible with clients built before email became nullable.
    """
    digits = re.sub(r"\D", "", phone or "")
    return f"p{digits}@accounts.tpllocator.com"


def validate_signup_contact(email: Optional[str], phone: str) -> Tuple[Optional[str], str]:
    """
    Validate signup contact.
    Phone is required; email is optional and stored as None when omitted.
    Returns (email_or_none, normalized_phone).
    """
    normalized_phone = normalize_phone(phone or "")
    if not normalized_phone:
        raise ValueError(INVALID_PHONE_MSG)
    if not validate_pakistani_phone(normalized_phone):
        raise ValueError(INVALID_PHONE_MSG)

    verified_email = (email or "").strip().lower()
    return (verified_email or None), normalized_phone


def resolve_identifier(raw: str) -> Tuple[Optional[str], Optional[str]]:
    """
    Parse email or phone identifier.
    Returns (email_or_none, phone_or_none) — exactly one is set.
    """
    value = (raw or "").strip()
    if not value:
        raise ValueError("Email or phone is required")

    if "@" in value:
        return value.lower(), None

    phone = normalize_phone(value)
    if not validate_pakistani_phone(phone):
        raise ValueError(INVALID_PHONE_MSG)

    return None, phone
