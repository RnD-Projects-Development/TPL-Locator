/**
 * Reverse geocoding utility — TPLMaps SDK edition.
 *
 * Public signature is IDENTICAL to the previous Mapbox implementation so the
 * ReportPage (and every other caller) continues to work with no changes:
 *
 *     const result = await reverseGeocode(lat, lng);
 *     // → { primary, secondary, address, hierarchy, isSpecific } | null
 *
 * Key behaviours preserved from the original:
 *   • Coordinate cache keyed by `${lat.toFixed(5)},${lng.toFixed(5)}`
 *   • Customlocations.json takes priority over network lookup
 *   • Null is cached to avoid hammering the API on failures
 *   • Exports parseSearchBoxFeature / parseGeocodingV6Feature / buildAddressLine
 *     as no-ops so any external imports don't break
 */

import customLocations from "./Customlocations.json";

// ── Custom location lookup ────────────────────────────────────────────────────
const CUSTOM_RADIUS_KM = 0.1;

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function findCustomLocation(lat, lng) {
  let best = null;
  let bestDist = Infinity;
  for (const loc of customLocations) {
    const d = haversineKm(lat, lng, loc.lat, loc.lng);
    if (d < CUSTOM_RADIUS_KM && d < bestDist) {
      bestDist = d;
      best = loc;
    }
  }
  if (!best) return null;
  return {
    primary:    best.name,
    secondary:  null,
    address:    best.name,
    hierarchy:  { street: best.name, neighborhood: null, locality: null, place: null, region: null, country: null },
    isSpecific: true,
    isCustom:   true,
  };
}

// ── Cache ─────────────────────────────────────────────────────────────────────
const geocodeCache = new Map();

