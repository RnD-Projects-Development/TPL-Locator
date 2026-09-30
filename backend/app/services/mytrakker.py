"""MyTrakker WCF service client — e-commerce payment receipts (locator orders).

The Orders page is backed by TPL's existing MyTrakker mobile-app service, the
same endpoint the production Flutter app calls:

    GET {base}/GetEcommercePaymentReceipt?userid=..&userpassword=..&phone=all

`phone=all` returns every receipt ever raised; a specific MSISDN returns just
that buyer's receipts. The service speaks WCF-style JSON — a successful call
returns a bare JSON array — but any server-side fault comes back as an HTTP 400
carrying an HTML error page, so every response is content-type checked before
parsing and faults are surfaced as a readable message rather than a JSON crash.

Receipt timestamps arrive as US-format local wall-clock ("9/25/2026 3:16:31 PM")
from the payment gateway. They are normalised to a naive ISO string and left in
that wall-clock — the same convention the rest of this backend uses for vendor
timestamps, so no ±5h shift is applied anywhere.
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
import time
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import httpx

logger = logging.getLogger(__name__)

DEFAULT_BASE_URL = "https://mytrakker.tpltrakker.com/TrakkerAppLatestServicesFlutterV758/Service1.svc"

# The "all" call walks every receipt in the gateway, so it is slow; the cache
# keeps the Orders page responsive and keeps repeated page loads off the WCF box.
CACHE_TTL_SECONDS = 120
REQUEST_TIMEOUT_SECONDS = 120.0

# The receipt call is authenticated by an EncryptedID header carrying a key
# minted by GetEncrptedKey. A key is time-bound — once stale the service answers
# "Invalid Request,please correct your date time" — so one is reused only
# briefly, and any refusal re-mints and retries once.
KEY_TTL_SECONDS = 240

_cache: Dict[str, Tuple[float, List[dict]]] = {}
_cache_lock = asyncio.Lock()

_key_cache: Optional[Tuple[float, str]] = None
_key_lock = asyncio.Lock()


class MyTrakkerError(RuntimeError):
    """Upstream MyTrakker service was unreachable or returned a fault."""


def get_mytrakker_settings() -> dict:
    return {
        "base_url": (os.getenv("MYTRAKKER_BASE_URL") or DEFAULT_BASE_URL).rstrip("/"),
        "userid": os.getenv("MYTRAKKER_USERID", "MpUser01"),
        "userpassword": os.getenv("MYTRAKKER_PASSWORD", "MpUserPassword01"),
    }


# ── Field helpers ────────────────────────────────────────────────────────────

def _s(value: Any) -> Optional[str]:
    """Trim to a clean string; empty / whitespace / null-ish becomes None."""
    if value is None:
        return None
    text = str(value).strip()
    if not text or text.lower() in ("null", "none"):
        return None
    return text


def _num(value: Any) -> Optional[float]:
    """Parse an amount that may arrive as "50", "1,250.00" or "" ."""
    text = _s(value)
    if text is None:
        return None
    text = text.replace(",", "")
    # Strip a stray currency prefix/suffix if the gateway ever adds one.
    match = re.search(r"-?\d+(?:\.\d+)?", text)
    if not match:
        return None
    try:
        return float(match.group(0))
    except ValueError:
        return None


_DATE_FORMATS = (
    "%m/%d/%Y %I:%M:%S %p",   # 9/25/2026 3:16:31 PM  ← what the gateway sends
    "%m/%d/%Y %I:%M %p",
    "%m/%d/%Y %H:%M:%S",
    "%m/%d/%Y",
    "%Y-%m-%dT%H:%M:%S",
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%d",
)


def _parse_date(value: Any) -> Optional[str]:
    """Normalise a gateway timestamp to a naive ISO string (wall-clock kept)."""
    text = _s(value)
    if text is None:
        return None
    # WCF sometimes emits /Date(1696000000000+0500)/ for DateTime members.
    wcf = re.match(r"^/Date\((-?\d+)([+-]\d{4})?\)/$", text)
    if wcf:
        try:
            return datetime.utcfromtimestamp(int(wcf.group(1)) / 1000).isoformat()
        except (ValueError, OverflowError, OSError):
            return None
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(text, fmt).isoformat()
        except ValueError:
            continue
    return None


def _parse_notes(value: Any) -> dict:
    """Pull the line-item figures out of the free-text Notes field.

    Format seen in production:
        "Unit price: 50 | No of units: 1 | Total price: 50"
    Any missing or reworded part simply yields None rather than failing.
    """
    text = _s(value)
    out: Dict[str, Optional[float]] = {"unit_price": None, "units": None, "notes_total": None}
    if text is None:
        return out

    unit = re.search(r"unit\s*price\s*[:=]\s*([\d.,]+)", text, re.I)
    qty = re.search(r"(?:no\.?\s*of\s*units|units|qty|quantity)\s*[:=]\s*([\d.,]+)", text, re.I)
    total = re.search(r"total\s*price\s*[:=]\s*([\d.,]+)", text, re.I)

    if unit:
        out["unit_price"] = _num(unit.group(1))
    if qty:
        qty_val = _num(qty.group(1))
        out["units"] = int(qty_val) if qty_val is not None and qty_val.is_integer() else qty_val
    if total:
        out["notes_total"] = _num(total.group(1))
    return out


def normalize_receipt(row: dict) -> dict:
    """Map one upstream PascalCase receipt onto the portal's snake_case shape.

    `PaymentStatus` is deliberately dropped: every row this endpoint returns is
    an already-collected payment, so the portal shows no payment-state column.
    """
    if not isinstance(row, dict):
        return {}

    first = _s(row.get("FirstName"))
    last = _s(row.get("LastName"))
    full_name = " ".join(part for part in (first, last) if part) or _s(row.get("Account_Title"))

    line = _parse_notes(row.get("Notes"))
    total_amount = _num(row.get("TotalAmount"))
    amount_paid = _num(row.get("Amount_Paid"))

    return {
        # Identity of the order
        "payment_id":       _s(row.get("PaymentId")),
        "invoice_no":       _s(row.get("Invoice_Nos")),
        "transaction_id":   _s(row.get("Transaction_Id")),
        "trans_id":         _s(row.get("TransId")),
        "reference_id":     _s(row.get("ReferenceID")),

        # Buyer
        "customer_name":    full_name,
        "first_name":       first,
        "last_name":        last,
        "account_title":    _s(row.get("Account_Title")),
        "email":            _s(row.get("Email")),
        "phone":            _s(row.get("Phone")),
        "cnic":             _s(row.get("CNIC")),
        "company_name":     _s(row.get("CompanyName")),
        "sales_for":        _s(row.get("SalesFor")),

        # Delivery address
        "address":          _s(row.get("Address")),
        "city":             _s(row.get("City")),
        "postal_code":      _s(row.get("PostalCode")),
        "country":          _s(row.get("Country")),

        # What was bought
        "product":          _s(row.get("Product")),
        "product_detail":   _s(row.get("ProductDetail")),
        "unit_price":       line["unit_price"],
        "units":            line["units"],
        "notes":            _s(row.get("Notes")),

        # Money
        "amount_paid":      amount_paid,
        "total_amount":     total_amount if total_amount is not None else line["notes_total"],

        # How it was paid
        "payment_type":     _s(row.get("Payment_Type")),
        "transaction_type": _s(row.get("TransactionType")),
        "bank_type":        _s(row.get("BankType")),
        "card_no":          _s(row.get("Card_No")),
        "source":           _s(row.get("Source")),

        # When
        "payment_date":     _parse_date(row.get("Payment_Date")),
        "payment_date_raw": _s(row.get("Payment_Date")),

        # Misc gateway references, shown on the detail panel only
        "consumer_no":      _s(row.get("ConsumerNo")),
        "registration_no":  _s(row.get("Registration_No")),
    }


# ── Upstream call ────────────────────────────────────────────────────────────

# The live envelope nests the array two levels down:
#   {"GetEcommercePaymentReceiptResult": {"Status": "1", "Message": null,
#                                         "Receipts": [ {...}, {...} ]}}
# Status "0" carries a Message explaining the refusal and an empty Receipts
# list, which must surface as an error rather than as "this buyer has no
# orders" — the two look identical to anyone reading the table.
_RECEIPT_KEYS = ("Invoice_Nos", "PaymentId", "Transaction_Id")
_LIST_KEY_PREFERENCE = ("Receipts", "Receipt", "Data", "Result", "d")
_OK_STATUSES = ("1", "true", "success", "ok")


def _find_envelope(payload: Any, depth: int = 0) -> Optional[dict]:
    """Locate the dict carrying Status / Message, however deeply it is wrapped."""
    if depth > 4 or not isinstance(payload, dict):
        return None
    if "Status" in payload or "Message" in payload:
        return payload
    for value in payload.values():
        found = _find_envelope(value, depth + 1)
        if found is not None:
            return found
    return None


def _extract_rows(payload: Any, depth: int = 0) -> List[dict]:
    """Pull the receipt list out of whatever envelope WCF wrapped it in.

    Recurses, because the production envelope nests the array inside a result
    object rather than returning it bare.
    """
    if payload is None or depth > 4:
        return []
    if isinstance(payload, list):
        return [r for r in payload if isinstance(r, dict)]
    if isinstance(payload, dict):
        # A single receipt returned bare.
        if any(k in payload for k in _RECEIPT_KEYS):
            return [payload]
        # Prefer the known list keys before falling back to any list at all.
        for key in _LIST_KEY_PREFERENCE:
            value = payload.get(key)
            if isinstance(value, list):
                return [r for r in value if isinstance(r, dict)]
        for value in payload.values():
            rows = _extract_rows(value, depth + 1)
            if rows:
                return rows
    return []


def _check_envelope(payload: Any) -> None:
    """Raise if the service answered 200 but refused the request in the body."""
    envelope = _find_envelope(payload)
    if envelope is None:
        return
    status = str(envelope.get("Status") or "").strip().lower()
    if status and status not in _OK_STATUSES:
        message = _s(envelope.get("Message")) or f"the service reported status {status!r}"
        raise MyTrakkerError(f"The MyTrakker payment service refused the request: {message}")


def _fault_message(body: str) -> str:
    """Turn a WCF HTML error page into one readable sentence."""
    match = re.search(r"The exception message is '([^']+)'", body or "")
    if match:
        return match.group(1)
    text = re.sub(r"<[^>]+>", " ", body or "")
    text = re.sub(r"\s+", " ", text).strip()
    return text[:300] or "no response body"


async def _request_json(client: httpx.AsyncClient, url: str, params: dict, headers: dict, what: str) -> Any:
    """GET and parse JSON, turning transport and WCF faults into MyTrakkerError.

    Faults arrive as an HTML error page with a 4xx, so the content type is
    checked before anything is handed to the JSON parser.
    """
    try:
        res = await client.get(url, params=params, headers=headers)
    except httpx.HTTPError as exc:
        logger.warning("mytrakker %s request failed: %s", what, exc)
        raise MyTrakkerError(f"Could not reach the MyTrakker payment service: {exc}") from exc

    # Rejected credentials come back as a 200 with a completely empty body
    # rather than as an error status, so that case is named explicitly.
    if res.status_code < 400 and not (res.text or "").strip():
        raise MyTrakkerError(f"The MyTrakker payment service returned an empty response for the {what} call.")

    content_type = (res.headers.get("content-type") or "").lower()
    if res.status_code >= 400 or "json" not in content_type:
        detail = _fault_message(res.text)
        logger.warning(
            "mytrakker %s fault status=%s content_type=%s detail=%s",
            what, res.status_code, content_type or "-", detail,
        )
        raise MyTrakkerError(
            f"The MyTrakker payment service returned an error (HTTP {res.status_code}): {detail}"
        )

    try:
        return res.json()
    except ValueError as exc:
        logger.warning("mytrakker %s unparseable: %s", what, exc)
        raise MyTrakkerError("The MyTrakker payment service returned a malformed response.") from exc


async def _mint_key(client: httpx.AsyncClient, cfg: dict) -> str:
    """Exchange the service credentials for an EncryptedID key."""
    try:
        payload = await _request_json(
            client,
            f"{cfg['base_url']}/GetEncrptedKey",
            {"userid": cfg["userid"], "userpassword": cfg["userpassword"]},
            {"Accept": "application/json"},
            "key",
        )
    except MyTrakkerError as exc:
        if "empty response" in str(exc):
            raise MyTrakkerError(
                "The MyTrakker payment service rejected the configured credentials "
                "(MYTRAKKER_USERID / MYTRAKKER_PASSWORD)."
            ) from exc
        raise
    key = _s(payload.get("EncryptKey")) if isinstance(payload, dict) else None
    login_status = _s(payload.get("LoginStatus")) if isinstance(payload, dict) else None
    if not key or login_status not in ("1", "true", None):
        raise MyTrakkerError(
            "The MyTrakker payment service rejected the configured credentials "
            f"(LoginStatus {login_status!r})."
        )
    return key


async def _get_key(client: httpx.AsyncClient, cfg: dict, *, force: bool = False) -> str:
    global _key_cache
    async with _key_lock:
        if not force and _key_cache and _key_cache[0] > time.monotonic():
            return _key_cache[1]
        key = await _mint_key(client, cfg)
        _key_cache = (time.monotonic() + KEY_TTL_SECONDS, key)
        logger.info("mytrakker key minted")
        return key


def invalidate_key_cache() -> None:
    global _key_cache
    _key_cache = None


async def _fetch_upstream(phone: str) -> List[dict]:
    """Fetch raw receipts for `phone`, authenticating with an EncryptedID key.

    A cached key that the service has since rejected is re-minted once and the
    call retried, so an expired key costs one extra round trip rather than an
    error on the page.
    """
    cfg = get_mytrakker_settings()
    url = f"{cfg['base_url']}/GetEcommercePaymentReceipt"
    params = {
        "userid": cfg["userid"],
        "userpassword": cfg["userpassword"],
        "phone": phone,
    }

    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
        for attempt in (0, 1):
            key = await _get_key(client, cfg, force=(attempt == 1))
            payload = await _request_json(
                client, url, params,
                {"Accept": "application/json", "EncryptedID": key},
                "receipts",
            )
            try:
                # A 200 with Status "0" is a refusal, not an empty result set.
                _check_envelope(payload)
            except MyTrakkerError as exc:
                # Any refusal gets one retry with a freshly minted key. A stale
                # key is not reported consistently — an invalid one comes back
                # as "Invalid Request,please correct your date time", not as a
                # credential error — so matching on the message text is not
                # reliable, and re-minting costs one cheap round trip.
                if attempt == 0:
                    logger.info("mytrakker refusal (%s) — re-minting key and retrying", exc)
                    continue
                raise
            break

    rows = _extract_rows(payload)
    logger.info("mytrakker receipts fetched phone=%s rows=%s", phone, len(rows))
    return rows


async def get_receipts(phone: str = "all", *, refresh: bool = False) -> List[dict]:
    """Return normalised receipts for `phone` ("all" for every receipt).

    Results are cached for CACHE_TTL_SECONDS; `refresh=True` forces a re-fetch.
    """
    key = (phone or "all").strip() or "all"

    if not refresh:
        entry = _cache.get(key)
        if entry and entry[0] > time.monotonic():
            return entry[1]

    async with _cache_lock:
        # Another caller may have populated the cache while we waited.
        entry = _cache.get(key)
        if not refresh and entry and entry[0] > time.monotonic():
            return entry[1]

        rows = await _fetch_upstream(key)
        orders = [o for o in (normalize_receipt(r) for r in rows) if o]
        _cache[key] = (time.monotonic() + CACHE_TTL_SECONDS, orders)
        return orders


def invalidate_receipts_cache(phone: Optional[str] = None) -> None:
    if phone is None:
        _cache.clear()
    else:
        _cache.pop((phone or "all").strip() or "all", None)
