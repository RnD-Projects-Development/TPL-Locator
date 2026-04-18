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
  let _selectedZoneId = null;

  function _baseOpacityFor(zoneId) {
    return (zoneId === _selectedZoneId ? SELECTED_STYLE : DEFAULT_STYLE).fillOpacity;
  }

  // ── Dot rendering ──────────────────────────────────────────────────────────
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

  // ── Public: renderZones ────────────────────────────────────────────────────
  function renderZones(zones, { onZoneClick, onZoneHover, onZoneHoverOut } = {}) {
    clearAll();
    if (!zones || zones.length === 0) return;

    const allLatLngs = [];

    zones.forEach((zone) => {
      if (!zone.polygon || zone.polygon.length === 0) return;

      const latLngs = zone.polygon.map(({ lat, lng }) => [lat, lng]);
      allLatLngs.push(...latLngs);

      // Factory call (no `new`) — safer with TPLMaps's bundled Leaflet
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

    // Fit map to all zones on initial load
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

    // Clear previous dots
    _clearDots();

    if (zoneId && _polygons.has(zoneId)) {
      const { polygon, zone } = _polygons.get(zoneId);

      // Pan map to this zone
      try {
        const bounds = polygon.getBounds();
        if (bounds && bounds.isValid()) {
          map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
        }
      } catch (e) {
        console.warn('[ZonePolygonManager] selectZone fitBounds failed:', e);
      }

      // Render visit-point dots on top of the polygon
      _renderDots(zone);
    }
  }

  // ── Public: clearAll ──────────────────────────────────────────────────────
  function clearAll() {
    _clearDots();
    _polygons.forEach(({ polygon }) => {
      try { map.removeLayer(polygon); } catch {}
    });
    _polygons.clear();
    _selectedZoneId = null;
  }

  return { renderZones, selectZone, clearAll };
}
