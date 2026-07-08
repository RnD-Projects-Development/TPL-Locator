// Shared reverse-geocode resolver — used by both the playback sidebar and the
// map's per-pin labels so a given coordinate is only ever looked up once and
// both surfaces always agree on the resolved landmark text.
import { landmarkDisplayFromPoint, parseLandmarkDisplay, clientReverseGeocode, mapboxReverseGeocode, mapboxGeoLabelString, insidePakistan } from "./landmark.js";
import { getCoords } from "./stopClustering.js";

const cache = new Map();
const pending = new Map();

// Limit concurrent lookups — a large playback range would otherwise fire
// hundreds of simultaneous reverse-geocode requests (up to 3 network calls
// each) the moment its pins mount, saturating the browser's connection pool
// and making the whole page lag. Queued lookups still all resolve; labels
// just fill in progressively.
const MAX_CONCURRENT_LOOKUPS = 4;
let activeLookups = 0;
const lookupQueue = [];

function pumpLookupQueue() {
  while (activeLookups < MAX_CONCURRENT_LOOKUPS && lookupQueue.length > 0) {
    const job = lookupQueue.shift();
    activeLookups += 1;
    job().finally(() => { activeLookups -= 1; pumpLookupQueue(); });
  }
}

function enqueueLookup(fn) {
  return new Promise((resolve) => {
    lookupQueue.push(() => fn().then(resolve));
    pumpLookupQueue();
  });
}

function keyFor(lat, lng) {
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

/** Synchronous best-effort lookup — backend landmark, else whatever's already cached. Never fetches. */
export function peekGeocode(point) {
  const backend = point?.landmark ? parseLandmarkDisplay(point.landmark) : landmarkDisplayFromPoint(point);
  if (backend) return backend;
  const c = getCoords(point);
  if (!c) return null;
  return cache.get(keyFor(c.lat, c.lng)) ?? null;
}

/**
 * Resolve a point's landmark, fetching + caching if necessary. Always
 * resolves (never rejects); result may be null if nothing was found.
 * `getGeocode` is the backend TPL lookup (optional Pakistan-only fallback).
 */
export function resolveGeocode(point, getGeocode) {
  const backend = point?.landmark ? parseLandmarkDisplay(point.landmark) : landmarkDisplayFromPoint(point);
  if (backend) return Promise.resolve(backend);

  const c = getCoords(point);
  if (!c) return Promise.resolve(null);
  const { lat, lng } = c;
  const key = keyFor(lat, lng);

  if (cache.has(key)) return Promise.resolve(cache.get(key));
  if (pending.has(key)) return pending.get(key);

  const promise = enqueueLookup(async () => {
    let label = null;
    // TPL Maps is Pakistan-only — for out-of-Pakistan points it's guaranteed
    // to fail, and the backend call alone can take up to 20s to time out.
    // Skip straight to Nominatim (worldwide) instead of paying for two
    // wasted round trips first.
    if (insidePakistan(lat, lng)) {
      try { label = await clientReverseGeocode(lat, lng); } catch {}
      if (!label && getGeocode) {
        try { const res = await getGeocode(lat, lng); if (res?.landmark) label = res.landmark; } catch {}
      }
    }
    if (!label) {
      try {
        const mbx = await mapboxReverseGeocode(lat, lng, import.meta.env.VITE_MAPBOX_TOKEN);
        if (mbx) label = mapboxGeoLabelString(mbx);
      } catch {}
    }
    const parsed = label ? parseLandmarkDisplay(label) : null;
    cache.set(key, parsed);
    pending.delete(key);
    return parsed;
  });

  pending.set(key, promise);
  return promise;
}
