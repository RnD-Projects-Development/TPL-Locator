"""Zoqin location history API (no login required)."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Set, Tuple

import httpx

logger = logging.getLogger(__name__)

# Zoqin gateway often returns 405 for bare python-httpx GET; Postman sends browser-like headers.
_ZOQIN_REQUEST_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Referer": "https://www.zoqin.com/",
    "Origin": "https://www.zoqin.com",
    "X-Requested-With": "XMLHttpRequest",
}

LOCATION_API_PAGE_CAP = 100
LOCATION_MIN_WINDOW = timedelta(seconds=30)
DEFAULT_ZOQIN_TIME_ADJUST_HOURS = 5.0


def _zoqin_https_url(url: str) -> str:
    u = (url or "").strip()
    if "zoqin.com" in u.lower() and u.startswith("http://"):
        return "https://" + u[7:]
    return u


def _parse_report_ts(value: Any) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, datetime):
        return value.replace(tzinfo=None)
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)
        except ValueError:
            return None
    return None


def _report_key(sn: str, report: Dict[str, Any]) -> Tuple[str, str, float, float]:
    ts = report.get("timestamp") or ""
    lat = float(report.get("latitude") or 0)
    lng = float(report.get("longitude") or 0)
    return sn, str(ts), lat, lng


def fmt_zoqin_time(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%S")


async def zoqin_query_reports(
    client: httpx.AsyncClient,
    *,
    location_url: str,
    sn_list: List[str],
    start_time: str,
    end_time: str,
) -> Dict[str, List[Dict[str, Any]]]:
    """POST /ZQGPS/Device/location/query — returns reports grouped by SN."""
    body = {
        "start_time": start_time,
        "end_time": end_time,
        "sn_list": sn_list,
        "limit": 50,
    }
    headers = {**_ZOQIN_REQUEST_HEADERS, "Content-Type": "application/json"}
    url = _zoqin_https_url(location_url)
    resp = await client.post(url, json=body, headers=headers)
    resp.raise_for_status()
    payload = resp.json()

    out: Dict[str, List[Dict[str, Any]]] = {sn: [] for sn in sn_list}
    for block in payload.get("results") or []:
        if not isinstance(block, dict):
            continue
        sn = str(block.get("sn") or "").strip()
        reports = block.get("reports") or []
        if sn and isinstance(reports, list):
            out[sn] = [r for r in reports if isinstance(r, dict)]
    return out


async def zoqin_fetch_reports_for_sn(
    client: httpx.AsyncClient,
    *,
    location_url: str,
    sn: str,
    start: datetime,
    end: datetime,
) -> List[Dict[str, Any]]:
    """
    Fetch all location reports for one SN in [start, end].
    Recursively splits the window when the API returns its 100-point cap.
    """
    seen: Set[Tuple[str, str, float, float]] = set()
    collected: List[Dict[str, Any]] = []

    async def _fetch_window(window_start: datetime, window_end: datetime) -> List[Dict[str, Any]]:
        by_sn = await zoqin_query_reports(
            client,
            location_url=location_url,
            sn_list=[sn],
            start_time=fmt_zoqin_time(window_start),
            end_time=fmt_zoqin_time(window_end),
        )
        return by_sn.get(sn) or []

    async def _walk(window_start: datetime, window_end: datetime) -> None:
        reports = await _fetch_window(window_start, window_end)
        if not reports:
            return

        if len(reports) < LOCATION_API_PAGE_CAP or (window_end - window_start) <= LOCATION_MIN_WINDOW:
            for report in reports:
                key = _report_key(sn, report)
                if key not in seen:
                    seen.add(key)
                    collected.append(report)
            return

        mid = window_start + (window_end - window_start) / 2
        if mid <= window_start:
            for report in reports:
                key = _report_key(sn, report)
                if key not in seen:
                    seen.add(key)
                    collected.append(report)
            return

        await _walk(window_start, mid)
        await _walk(mid + timedelta(seconds=1), window_end)

    await _walk(start, end)
    collected.sort(key=lambda r: _parse_report_ts(r.get("timestamp")) or datetime.min)
    return collected
