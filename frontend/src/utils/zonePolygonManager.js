// src/utils/zonePolygonManager.js
// Pure JS utility — no React imports.

const DEFAULT_STYLE = {
  color:       '#C1121F',
  fillColor:   '#C1121F',
  fillOpacity: 0.18,
  weight:      2,
};

const SELECTED_STYLE = {
  color:       '#C1121F',
  fillColor:   '#C1121F',
  fillOpacity: 0.42,
  weight:      3,
};

const HOVER_FILL_OPACITY = 0.32;

const DOT_STYLE = {
  radius:      4,
  color:       '#fff',
  fillColor:   '#C1121F',
  fillOpacity: 0.85,
  weight:      1,
};

// ── Per-device color palette ──────────────────────────────────────────────────
// 12 visually distinct colors that all read well on a dark map
const DEVICE_PALETTE = [
  '#60a5fa', // blue
  '#34d399', // emerald
  '#f59e0b', // amber
  '#a78bfa', // violet
  '#f87171', // red
  '#22d3ee', // cyan
  '#fb923c', // orange
  '#e879f9', // fuchsia
  '#4ade80', // green
  '#facc15', // yellow
  '#818cf8', // indigo
  '#f472b6', // pink
];

/**
 * Given a stable device serial number, return a consistent color from the palette.
 * Uses a simple djb2-style hash so the same sn always maps to the same color.
 */
export function deviceColor(sn) {
  let hash = 5381;
  for (let i = 0; i < sn.length; i++) {
    hash = ((hash << 5) + hash) ^ sn.charCodeAt(i);
    hash = hash >>> 0; // keep unsigned 32-bit
  }
  return DEVICE_PALETTE[hash % DEVICE_PALETTE.length];
}

/**
 * Ray-casting point-in-polygon test.
 * @param {number} lat - Latitude of the point
 * @param {number} lng - Longitude of the point
 * @param {Array<{lat: number, lng: number}>} polygon - Zone polygon vertices
 * @returns {boolean} True if point is inside the polygon
 */
