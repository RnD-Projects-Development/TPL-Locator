"""Canonical device registry (`app/data/devices.json`) for multi-vendor sync."""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

_DATA_DIR = Path(__file__).resolve().parents[1] / "data"
DEVICES_JSON_PATH = _DATA_DIR / "devices.json"
LEGACY_ZOQIN_JSON_PATH = _DATA_DIR / "zoqin_devices.json"


def normalize_vendor(value: Optional[str]) -> str:
    if not value:
        return ""
    s = str(value).strip().lower().replace(" ", "").replace("_", "")
    if s in ("citytag", "city"):
        return "citytag"
    if s in ("zoqin",):
        return "zoqin"
    if s in ("tracksolid", "tracksolidpro", "track", "jimi"):
        return "tracksolid"
    return s


def _migrate_legacy_zoqin(tpl_admin_email: str) -> None:
    try:
        with LEGACY_ZOQIN_JSON_PATH.open("r", encoding="utf-8") as fp:
            payload = json.load(fp)
    except Exception:
        logger.exception("device_registry legacy zoqin read failed")
        return

    block = payload.get("devices", []) if isinstance(payload, dict) else payload
    if not isinstance(block, list):
        return

    devices: List[Dict[str, Any]] = []
    seen: set[str] = set()
    for item in block:
        sn = item if isinstance(item, str) else (item.get("sn") if isinstance(item, dict) else None)
        if not sn:
            continue
        sn = str(sn).strip()
        if not sn or sn in seen:
            continue
        seen.add(sn)
        devices.append({"sn": sn, "admin": tpl_admin_email, "vendor": "zoqin"})

    if not devices:
        return

    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    with DEVICES_JSON_PATH.open("w", encoding="utf-8") as fp:
        json.dump({"devices": devices}, fp, indent=2, ensure_ascii=False)
    logger.info("device_registry migrated %s entries from zoqin_devices.json", len(devices))


def load_devices(*, tpl_admin_email: str) -> List[Dict[str, Any]]:
    if not DEVICES_JSON_PATH.exists() and LEGACY_ZOQIN_JSON_PATH.exists():
        _migrate_legacy_zoqin(tpl_admin_email)

    if not DEVICES_JSON_PATH.exists():
        logger.warning("device_registry missing file path=%s", DEVICES_JSON_PATH)
        return []

    try:
        with DEVICES_JSON_PATH.open("r", encoding="utf-8") as fp:
            payload = json.load(fp)
    except Exception:
        logger.exception("device_registry read failed path=%s", DEVICES_JSON_PATH)
        return []

    block = payload.get("devices", []) if isinstance(payload, dict) else payload
    if not isinstance(block, list):
        return []

    out: List[Dict[str, Any]] = []
    for row in block:
        if isinstance(row, str):
            sn = row.strip()
            if sn:
                out.append({"sn": sn, "admin": tpl_admin_email, "vendor": "zoqin"})
            continue
        if not isinstance(row, dict):
            continue
        sn = row.get("sn")
        if not sn:
            continue
        admin = (row.get("admin") or tpl_admin_email).strip().lower()
        vendor = normalize_vendor(row.get("vendor"))
        if not vendor:
            vendor = "zoqin"
        out.append({"sn": str(sn).strip(), "admin": admin, "vendor": vendor})
    return out


def index_by_sn(devices: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    return {d["sn"]: d for d in devices if d.get("sn")}


def save_devices(devices: List[Dict[str, Any]]) -> None:
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    tmp = DEVICES_JSON_PATH.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as fp:
        json.dump({"devices": devices}, fp, indent=2, ensure_ascii=False)
    os.replace(tmp, DEVICES_JSON_PATH)


def append_device(
    devices: List[Dict[str, Any]],
    *,
    sn: str,
    admin_email: str,
    vendor: str,
) -> List[Dict[str, Any]]:
    sn = str(sn).strip()
    if not sn:
        return devices
    admin_email = admin_email.strip().lower()
    vendor_n = normalize_vendor(vendor)
    if any(d.get("sn") == sn for d in devices):
        return devices
    devices = list(devices)
    devices.append({"sn": sn, "admin": admin_email, "vendor": vendor_n})
    save_devices(devices)
    logger.info("device_registry appended sn=%s admin=%s vendor=%s", sn, admin_email, vendor_n)
    return devices
