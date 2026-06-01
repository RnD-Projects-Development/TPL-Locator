"""Hide internal placeholder emails for phone-only accounts in API responses."""

from typing import Optional

_SYNTHETIC_SUFFIXES = (
    "@phone.tpllocator.local",
    "@accounts.tpllocator.com",
)


def is_synthetic_phone_email(email: Optional[str]) -> bool:
    e = (email or "").strip().lower()
    return any(e.endswith(s) for s in _SYNTHETIC_SUFFIXES)


def public_contact(email: Optional[str], phone: Optional[str] = None) -> str:
    """Return phone for phone-only signups; otherwise the real email."""
    if not email:
        return (phone or "").strip()
    if not is_synthetic_phone_email(email):
        return email.strip()
    if phone and str(phone).strip():
        return str(phone).strip()
    local = email.split("@", 1)[0]
    if local.startswith("p") and len(local) > 1:
        return local[1:]
    return local