export function pointInPolygon(lat, lng, polygon) {
  if (!polygon || polygon.length === 0) return false;
  const n = polygon.length;
  let inside = false;
  let j = n - 1;
  for (let i = 0; i < n; i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;
    if ((yi > lat) !== (yj > lat)) {
      if (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
    j = i;
  }
  return inside;
}

function _fmt(ts) {
  if (!ts) return null;
  try {
    const d = new Date(ts);
    if (isNaN(d)) return null;
    return d.toLocaleString(undefined, {
      month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
  } catch { return null; }
}

export function createPolygonManager(map) {
  // Map<zoneId, { polygon, zone }>
  const _polygons = new Map();
  // Dot markers for the currently selected zone (cleared when zone changes)
  let _dotLayers = [];
  // Per-device playback dots — separate layer group so they don't clobber _dotLayers
  let _deviceDotLayers = [];
  let _selectedZoneId = null;

  function _baseOpacityFor(zoneId) {
    return (zoneId === _selectedZoneId ? SELECTED_STYLE : DEFAULT_STYLE).fillOpacity;
  }

  // ── Dot rendering (original — visit points from zone data) ────────────────
  function _clearDots() {
    _dotLayers.forEach((m) => { try { map.removeLayer(m); } catch {} });
    _dotLayers = [];
  }

  function _renderDots(zone) {
    _clearDots();
    if (!zone.points || zone.points.length === 0) return;

    zone.points.forEach((pt) => {
      const marker = window.L.circleMarker([pt.lat, pt.lng], { ...DOT_STYLE });
      marker.addTo(map);

      const label = _fmt(pt.timestamp);
      if (label) {
        marker.bindTooltip(label, { sticky: true, className: 'fp-dot-tip' });
      }

      _dotLayers.push(marker);
    });
  }

  // ── Device playback dot rendering (NEW) ───────────────────────────────────

  /**
   * Clear all per-device playback dots from the map.
   * Called automatically on zone switch or manually.
   */
  function clearDeviceDots() {
    _deviceDotLayers.forEach((m) => { try { map.removeLayer(m); } catch {} });
    _deviceDotLayers = [];
  }

  /**
   * Render GPS playback points for multiple devices on the map.
   *
   * @param {Array<{ sn: string, user_name: string, insidePoints, outsidePoints }>} deviceTracks
   *   Each element is one device's worth of GPS points, split into inside/outside arrays.
   * @param {Array<{lat, lng}>} polygon - Zone polygon for determining point containment
   */
  function renderDeviceDots(deviceTracks, polygon) {
    clearDeviceDots();
    if (!deviceTracks || deviceTracks.length === 0) return;

    deviceTracks.forEach(({ sn, user_name, insidePoints, outsidePoints }) => {
      const color = deviceColor(sn);
      const grey = '#6b7280';

      // Render inside points with device color
      if (insidePoints && insidePoints.length > 0) {
        insidePoints.forEach((pt, idx) => {
          const isFirst = idx === 0;
          const isLast  = idx === insidePoints.length - 1;
          const radius = isFirst || isLast ? 6 : 3.5;

          const marker = window.L.circleMarker([pt.lat, pt.lng], {
            radius,
            color:       '#000',
            fillColor:   color,
            fillOpacity: isFirst || isLast ? 1 : 0.75,
            weight:      isFirst || isLast ? 1.5 : 0.8,
          });

          marker.addTo(map);

          const ts    = _fmt(pt.timestamp);
          const badge = isFirst ? ' · ▶ first' : isLast ? ' · ⬛ last' : '';
          const label = `${user_name || sn}${ts ? `\n${ts}` : ''}${badge}`;
          marker.bindTooltip(label, { sticky: true, className: 'fp-dot-tip' });

          _deviceDotLayers.push(marker);
        });
      }

      // Render outside points in grey
      if (outsidePoints && outsidePoints.length > 0) {
        outsidePoints.forEach((pt) => {
          const marker = window.L.circleMarker([pt.lat, pt.lng], {
            radius: 3,
            color:       '#000',
            fillColor:   grey,
            fillOpacity: 0.5,
            weight:      0.5,
          });

          marker.addTo(map);

          const ts = _fmt(pt.timestamp);
          const label = `${user_name || sn}${ts ? `\n${ts}` : ''} · outside`;
          marker.bindTooltip(label, { sticky: true, className: 'fp-dot-tip' });

          _deviceDotLayers.push(marker);
        });
      }
    });
  }

  // ── Public: renderZones ────────────────────────────────────────────────────
  function renderZones(zones, { onZoneClick, onZoneHover, onZoneHoverOut } = {}) {
    clearAll();
    if (!zones || zones.length === 0) return;

    const allLatLngs = [];

    zones.forEach((zone) => {
      if (!zone.polygon || zone.polygon.length === 0) return;

      const latLngs = zone.polygon.map(({ lat, lng }) => [lat, lng]);
      allLatLngs.push(...latLngs);

      const polygon = window.L.polygon(latLngs, { ...DEFAULT_STYLE });
      polygon.addTo(map);

      polygon.on('click', () => {
        if (onZoneClick) onZoneClick(zone.zone_id);
      });

      polygon.on('mouseover', () => {
        polygon.setStyle({ fillOpacity: HOVER_FILL_OPACITY });
        if (onZoneHover) onZoneHover(zone.zone_id);
      });

      polygon.on('mouseout', () => {
        polygon.setStyle({ fillOpacity: _baseOpacityFor(zone.zone_id) });
        if (onZoneHoverOut) onZoneHoverOut(zone.zone_id);
      });

      _polygons.set(zone.zone_id, { polygon, zone });
    });

    if (allLatLngs.length > 0) {
      try {
        if (zones.length === 1 && zones[0].center) {
          map.setView([zones[0].center.lat, zones[0].center.lng], 14);
        } else {
          const bounds = window.L.latLngBounds(allLatLngs);
          if (bounds.isValid()) map.fitBounds(bounds, { padding: [48, 48] });
        }
      } catch (e) {
        console.warn('[ZonePolygonManager] fitAll failed:', e);
      }
    }
  }

  // ── Public: selectZone ────────────────────────────────────────────────────
  function selectZone(zoneId) {
    _selectedZoneId = zoneId;

    // Restyle all polygons
    _polygons.forEach(({ polygon }, id) => {
      polygon.setStyle(id === zoneId ? SELECTED_STYLE : DEFAULT_STYLE);
    });

    // Clear previous zone visit-dots AND device playback dots on zone switch
    _clearDots();
    clearDeviceDots();

    if (zoneId && _polygons.has(zoneId)) {
      const { polygon, zone } = _polygons.get(zoneId);

      try {
        const bounds = polygon.getBounds();
        if (bounds && bounds.isValid()) {
          map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
        }
      } catch (e) {
        console.warn('[ZonePolygonManager] selectZone fitBounds failed:', e);
      }

      _renderDots(zone);
    }
  }

  // ── Public: clearAll ──────────────────────────────────────────────────────
  function clearAll() {
    _clearDots();
    clearDeviceDots();
    _polygons.forEach(({ polygon }) => {
      try { map.removeLayer(polygon); } catch {}
    });
    _polygons.clear();
    _selectedZoneId = null;
  }

  return { renderZones, selectZone, clearAll, renderDeviceDots, clearDeviceDots };
}