/**
 * TPLMaps reverse geocoding utility.
 * Uses window.TPLMaps.api.reverseGeoCode (RxJS observable, wrapped in a Promise).
 * Shared cache so all pages avoid duplicate requests for the same coords.
 *
 * Response shape from SDK:  { response: IncomingMessage, body: '[{...}]' }
 * Parsed record fields:      { name, address, parent, parent2, parent3, country, type, ... }
 */

const _cache = new Map();

function _parseResponse(raw) {
  let parsed = raw;
  if (raw && typeof raw.body === 'string') {
    try { parsed = JSON.parse(raw.body); }
    catch { return null; }
  }
  const data = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!data || typeof data !== 'object') return null;

  // name    = POI/landmark name   e.g. "TPL Trakker"
  // address = road address string e.g. "Main Korangi Industrial Road, Sector 24..."
  // parent  = sub-area            e.g. "Sector 24"
  // parent2 = city                e.g. "Karachi"
  // parent3 = province            e.g. "Sindh"
  const name   = data.name    || null;
  const street = data.address || null;
  const area   = data.parent  || null;
  const city   = data.parent2 || null;
  const isPOI  = data.type === 'POI' || data.type === 'poi';

  // POI: name is primary, full address is secondary
  // Non-POI: address/area is primary, city is secondary
  const primary = name || street || area || city || null;
  const secondary = name
    ? (street || (area ? `${area}${city ? ', ' + city : ''}` : city) || null)
    : (area ? `${area}${city ? ', ' + city : ''}` : city || null);

  return primary ? { primary, secondary, isSpecific: isPOI || !!name || !!street } : null;
}

/**
 * Reverse geocode a lat/lng via the TPLMaps SDK.
 * Returns { primary, secondary, isSpecific } or null.
 * Results are cached in-memory for the session.
 */
export async function tplGeocode(lat, lng) {
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  if (_cache.has(key)) return _cache.get(key);

  try {
    if (!window.TPLMaps?.api?.reverseGeoCode) {
      // SDK not loaded yet — don't cache, allow retry later
      return null;
    }
    const raw = await new Promise((resolve, reject) => {
      window.TPLMaps.api.reverseGeoCode({ lat, lng }).subscribe(resolve, reject);
    });
    const result = _parseResponse(raw);
    _cache.set(key, result);
    return result;
  } catch {
    _cache.set(key, null);
    return null;
  }
}

/**
 * Convenience: returns a single display string for use in info strips.
 * e.g. "TPL Trakker — Korangi, Karachi"
 */
export async function tplGeocodeLabel(lat, lng) {
  const result = await tplGeocode(lat, lng);
  if (!result?.primary) return null;
  return result.secondary ? `${result.primary} — ${result.secondary}` : result.primary;
}
