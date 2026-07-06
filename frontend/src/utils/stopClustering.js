import * as turf from '@turf/turf';
import { landmarkFromPoint } from './landmark.js';

// Points within this radius of each other are treated as "the same place"
// when neither has a matching backend landmark to compare directly.
export const STOP_RADIUS_METERS = 15;
// Points more than this far apart in time never merge into the same stop,
// even if they're at/near the same landmark — a device that returns to the
// same spot hours later made two separate visits, not one continuous stop.
export const STOP_MAX_GAP_MS = 5 * 60 * 1000;

export function getCoords(p) {
  const lat = Number(p?.lat ?? p?.latitude ?? p?.gpsLat ?? p?.wgLat);
  const lng = Number(p?.lng ?? p?.lon ?? p?.longitude ?? p?.gpsLng ?? p?.wgLng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

export function getPointTimestamp(p) {
  const t = p?.timestamp ?? p?.time ?? p?.locTime;
  const ms = t ? new Date(t).getTime() : NaN;
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Group consecutive points into "stops" — points near the same landmark
 * (matched by the backend-stored landmark string), or within a small
 * radius as a fallback when landmark data is missing, and within a short
 * time gap of each other collapse into a single group instead of each
 * showing up as its own dot/line-vertex/visit-log row. This is what keeps
 * a stationary or idling device from turning into a scribble of crossing
 * lines and a wall of near-duplicate visit-log entries.
 *
 * Returns an array of { points, coords, landmark, startTs, endTs } — one
 * entry per stop. `coords` is the group's first point's location;
 * `landmark` is the first non-null landmark string found in the group.
 */
export function clusterStops(points, { radiusMeters = STOP_RADIUS_METERS, maxGapMs = STOP_MAX_GAP_MS } = {}) {
  const groups = [];
  for (const p of points) {
    const c = getCoords(p);
    if (!c) continue;
    const ts = getPointTimestamp(p);
    const landmark = landmarkFromPoint(p);
    const last = groups[groups.length - 1];

    if (last) {
      const prev = last.points[last.points.length - 1];
      const prevTs = getPointTimestamp(prev);
      const gapMs = (ts != null && prevTs != null) ? (ts - prevTs) : Infinity;
      // Compare against the whole group (its established landmark / anchor
      // coords), not just the immediately preceding point — otherwise a
      // single jittery ping (GPS bounce past the radius, or a reverse-geocode
      // that returns a slightly different string for one point) breaks an
      // otherwise-continuous stop into several back-to-back "stops".
      const sameLandmark = !!(landmark && last.landmark && landmark === last.landmark);
      const nearby = !!(last.coords && turf.distance(
        [last.coords.lng, last.coords.lat], [c.lng, c.lat], { units: 'meters' }
      ) <= radiusMeters);

      if (gapMs <= maxGapMs && (sameLandmark || nearby)) {
        last.points.push(p);
        if (!last.landmark && landmark) last.landmark = landmark;
        last.endTs = ts;
        continue;
      }
    }

    groups.push({ points: [p], coords: c, landmark: landmark || null, startTs: ts, endTs: ts });
  }
  return groups;
}

/**
 * Stop duration is not the span of points *within* a group — this locator
 * only logs a point while it detects movement, so a device sitting
 * completely still produces zero data until it moves again. The points in a
 * group are just the tail end of the movement that brought it here; the
 * real end of the stop is marked by the *next* group's first point (i.e.
 * whenever movement next resumes somewhere else), not this group's own
 * last point.
 *
 * Returns null when there's no next group yet — the stop may still be
 * ongoing (or simply not yet loaded/replayed past), and the caller should
 * render that explicitly rather than treating null as "duration unknown".
 */
export function stopDurationMs(group, nextGroup) {
  if (group?.startTs == null || nextGroup?.startTs == null) return null;
  return nextGroup.startTs - group.startTs;
}

export function formatStopDuration(ms) {
  if (ms == null || isNaN(ms) || ms <= 0) return "Unknown duration";
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const hours = Math.floor(min / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h ${min % 60}m`;
  if (hours > 0) return `${hours}h ${min % 60}m`;
  if (min > 0) return `${min}m`;
  return `${sec}s`;
}