function cacheKey(lat, lng) {
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

// ── Address helpers (kept for API compatibility) ─────────────────────────────

/**
 * Build address line from hierarchy (street, neighborhood, locality, place, region, country).
 * Unchanged helper — other modules may import it.
 */
export function buildAddressLine(hierarchy) {
  if (!hierarchy || typeof hierarchy !== "object") return null;
  const parts = [
    hierarchy.street,
    hierarchy.neighborhood,
    hierarchy.locality,
    hierarchy.place,
    hierarchy.region,
    hierarchy.country,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

/** Stub kept so legacy imports don't crash. Mapbox-specific — no TPLMaps equivalent. */
export function parseSearchBoxFeature() { return null; }

/** Stub kept so legacy imports don't crash. Mapbox-specific — no TPLMaps equivalent. */
export function parseGeocodingV6Feature() { return null; }

// ── TPLMaps SDK wrapper ───────────────────────────────────────────────────────

/**
 * Promise-wrapped call to window.TPLMaps.api.reverseGeoCode.
 *
 * The TPLMaps SDK expects an OPTIONS OBJECT, not positional args:
 *     api.reverseGeoCode({ lat, lng }).subscribe(onNext, onError)
 *
 * The return value is an RxJS observable. `.subscribe(res, err)` fires
 * `res` exactly once with the geocode result, or `err` on failure.
 */
function callTPLMaps(lat, lng) {
  return new Promise((resolve, reject) => {
    const api = typeof window !== "undefined" && window.TPLMaps?.api;
    if (!api || typeof api.reverseGeoCode !== "function") {
      reject(new Error("TPLMaps SDK not available"));
      return;
    }

    let settled = false;
    const done = (data) => { if (!settled) { settled = true; resolve(data); } };
    const fail = (err)  => { if (!settled) { settled = true; reject(err);  } };

    try {
      const obs = api.reverseGeoCode({ lat, lng });
      if (obs && typeof obs.subscribe === "function") {
        obs.subscribe(done, fail);
      } else {
        // Some SDK builds might return a Promise or plain value
        Promise.resolve(obs).then(done, fail);
      }
    } catch (err) {
      fail(err);
    }
  });
}

// ── Response parsing ──────────────────────────────────────────────────────────

/**
 * TPLMaps returns either a raw JSON object, an array, or a wrapper like
 * `{ body: "[{...}]", response: ... }` — normalise all of them to one dict.
 */
function normaliseTPLResponse(raw) {
  if (!raw) return null;

  let parsed = raw;

  // Some SDK builds return the HTTP envelope { body: "<json>", response }
  if (raw && typeof raw.body === "string") {
    try { parsed = JSON.parse(raw.body); }
    catch { return null; }
  }

  // API returns an array of candidates — take the first, it's the closest match
  if (Array.isArray(parsed)) parsed = parsed[0];
  if (!parsed || typeof parsed !== "object") return null;

  // Nested "results" / "result" envelopes
  if (Array.isArray(parsed.results) && parsed.results[0]) parsed = parsed.results[0];
  if (parsed.result && typeof parsed.result === "object")  parsed = parsed.result;

  return parsed;
}

/**
 * Convert a TPLMaps reverse-geocode record into our internal shape.
 *
 * Actual TPLMaps response fields (verified against the SDK):
 *   name     — POI / landmark name, e.g. "TPL Trakker"   (only present for POIs)
 *   address  — full road address, e.g. "Main Korangi Industrial Road, Sector 24, Karachi"
 *   parent   — sub-area / sector,  e.g. "Sector 24"
 *   parent2  — city,               e.g. "Karachi"
 *   parent3  — province,           e.g. "Sindh"
 *   country  — country name (rarely present in local Pakistan responses)
 *   type     — "POI" when the record is a landmark
 */
function parseTPLMapsResult(raw) {
  const data = normaliseTPLResponse(raw);
  if (!data) return null;

  const name    = data.name    || null;
  const address = data.address || null;
  const area    = data.parent  || null;
  const city    = data.parent2 || null;
  const region  = data.parent3 || data.province || null;
  const country = data.country || null;
  const isPOI   = data.type === "POI" || data.type === "poi";

  // Road-only portion of the address — drop trailing ", Sector X, Karachi" parts.
  // e.g. "Main University Road, Gulshan-e-Iqbal, Karachi" → "Main University Road"
  const street = address ? (address.split(",")[0].trim() || null) : null;

  const hierarchy = {
    street:       street  || null,
    neighborhood: area    || null,
    locality:     area    || null,
    place:        city    || null,
    region:       region  || null,
    country:      country || null,
  };

  // POI: name is primary, address/area is secondary
  // Non-POI: road/area is primary, city is secondary
  const primary = name || street || area || city || null;
  let secondary = name
    ? (street || (area ? `${area}${city ? ", " + city : ""}` : city) || null)
    : (area && area !== primary ? `${area}${city ? ", " + city : ""}` : (city && city !== primary ? city : null));

  if (secondary && secondary === primary) secondary = null;

  if (!primary) return null;

  return {
    primary,
    secondary,
    address:    address,
    hierarchy,
    isSpecific: Boolean(isPOI || name || street),
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Reverse geocode coordinates to a human-readable address/POI.
 *
 * @param {number} lat
 * @param {number} lng
 * @param {object} [opts]  Reserved for future use; kept for call-site compat.
 * @returns {Promise<{primary, secondary, address, hierarchy, isSpecific}|null>}
 */
export async function reverseGeocode(lat, lng, _opts = {}) {
  if (typeof lat !== "number" || typeof lng !== "number" || Number.isNaN(lat) || Number.isNaN(lng)) {
    return null;
  }

  const key = cacheKey(lat, lng);

  // 1. In-memory cache
  if (geocodeCache.has(key)) return geocodeCache.get(key);

  // 2. Custom locations — instant, no network
  const custom = findCustomLocation(lat, lng);
  if (custom) {
    geocodeCache.set(key, custom);
    return custom;
  }

  // 3. TPLMaps SDK reverse geocode
  try {
    const raw    = await callTPLMaps(lat, lng);
    const result = parseTPLMapsResult(raw);
    geocodeCache.set(key, result);   // cache null too — suppresses retries
    return result;
  } catch {
    geocodeCache.set(key, null);
    return null;
  }
}
