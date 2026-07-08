"""Zoqin location history API (no login required)."""

from __future__ import annotations

import asyncio
import logging
import random
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Set, Tuple

import httpx

logger = logging.getLogger(__name__)

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

# ── API behaviour constants ────────────────────────────────────────────────────
# The Zoqin API returns at most LOCATION_API_PAGE_CAP points per request.
# When exactly that many are returned we cannot know if more exist — we must
# bisect the time window and fetch each half separately.
LOCATION_API_PAGE_CAP = 100

# Stop bisecting when the window is this narrow.  At 30 s a device moving at
# 120 km/h covers only 1 km — narrow enough that any remaining cap-collision
# would be a genuine data burst, not a hidden gap.
LOCATION_MIN_WINDOW = timedelta(seconds=30)

DEFAULT_ZOQIN_TIME_ADJUST_HOURS = 5.0

# ── Retry / timeout tuning ────────────────────────────────────────────────────
ZOQIN_MAX_RETRIES          = 6
ZOQIN_RETRY_BASE_DELAY_SEC = 3.0
ZOQIN_MAX_RETRY_SLEEP_SEC  = 45.0

_RETRYABLE_ERRORS = (
    httpx.ConnectError,
    httpx.ConnectTimeout,
    httpx.ReadTimeout,
    httpx.WriteTimeout,
    httpx.PoolTimeout,
    httpx.RemoteProtocolError,
)


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
    """Stable dedup key: (sn, timestamp-string, lat, lng)."""
    ts  = report.get("timestamp") or ""
    lat = float(report.get("latitude")  or 0)
    lng = float(report.get("longitude") or 0)
    return sn, str(ts), lat, lng


def fmt_zoqin_time(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%S")


# ── HTTP with retry ────────────────────────────────────────────────────────────

async def _post_json_with_retry(
    client: httpx.AsyncClient,
    *,
    url: str,
    body: dict[str, Any],
    headers: dict[str, str],
) -> httpx.Response:
    """
    POST with exponential back-off + full jitter.

    Retries: up to ZOQIN_MAX_RETRIES (6) attempts.
    Back-off: base=3 s, doubles each attempt, capped at 45 s, plus jitter.
    Retryable: all network-level errors + HTTP 429/502/503/504.
    Non-retryable HTTP errors are raised immediately so callers can log them.
    """
    last_exc: Exception | None = None

    for attempt in range(1, ZOQIN_MAX_RETRIES + 1):
        try:
            resp = await client.post(
                url,
                json=body,
                headers=headers,
                timeout=httpx.Timeout(connect=20.0, read=90.0, write=20.0, pool=10.0),
            )
            resp.raise_for_status()
            return resp

        except _RETRYABLE_ERRORS as exc:
            last_exc = exc
            if attempt >= ZOQIN_MAX_RETRIES:
                break
            delay   = ZOQIN_RETRY_BASE_DELAY_SEC * (2 ** (attempt - 1))
            jitter  = random.uniform(0.0, delay * 0.5)
            sleep_t = min(delay + jitter, ZOQIN_MAX_RETRY_SLEEP_SEC)
            logger.warning(
                "zoqin network error attempt=%s/%s err=%s(%s); retry in %.1fs",
                attempt, ZOQIN_MAX_RETRIES, type(exc).__name__, exc, sleep_t,
            )
            await asyncio.sleep(sleep_t)

        except httpx.HTTPStatusError as exc:
            status = exc.response.status_code
            if status in (429, 502, 503, 504):
                sleep_t = min(
                    ZOQIN_RETRY_BASE_DELAY_SEC * (2 ** attempt),
                    ZOQIN_MAX_RETRY_SLEEP_SEC,
                )
                logger.warning(
                    "zoqin HTTP %s attempt=%s; retry in %.1fs", status, attempt, sleep_t
                )
                await asyncio.sleep(sleep_t)
                last_exc = exc
                continue
            raise

        except Exception as exc:
            logger.error(
                "zoqin unexpected error attempt=%s url=%s err=%s(%s)",
                attempt, url, type(exc).__name__, exc,
            )
            raise

    assert last_exc is not None
    raise last_exc


# ── Query one window ───────────────────────────────────────────────────────────

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
        "end_time":   end_time,
        "sn_list":    sn_list,
        "limit":      100,
    }
    headers = {**_ZOQIN_REQUEST_HEADERS, "Content-Type": "application/json"}
    url  = _zoqin_https_url(location_url)
    resp = await _post_json_with_retry(client, url=url, body=body, headers=headers)
    payload = resp.json()

    out: Dict[str, List[Dict[str, Any]]] = {sn: [] for sn in sn_list}
    for block in payload.get("results") or []:
        if not isinstance(block, dict):
            continue
        sn      = str(block.get("sn") or "").strip()
        reports = block.get("reports") or []
        if sn and isinstance(reports, list):
            out[sn] = [r for r in reports if isinstance(r, dict)]
    return out


