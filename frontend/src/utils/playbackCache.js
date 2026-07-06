/**
 * Per-device, interval-merging in-memory cache for playback point data.
 *
 * Loading a device+range tracks which time sub-ranges are already cached;
 * a new request only fetches the uncovered gap(s), then merges the result
 * into the cached point set (deduped by timestamp+lat+lng) and extends the
 * covered-ranges list. Re-loading the same or an overlapping range never
 * re-fetches or re-stores a point that's already cached.
 */

const pad2 = (n) => String(n).padStart(2, "0");

// Stored timestamps are naive Pakistan local time, and PlaybackPage sends
// query bounds as naive (no 'Z'/offset) wall-clock strings so the window
// matches stored values exactly. Formatting a Date with its own local
// getters round-trips exactly with `new Date(naiveString)` parsing —
// whatever timezone offset the browser applies is the same in both
// directions, so it cancels out for both storage and comparison purposes.
// Duplicated here (rather than imported from PlaybackPage) to keep this
// cache a standalone, page-agnostic module.
function naiveLocal(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function toMs(naiveString) {
  return new Date(naiveString).getTime();
}

function pointKey(p) {
  return `${p?.timestamp}|${p?.lat}|${p?.lng}`;
}

/** sn -> { points: [...sorted by timestamp], ranges: [{start:ms, end:ms}] } */
const _cache = new Map();

function mergeRanges(ranges) {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    const cur = sorted[i];
    if (cur.start <= last.end) {
      last.end = Math.max(last.end, cur.end);
    } else {
      merged.push({ ...cur });
    }
  }
  return merged;
}

/** Sub-ranges of [start,end] not covered by any range in the (sorted,
 * merged) `ranges` list. */
function findGaps(ranges, start, end) {
  const gaps = [];
  let cursor = start;
  for (const r of ranges) {
    if (r.end <= cursor) continue;
    if (r.start >= end) break;
    if (r.start > cursor) gaps.push({ start: cursor, end: Math.min(r.start, end) });
    cursor = Math.max(cursor, r.end);
    if (cursor >= end) break;
  }
  if (cursor < end) gaps.push({ start: cursor, end });
  return gaps;
}

function mergePointsInto(entry, newPoints) {
  const seen = new Set(entry.points.map(pointKey));
  for (const p of newPoints) {
    if (!p) continue;
    const key = pointKey(p);
    if (seen.has(key)) continue;
    seen.add(key);
    entry.points.push(p);
  }
  entry.points.sort((a, b) => toMs(a.timestamp) - toMs(b.timestamp));
}

/**
 * Fetch playback points for a device+range through the cache. Only the
 * time sub-ranges not already cached are actually fetched.
 *
 * `fetchRangeFn(sn, startNaive, endNaive) => Promise<points[]>` must hit
 * the real API for exactly that sub-range, using the same naive
 * (no-timezone) wall-clock string format the rest of the playback page
 * already sends.
 */
export async function getCachedPlayback(sn, start, end, fetchRangeFn) {
  const startMs = toMs(start);
  const endMs = toMs(end);
  if (!sn || !(startMs < endMs)) return [];

  let entry = _cache.get(sn);
  if (!entry) {
    entry = { points: [], ranges: [] };
    _cache.set(sn, entry);
  }

  const gaps = findGaps(entry.ranges, startMs, endMs);
  if (gaps.length > 0) {
    const fetched = await Promise.all(
      gaps.map(g => fetchRangeFn(sn, naiveLocal(new Date(g.start)), naiveLocal(new Date(g.end))))
    );
    for (let i = 0; i < gaps.length; i++) {
      mergePointsInto(entry, fetched[i] || []);
    }
    entry.ranges = mergeRanges([...entry.ranges, ...gaps]);
  }

  return entry.points.filter(p => {
    const t = toMs(p.timestamp);
    return t >= startMs && t <= endMs;
  });
}

/** Drop cached data for one device, or everything if no sn is given. */
export function clearPlaybackCache(sn) {
  if (sn) _cache.delete(sn);
  else _cache.clear();
}
