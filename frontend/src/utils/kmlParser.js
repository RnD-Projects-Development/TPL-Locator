// frontend/src/utils/kmlParser.js
/**
 * Browser-native parser for KML files.
 * Extracts Placemarks with Polygon / MultiGeometry boundaries into ZoneCreate payloads.
 */

const PRESET_COLORS = [
  '#C1121F', '#2563EB', '#059669', '#D97706',
  '#7C3AED', '#0891B2', '#DB2777', '#E11D48',
  '#4F46E5', '#0D9488', '#EA580C', '#9333EA',
];

/**
 * Parse a space/newline-separated coordinate string from KML.
 * KML format: "lng,lat,alt lng,lat,alt ..."
 * Returns Array<{ lat: number, lng: number }>
 */
export function parseKMLCoordinates(coordStr) {
  if (!coordStr || typeof coordStr !== 'string') return [];
  const points = [];
  const tokens = coordStr.trim().split(/\s+/);

  for (const token of tokens) {
    if (!token) continue;
    const parts = token.split(',');
    if (parts.length >= 2) {
      const lng = parseFloat(parts[0]);
      const lat = parseFloat(parts[1]);
      if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
        if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          points.push({ lat, lng });
        }
      }
    }
  }
  return points;
}

/**
 * Parse KML string content and extract all valid polygon / area zones.
 * @param {string} kmlText - The raw KML XML string
 * @returns {Array<{ name: string, company?: string, color: string, shape: 'polygon', coordinates: Array<{lat: number, lng: number}> }>}
 */
export function parseKML(kmlText) {
  if (!kmlText || typeof kmlText !== 'string') {
    throw new Error('Invalid or empty KML file');
  }

  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(kmlText, 'text/xml');

  const parseError = xmlDoc.querySelector('parsererror');
  if (parseError) {
    throw new Error('Failed to parse KML XML: ' + (parseError.textContent || 'Syntax error'));
  }

  const placemarks = xmlDoc.querySelectorAll('Placemark');
  const zones = [];

  let colorIdx = 0;

  placemarks.forEach((pm, idx) => {
    // Extract name
    const nameEl = pm.querySelector('name');
    const name = nameEl?.textContent?.trim() || `KML Zone ${idx + 1}`;

    // Extract description / company
    const descEl = pm.querySelector('description');
    const desc = descEl?.textContent?.trim() || '';

    // Extract polygon coordinate rings
    // Prefer outerBoundaryIs > LinearRing > coordinates
    const outerRingCoordEl = pm.querySelector('outerBoundaryIs LinearRing coordinates') ||
                             pm.querySelector('LinearRing coordinates') ||
                             pm.querySelector('Polygon coordinates') ||
                             pm.querySelector('coordinates');

    if (!outerRingCoordEl) return;

    const coords = parseKMLCoordinates(outerRingCoordEl.textContent);
    if (coords.length >= 3) {
      const color = PRESET_COLORS[colorIdx % PRESET_COLORS.length];
      colorIdx++;

      zones.push({
        name,
        company: desc || undefined,
        color,
        shape: 'polygon',
        coordinates: coords,
        center: null,
        radius: null,
      });
    }
  });

  return zones;
}
