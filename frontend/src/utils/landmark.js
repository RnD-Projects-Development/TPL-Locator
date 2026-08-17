/** Read landmark stored by backend geocoding on location points. */

// Rough Pakistan bounding box — used to skip Pakistan-only geocoders
// (TPL Maps) entirely for out-of-country coordinates, instead of waiting on
// calls that are guaranteed to fail (one of them with a 20s server timeout).
const PAK = { minLat: 23.5, maxLat: 37.5, minLng: 60.5, maxLng: 77.5 };
export function insidePakistan(lat, lng) {
  return lat >= PAK.minLat && lat <= PAK.maxLat && lng >= PAK.minLng && lng <= PAK.maxLng;
}

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

// ── External reverse geocoding, worldwide (outside-Pakistan fallback) ─────────
import loadGoogleMaps from "../components/loadGoogleMaps.js";

const _extCache = {};

function _componentName(components, ...types) {
  if (!Array.isArray(components)) return null;
  for (const type of types) {
    const match = components.find(c => Array.isArray(c.types) && c.types.includes(type));
    if (match?.long_name) return match.long_name;
  }
  return null;
}

/**
 * Find the nearest POI near a coordinate via Google Places Nearby Search.
 */
async function _googleNearestPOI(lat, lng) {
  try {
    const maps = await loadGoogleMaps();
    const host = document.createElement('div');
    const service = new maps.places.PlacesService(host);
    return await new Promise((resolve) => {
      const timeoutId = setTimeout(() => resolve(null), 5000);
      service.nearbySearch(
        { location: new maps.LatLng(Number(lat), Number(lng)), radius: 150 },
        (results, status) => {
          clearTimeout(timeoutId);
          if (status !== maps.places.PlacesServiceStatus.OK || !Array.isArray(results) || results.length === 0) {
            resolve(null);
            return;
          }
          const name = results[0]?.name;
          resolve(name ? { name } : null);
        },
      );
    });
  } catch {
    return null;
  }
}

/** Reverse geocode to neighbourhood/city context via Google Geocoder. */
async function _googleReverseArea(lat, lng) {
  try {
    const maps = await loadGoogleMaps();
    const geocoder = new maps.Geocoder();
    return await new Promise((resolve) => {
      const timeoutId = setTimeout(() => resolve(null), 5000);
      geocoder.geocode({ location: { lat: Number(lat), lng: Number(lng) } }, (results, status) => {
        clearTimeout(timeoutId);
        if (status !== 'OK' || !Array.isArray(results) || results.length === 0) {
          resolve(null);
          return;
        }
        const components = results[0]?.address_components;
        const area = _componentName(components, 'neighborhood', 'sublocality', 'sublocality_level_1', 'locality');
        if (!area) { resolve(null); return; }
        const place = _componentName(components, 'locality', 'administrative_area_level_1');
        resolve({ area, secondary: (place && place !== area) ? place : null });
      });
    });
  } catch {
    return null;
  }
}

/**
 * Reverse geocode via Google Maps — nearest POI (Places Nearby Search) for the
 * primary label when one exists within range, with neighbourhood/city as
 * secondary context. Falls back to area-only when no nearby POI is found.
 * Returns null (not throws) on missing key/no match, so the caller can
 * fall back further (e.g. to Nominatim).
 */
async function _googleGeocodePOI(lat, lng, key) {
  if (!key) return null;
  const [poi, area] = await Promise.all([
    _googleNearestPOI(lat, lng),
    _googleReverseArea(lat, lng),
  ]);
  if (poi) {
    return { primary: poi.name, secondary: area?.area ?? null, isSpecific: true };
  }
  if (area) {
    return { primary: area.area, secondary: area.secondary, isSpecific: false };
  }
  return null;
}

/**
 * Reverse geocode using Nominatim (OpenStreetMap) — free, no key, worldwide.
 * Returns { primary, secondary, isSpecific }.
 * Hierarchy: POI/amenity → neighbourhood → city.
 */
async function _nominatimReverseGeocode(lat, lng) {
  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse` +
      `?format=json&lat=${Number(lat).toFixed(6)}&lon=${Number(lng).toFixed(6)}&zoom=16&addressdetails=1`;
    const res = await fetch(url, {
      headers: { 'Accept-Language': 'en', 'User-Agent': 'TPL-Locator/1.0' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const addr = data?.address ?? {};

    // Most-specific name first — POI/amenity → neighbourhood → city
    const poi  = addr.amenity || addr.tourism || addr.leisure || addr.shop
              || addr.office  || addr.historic || addr.building;
    const area = addr.neighbourhood || addr.suburb || addr.quarter;
    const city = addr.city || addr.town || addr.village || addr.municipality || addr.county;
    const country = addr.country;

    if (poi) {
      const secondary = area
        ? `${area}, ${city ?? country ?? ''}`.replace(/,\s*$/, '')
        : (city ? `${city}, ${country ?? ''}`.trim() : (country ?? null));
      return { primary: poi, secondary: secondary || null, isSpecific: true };
    } else if (area) {
      const secondary = city ? `${city}, ${country ?? ''}`.trim().replace(/,\s*$/, '') : (country ?? null);
      return { primary: area, secondary: secondary || null, isSpecific: false };
    } else if (city) {
      return { primary: city, secondary: country ?? null, isSpecific: false };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Reverse geocode a worldwide (typically out-of-Pakistan) point. Tries
 * Google Maps (Places + Geocoder) first for accurate POI-level results
 * (needs VITE_GOOGLE_MAPS_KEY), falling back to Nominatim if that's
 * unavailable or comes up empty.
 */
export async function googleReverseGeocode(lat, lng, key = import.meta.env.VITE_GOOGLE_MAPS_KEY) {
  if (lat == null || lng == null) return null;
  const cacheKey = `geo:${Number(lat).toFixed(5)},${Number(lng).toFixed(5)}`;
  if (cacheKey in _extCache) return _extCache[cacheKey];

  const result = (await _googleGeocodePOI(lat, lng, key)) ?? (await _nominatimReverseGeocode(lat, lng));
  _extCache[cacheKey] = result;
  return result;
}

/** Format a geocode result as a landmark string (for geoLabel state in detail pages). */
export function googleGeoLabelString(geo) {
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
  const controller = new AbortController();
  // TPL Maps is a Pakistan-only geocoder — cap how long a borderline/slow
  // lookup can stall the caller instead of relying on the backend's 20s
  // upstream timeout for the equivalent server-side call.
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  try {
    const params = new URLSearchParams({ point: `${lat};${lng}`, apikey: _TPL_KEY });
    const res = await fetch(`${_TPL_RGEO_URL}?${params}`, { signal: controller.signal });
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
  } finally {
    clearTimeout(timeoutId);
  }
}
