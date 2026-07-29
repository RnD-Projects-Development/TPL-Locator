"""Contact display for accounts that may have no email (phone-only signups)."""

from typing import Optional

# Legacy placeholder domains. Accounts created before email became nullable
# carry a synthetic address like p03001234567@accounts.tpllocator.com; these are
# still treated as "no email" until the migration clears them.
_SYNTHETIC_SUFFIXES = (
    "@phone.tpllocator.local",
    "@accounts.tpllocator.com",
)


def is_synthetic_phone_email(email: Optional[str]) -> bool:
    e = (email or "").strip().lower()
    return any(e.endswith(s) for s in _SYNTHETIC_SUFFIXES)


def has_real_email(email: Optional[str]) -> bool:
    """True only when the account has a genuine, deliverable address."""
    return bool((email or "").strip()) and not is_synthetic_phone_email(email)


def public_contact(email: Optional[str], phone: Optional[str] = None) -> str:
    """Return the real email, else the phone number, else ''."""
    if has_real_email(email):
        return email.strip()
    if phone and str(phone).strip():
        return str(phone).strip()
    # Legacy placeholder with no phone on the doc — recover digits from the local part.
    local = (email or "").split("@", 1)[0]
    if local.startswith("p") and len(local) > 1:
        return local[1:]
    return ""