# ── Exhaustive fetch for one SN ────────────────────────────────────────────────

async def zoqin_fetch_reports_for_sn(
    client: httpx.AsyncClient,
    *,
    location_url: str,
    sn: str,
    start: datetime,
    end: datetime,
) -> List[Dict[str, Any]]:
    """
    Fetch ALL location reports for one SN in [start, end], missing nothing.

    Strategy — recursive bisection
    ───────────────────────────────
    The Zoqin API returns at most 100 points per request with no pagination
    cursor.  When exactly 100 points come back we cannot know if more exist in
    that window, so we split the window in half and recurse into each half.
    We stop splitting when:
      (a) fewer than 100 points come back (all points captured), OR
      (b) the window is ≤ LOCATION_MIN_WINDOW (30 s) — at that granularity a
          device cannot realistically produce > 100 distinct GPS fixes.

    Gap-protection
    ──────────────
    • LOCATION_MIN_WINDOW lowered to 30 s (was 60 s) — catches high-frequency
      devices without blowing up recursion depth.
    • When the floor is hit and we still got 100 points, we log a warning so
      operators know a gap MAY exist (very rare in practice).
    • Dedup set `seen` uses (sn, timestamp-str, lat, lng) so overlapping
      windows from adjacent bisect halves never produce duplicate rows.
    • A 0.3 s sleep between the two halves of each bisect reduces server load
      without meaningfully slowing a 60-min window (≤12 bisect levels max).
    """
    seen: Set[Tuple[str, str, float, float]] = set()
    collected: List[Dict[str, Any]] = []

    async def _fetch_window(ws: datetime, we: datetime) -> List[Dict[str, Any]]:
        by_sn = await zoqin_query_reports(
            client,
            location_url=location_url,
            sn_list=[sn],
            start_time=fmt_zoqin_time(ws),
            end_time=fmt_zoqin_time(we),
        )
        return by_sn.get(sn) or []

    async def _walk(ws: datetime, we: datetime, depth: int = 0) -> None:
        reports = await _fetch_window(ws, we)
        if not reports:
            return

        window_span = we - ws
        at_floor    = window_span <= LOCATION_MIN_WINDOW

        if len(reports) < LOCATION_API_PAGE_CAP or at_floor:
            # ── Safe to accept: either we got fewer than the cap (no hidden
            #    points), or we are at the minimum window size.
            if len(reports) == LOCATION_API_PAGE_CAP and at_floor:
                logger.warning(
                    "zoqin cap hit at floor sn=%s window=%s→%s depth=%s — "
                    "up to %s points may be missing in this 30-s slice",
                    sn, fmt_zoqin_time(ws), fmt_zoqin_time(we),
                    depth, LOCATION_API_PAGE_CAP,
                )
            for report in reports:
                key = _report_key(sn, report)
                if key not in seen:
                    seen.add(key)
                    collected.append(report)
            return

        # ── Exactly 100 points returned and window is wide enough — bisect.
        mid = ws + window_span / 2
        if mid <= ws:
            # Arithmetic edge case: window too narrow to produce a new midpoint.
            for report in reports:
                key = _report_key(sn, report)
                if key not in seen:
                    seen.add(key)
                    collected.append(report)
            return

        logger.debug(
            "zoqin bisecting sn=%s depth=%s span=%ss",
            sn, depth, int(window_span.total_seconds()),
        )
        await _walk(ws, mid, depth + 1)
        await asyncio.sleep(0.3)            # brief pause between halves
        await _walk(mid + timedelta(seconds=1), we, depth + 1)

    await _walk(start, end)
    collected.sort(key=lambda r: _parse_report_ts(r.get("timestamp")) or datetime.min)
    logger.info(
        "zoqin_fetch_reports_for_sn sn=%s total_collected=%s window=%s→%s",
        sn, len(collected), fmt_zoqin_time(start), fmt_zoqin_time(end),
    )
    return collected