/** Read landmark stored by backend geocoding on location points. */

export function landmarkFromPoint(point) {
  if (!point) return null;
  const raw = point.landmark;
  if (raw == null || raw === "") return null;
  const s = String(raw).trim();
  return s || null;
}

/** Split backend landmark string into popup / panel display parts. */
export function parseLandmarkDisplay(landmark) {
  if (!landmark) return null;
  const idx = landmark.indexOf(" — ");
  if (idx === -1) {
    return { primary: landmark, secondary: null, isSpecific: true };
  }
  return {
    primary: landmark.slice(0, idx),
    secondary: landmark.slice(idx + 3) || null,
    isSpecific: true,
  };
}

export function landmarkDisplayFromPoint(point) {
  return parseLandmarkDisplay(landmarkFromPoint(point));
}

// ── External reverse geocoding via Nominatim/OSM (free, no key, worldwide) ────
const _extCache = {};

/**
 * Reverse geocode using Nominatim (OpenStreetMap).
 * Returns { primary, secondary, isSpecific }.
 * Hierarchy: POI/amenity → neighbourhood → city.
 * Token param is accepted but ignored (kept for call-site compatibility).
 */
export async function mapboxReverseGeocode(lat, lng, _token) {
  if (lat == null || lng == null) return null;
  const cacheKey = `nom:${Number(lat).toFixed(4)},${Number(lng).toFixed(4)}`;
  if (cacheKey in _extCache) return _extCache[cacheKey];
  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse` +
      `?format=json&lat=${Number(lat).toFixed(6)}&lon=${Number(lng).toFixed(6)}&zoom=16&addressdetails=1`;
    const res = await fetch(url, {
      headers: { 'Accept-Language': 'en', 'User-Agent': 'TPL-Locator/1.0' },
    });
    if (!res.ok) { _extCache[cacheKey] = null; return null; }
    const data = await res.json();
    const addr = data?.address ?? {};

    // Most-specific name first — POI/amenity → neighbourhood → city
    const poi  = addr.amenity || addr.tourism || addr.leisure || addr.shop
              || addr.office  || addr.historic || addr.building;
    const area = addr.neighbourhood || addr.suburb || addr.quarter;
    const city = addr.city || addr.town || addr.village || addr.municipality || addr.county;
    const country = addr.country;

    let primary, secondary, isSpecific;
    if (poi) {
      primary    = poi;
      isSpecific = true;
      secondary  = area
        ? `${area}, ${city ?? country ?? ''}`.replace(/,\s*$/, '')
        : (city ? `${city}, ${country ?? ''}`.trim() : (country ?? null));
    } else if (area) {
      primary    = area;
      isSpecific = false;
      secondary  = city ? `${city}, ${country ?? ''}`.trim().replace(/,\s*$/, '') : (country ?? null);
    } else if (city) {
      primary    = city;
      isSpecific = false;
      secondary  = country ?? null;
    } else {
      _extCache[cacheKey] = null;
      return null;
    }

    const result = { primary, secondary: secondary || null, isSpecific };
    _extCache[cacheKey] = result;
    return result;
  } catch {
    _extCache[cacheKey] = null;
    return null;
  }
}

/** Format a geocode result as a landmark string (for geoLabel state in detail pages). */
export function mapboxGeoLabelString(geo) {
  if (!geo?.primary) return null;
  return geo.secondary ? `${geo.primary} — ${geo.secondary}` : geo.primary;
}

// ── TPL Maps reverse geocoding (Pakistan only) ────────────────────────────────
/** Client-side reverse geocode using the TPL Maps REST API directly. */
const _TPL_RGEO_URL = 'https://api1.tplmaps.com:8888/search/rgeocode';
const _TPL_KEY = '$2a$10$RNdeMDBGrOwbnh81N3RzTDGUxKVId3cLscU3V3HkGdRLKhwI0oOQe';
const _geoCache = {};

function _parseTplRecord(rec) {
  if (!rec || typeof rec !== 'object') return null;
  const name     = rec.name || null;
  const compound = rec.compound_address_parents || null;
  const type     = String(rec.type || rec.cat_name || '').toUpperCase();
  // Address-only types use a bare house/plot number as name — use the full compound string instead
  const isAddressOnly = ['HOUSE', 'BUILDING', 'PLOT', 'FLAT', 'APARTMENT', 'RESIDENTIAL'].includes(type);
  if (compound) {
    let addr = compound;
    // Strip the leading house number so we show the street/area context, not just "7 P"
    if (isAddressOnly && name && addr.startsWith(name)) {
      addr = addr.slice(name.length).trim();
    }
    if (addr) {
      // Split into specific street (primary) and area+city (secondary) so callers can
      // show just the landmark area in stat cards and the full address in the map header.
      // Pakistani addresses end with "... Area City Province" — drop the province (last word)
      // and use the preceding 2 words as secondary (area, city).
      const words = addr.split(/\s+/).filter(Boolean);
      if (words.length >= 6) {
        const primary   = words.slice(0, -3).join(' ');
        const secondary = words.slice(-3, -1).join(', ');
        if (primary && secondary) return `${primary} — ${secondary}`;
      }
      return addr;
    }
  }
  const street = rec.address || null;
  const area   = rec.parent  || null;
  const city   = rec.parent2 || null;
  const primary = (isAddressOnly ? null : name) || street || area || city || name;
  if (!primary) return null;
  const secondary = (!isAddressOnly && name)
    ? (street || (area && city ? `${area}, ${city}` : area || city))
    : (area && city ? `${area}, ${city}` : area || city);
  return secondary && String(secondary) !== String(primary)
    ? `${primary} — ${secondary}`
    : String(primary);
}

export async function clientReverseGeocode(lat, lng) {
  if (lat == null || lng == null) return null;
  const cacheKey = `${Number(lat).toFixed(5)},${Number(lng).toFixed(5)}`;
  if (cacheKey in _geoCache) return _geoCache[cacheKey];
  try {
    const params = new URLSearchParams({ point: `${lat};${lng}`, apikey: _TPL_KEY });
    const res = await fetch(`${_TPL_RGEO_URL}?${params}`);
    if (!res.ok) { _geoCache[cacheKey] = null; return null; }
    const payload = await res.json();
    const records = Array.isArray(payload)
      ? payload
      : (payload?.data ?? payload?.results ?? payload?.features ?? [payload]);
    const rec = Array.isArray(records) ? records.find(r => r && typeof r === 'object') : null;
    const result = _parseTplRecord(rec);
    _geoCache[cacheKey] = result;
    return result;
  } catch {
    _geoCache[cacheKey] = null;
    return null;
  }
}
