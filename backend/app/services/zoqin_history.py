import asyncio
import logging
import random
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Set, Tuple

import httpx

logger = logging.getLogger(__name__)

DEFAULT_ZOQIN_LOCATION_QUERY_URL = "https://www.zoqin.com/ZQGPS/Device/location/query"

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
ZOQIN_MAX_RETRIES = 6
ZOQIN_RETRY_BASE_DELAY_SEC = 3.0
ZOQIN_MAX_RETRY_SLEEP_SEC = 45.0
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
    if not u:
        return DEFAULT_ZOQIN_LOCATION_QUERY_URL
    if "zoqin.com" in u.lower() and u.startswith("http://"):
        u = "https://" + u[7:]
    if "/ZQGPS/Device/getLocationListByTimeAndSN" in u:
        return u.replace("/ZQGPS/Device/getLocationListByTimeAndSN", "/ZQGPS/Device/location/query")
    if "/ZQGPS/Device/location/query" in u:
        return u
    return u


def _fmt(dt: Optional[datetime]) -> str:
    if not dt:
        return ""
    if dt.tzinfo is not None:
        dt = dt.astimezone(None)
    return dt.strftime("%Y-%m-%d %H:%M:%S")


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
    ts = report.get("timestamp") or report.get("datePublished") or ""
    lat = float(report.get("latitude") or report.get("lat") or 0)
    lng = float(report.get("longitude") or report.get("lng") or 0)
    return sn, str(ts), lat, lng


def _extract_zoqin_blocks(payload: Any) -> List[Dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]

    if not isinstance(payload, dict):
        return []

    for key in ("results", "result", "data", "records", "list"):
        value = payload.get(key)
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]
        if isinstance(value, dict):
            nested = _extract_zoqin_blocks(value)
            if nested:
                return nested

    return []


def _extract_zoqin_reports(block: Dict[str, Any]) -> List[Dict[str, Any]]:
    for key in ("reports", "records", "points", "locations", "data", "list"):
        value = block.get(key)
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]
        if isinstance(value, dict):
            nested = _extract_zoqin_blocks(value)
            if nested:
                return nested
    return []


async def _post_json_with_retry(
    client: httpx.AsyncClient,
    *,
    url: str,
    body: Dict[str, Any],
    headers: Dict[str, str],
) -> httpx.Response:
    last_exc: Optional[Exception] = None
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
            delay = ZOQIN_RETRY_BASE_DELAY_SEC * (2 ** (attempt - 1))
            jitter = random.uniform(0.0, delay * 0.5)
            sleep_t = min(delay + jitter, ZOQIN_MAX_RETRY_SLEEP_SEC)
            logger.warning(
                "zoqin network error attempt=%s/%s err=%s(%s); retry in %.1fs",
                attempt,
                ZOQIN_MAX_RETRIES,
                type(exc).__name__,
                exc,
                sleep_t,
            )
            await asyncio.sleep(sleep_t)
        except httpx.HTTPStatusError as exc:
            status = exc.response.status_code
            if status in (429, 502, 503, 504):
                sleep_t = min(ZOQIN_RETRY_BASE_DELAY_SEC * (2 ** attempt), ZOQIN_MAX_RETRY_SLEEP_SEC)
                logger.warning("zoqin HTTP %s attempt=%s; retry in %.1fs", status, attempt, sleep_t)
                await asyncio.sleep(sleep_t)
                last_exc = exc
                continue
            raise
        except Exception as exc:
            logger.error("zoqin unexpected error attempt=%s url=%s err=%s(%s)", attempt, url, type(exc).__name__, exc)
            raise
    assert last_exc is not None
    raise last_exc


async def zoqin_query_reports(
    client: httpx.AsyncClient,
    *,
    location_url: str,
    sn_list: List[str],
    start_time: str,
    end_time: str,
) -> Dict[str, List[Dict[str, Any]]]:
    body = {"start_time": start_time, "end_time": end_time, "sn_list": sn_list, "limit": 10}
    headers = {**_ZOQIN_REQUEST_HEADERS, "Content-Type": "application/json"}
    url = _zoqin_https_url(location_url)
    resp = await _post_json_with_retry(client, url=url, body=body, headers=headers)
    payload = resp.json()

    out: Dict[str, List[Dict[str, Any]]] = {sn: [] for sn in sn_list}
    for block in _extract_zoqin_blocks(payload):
        block_sn = str(block.get("sn") or block.get("deviceSn") or block.get("imei") or "").strip()
        if not block_sn:
            continue
        reports = _extract_zoqin_reports(block)
        if block_sn in out:
            out[block_sn] = [row for row in reports if isinstance(row, dict)]
    return out


async def zoqin_fetch_reports_for_sn(
    client: httpx.AsyncClient,
    *,
    location_url: str,
    sn: str,
    start: datetime,
    end: datetime,
) -> List[Dict[str, Any]]:
    seen: Set[Tuple[str, str, float, float]] = set()
    collected: List[Dict[str, Any]] = []

    async def _fetch_window(ws: datetime, we: datetime) -> List[Dict[str, Any]]:
        by_sn = await zoqin_query_reports(
            client,
            location_url=location_url,
            sn_list=[sn],
            start_time=ws.strftime("%Y-%m-%dT%H:%M:%S"),
            end_time=we.strftime("%Y-%m-%dT%H:%M:%S"),
        )
        return by_sn.get(sn) or []

    async def _walk(ws: datetime, we: datetime, depth: int = 0) -> None:
        reports = await _fetch_window(ws, we)
        if not reports:
            return

        window_span = we - ws
        at_floor = window_span <= LOCATION_MIN_WINDOW

        if len(reports) < LOCATION_API_PAGE_CAP or at_floor:
            if len(reports) == LOCATION_API_PAGE_CAP and at_floor:
                logger.warning(
                    "zoqin cap hit at floor sn=%s window=%s→%s depth=%s — up to %s points may be missing in this 30-s slice",
                    sn,
                    _fmt(ws),
                    _fmt(we),
                    depth,
                    LOCATION_API_PAGE_CAP,
                )
            for report in reports:
                key = _report_key(sn, report)
                if key not in seen:
                    seen.add(key)
                    collected.append(report)
            return

        mid = ws + window_span / 2
        if mid <= ws:
            for report in reports:
                key = _report_key(sn, report)
                if key not in seen:
                    seen.add(key)
                    collected.append(report)
            return

        logger.debug("zoqin bisecting sn=%s depth=%s span=%ss", sn, depth, int(window_span.total_seconds()))
        await _walk(ws, mid, depth + 1)
        await asyncio.sleep(0.3)
        await _walk(mid + timedelta(seconds=1), we, depth + 1)

    await _walk(start, end)
    collected.sort(key=lambda r: _parse_report_ts(r.get("timestamp") or r.get("datePublished")) or datetime.min)
    logger.info("zoqin_fetch_reports_for_sn sn=%s total_collected=%s window=%s→%s", sn, len(collected), _fmt(start), _fmt(end))
    return collected


async def fetch_zoqin_history_points(
    *,
    client: httpx.AsyncClient,
    location_url: str,
    sn: str,
    start: datetime,
    end: datetime,
    limit: Optional[int] = None,
) -> List[Dict[str, Any]]:
    reports = await zoqin_fetch_reports_for_sn(
        client,
        location_url=location_url,
        sn=sn,
        start=start,
        end=end,
    )
    if limit is not None:
        reports = reports[:limit]
    return reports
