import React, { useEffect, useMemo, useRef, useState } from "react";
import loadTPLMaps from "./loadTPLMaps.js";
import { tplGeocode } from "../utils/tplGeocode.js";
import { deviceColor } from "../utils/zonePolygonManager.js";

function safe(v) { return v == null || v === '' ? '—' : String(v); }

function formatTimestamp(point) {
  const ts = point?.timestamp ?? point?.time ?? point?.locTime;
  if (!ts) return '—';
  try { const d = new Date(ts); return isNaN(d.getTime()) ? safe(ts) : d.toLocaleString(); }
  catch { return '—'; }
}

// Compact popup for trajectory dots — shows landmark + timestamp
function buildTrajDotPopup({ ts, geocode, coords }) {
  const primary    = geocode?.primary    ?? null;
  const secondary  = geocode?.secondary  ?? null;
  const isSpecific = geocode?.isSpecific ?? false;

  let locationHtml;
  if (primary && isSpecific) {
    locationHtml =
      `<div style="color:#fff;font-weight:600;margin-bottom:2px;">${safe(primary)}</div>` +
      (secondary ? `<div style="color:#fca5a5;font-size:10px;">${safe(secondary)}</div>` : '');
  } else if (primary) {
    locationHtml =
      `<div style="color:#fff;font-weight:600;margin-bottom:2px;">Near ${safe(primary)}</div>` +
      (secondary ? `<div style="color:#fca5a5;font-size:10px;">${safe(secondary)}</div>` : '');
  } else {
    // Geocode still resolving or unavailable — show coords as placeholder
    locationHtml = `<div style="color:rgba(255,255,255,0.45);font-size:10px;font-family:'JetBrains Mono',monospace;">${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}</div>`;
  }

  return `
    <div style="font-family:ui-sans-serif;font-size:11px;color:#fff;min-width:150px;">
      ${locationHtml}
      <div style="color:rgba(255,255,255,0.55);font-size:10px;margin-top:5px;padding-top:5px;border-top:1px solid rgba(255,255,255,0.15);">
        ${ts}
      </div>
    </div>`;
}

function buildPopupHtml({ displayName, sn, label, coords, point, geocode }) {
  const primary    = geocode?.primary ?? null;
  const secondary  = geocode?.secondary ?? null;
  const isSpecific = geocode?.isSpecific ?? false;

  let locationLabel, locationContent;
  if (primary && isSpecific) {
    locationLabel   = 'Landmark';
    locationContent = `<span style="color:#fff;font-weight:600;">${safe(primary)}</span>`
      + (secondary ? `<br/><span style="color:#fca5a5;font-size:11px;">${safe(secondary)}</span>` : '');
  } else if (primary) {
    locationLabel   = 'Area';
    locationContent = `<span style="color:#fff;font-weight:600;">Near ${safe(primary)}</span>`
      + (secondary ? `<br/><span style="color:#fca5a5;font-size:11px;">${safe(secondary)}</span>` : '');
  } else {
    locationLabel   = 'Location';
    locationContent = `<span style="color:#fca5a5;font-family:'JetBrains Mono',monospace;font-size:11px;">${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}</span>`;
  }

  return `
    <div style="font-family:ui-sans-serif;font-size:12px;min-width:200px;color:#fff;">
      <div style="font-weight:700;font-size:13px;margin-bottom:6px;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.2);color:#fff;letter-spacing:.02em;">
        ${safe(displayName)}
      </div>
      ${label && label !== sn ? `<div style="margin-bottom:8px;color:rgba(255,255,255,0.5);font-size:11px;font-family:'JetBrains Mono',monospace;">${safe(sn)}</div>` : ''}
      <div style="margin-bottom:8px;">
        <div style="display:flex;align-items:center;gap:4px;margin-bottom:4px;">
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="#fca5a5">
            <path d="M14,10a2,2,0,1,1-2-2A2.006,2.006,0,0,1,14,10Zm5.5,0c0,6.08-4.67,9.89-6.67,11.24a1.407,1.407,0,0,1-.83.26,1.459,1.459,0,0,1-.84-.26C9.16,19.89,4.5,16.09,4.5,10A7.33,7.33,0,0,1,12,2.5,7.336,7.336,0,0,1,19.5,10ZM16,10a4,4,0,1,0-4,4A4,4,0,0,0,16,10Z"/>
          </svg>
          <span style="color:rgba(255,255,255,0.6);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;">${locationLabel}</span>
        </div>
        <div style="padding-left:15px;">
          ${locationContent}
          <br/><span style="color:rgba(255,255,255,0.4);font-size:10px;font-family:'JetBrains Mono',monospace;">${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}</span>
        </div>
      </div>
      <div>
        <div style="display:flex;align-items:center;gap:4px;margin-bottom:4px;">
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 432 432" fill="#fca5a5">
            <path d="M213.5 3q88.5 0 151 62.5T427 216t-62.5 150.5t-151 62.5t-151-62.5T0 216T62.5 65.5T213.5 3zm0 384q70.5 0 120.5-50t50-121t-50-121t-120.5-50T93 95T43 216t50 121t120.5 50zM224 109v112l96 57l-16 27l-112-68V109h32z"/>
          </svg>
          <span style="color:rgba(255,255,255,0.6);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;">Time</span>
        </div>
        <div style="padding-left:15px;">
          <span style="color:#fff;">${formatTimestamp(point)}</span>
        </div>
      </div>
    </div>`;
}

// ── Multi-device helpers ──────────────────────────────────────────────────────
function buildColoredPinHtml(color) {
  return `<div style="width:28px;height:28px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));">
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="${color}" width="28" height="28">
      <path d="M14,10a2,2,0,1,1-2-2A2.006,2.006,0,0,1,14,10Zm5.5,0c0,6.08-4.67,9.89-6.67,11.24a1.407,1.407,0,0,1-.83.26,1.459,1.459,0,0,1-.84-.26C9.16,19.89,4.5,16.09,4.5,10A7.33,7.33,0,0,1,12,2.5,7.336,7.336,0,0,1,19.5,10ZM16,10a4,4,0,1,0-4,4A4,4,0,0,0,16,10Z"/>
    </svg>
  </div>`;
}

function buildMultiDevicePopupHtml({ sn, label, point, geocode, coords }) {
  const ts      = formatTimestamp(point);
  const name    = label && label !== sn ? label : sn;
  const primary    = geocode?.primary    ?? null;
  const secondary  = geocode?.secondary  ?? null;
  const isSpecific = geocode?.isSpecific ?? false;

  let locationHtml;
  if (primary && isSpecific) {
    locationHtml =
      `<div style="color:#fff;font-weight:600;margin-bottom:2px;">${safe(primary)}</div>` +
      (secondary ? `<div style="color:#fca5a5;font-size:10px;">${safe(secondary)}</div>` : '');
  } else if (primary) {
    locationHtml =
      `<div style="color:#fff;font-weight:600;margin-bottom:2px;">Near ${safe(primary)}</div>` +
      (secondary ? `<div style="color:#fca5a5;font-size:10px;">${safe(secondary)}</div>` : '');
  } else {
    locationHtml = coords
      ? `<div style="color:rgba(255,255,255,0.4);font-size:10px;font-family:'JetBrains Mono',monospace;">${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}</div>`
      : '';
  }

  return `
    <div style="font-family:ui-sans-serif;font-size:12px;min-width:170px;color:#fff;">
      <div style="font-weight:700;font-size:13px;margin-bottom:6px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.18);">${safe(name)}</div>
      ${label && label !== sn ? `<div style="color:rgba(255,255,255,0.4);font-size:10px;font-family:'JetBrains Mono',monospace;margin-bottom:6px;">${safe(sn)}</div>` : ''}
      <div style="margin-bottom:6px;">${locationHtml}</div>
      <div style="color:rgba(255,255,255,0.5);font-size:10px;padding-top:4px;border-top:1px solid rgba(255,255,255,0.1);">${ts}</div>
    </div>`;
}

// ── Persistent map cache ──────────────────────────────────────────────────────
let _cachedMap       = null;
let _cachedContainer = null;

function attachMap(parent, onReady) {
  if (_cachedMap && _cachedContainer) {
    parent.appendChild(_cachedContainer);
    try { _cachedMap.invalidateSize(); } catch {}
    onReady(_cachedMap);
    return;
  }
  _cachedContainer = document.createElement('div');
  _cachedContainer.id = 'mapview-persistent';
  _cachedContainer.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
  parent.appendChild(_cachedContainer);
  setTimeout(() => {
    if (!_cachedContainer.parentNode) return;
    try {
      const map = window.TPLMaps.map.initMap({
        divID: 'mapview-persistent',
        lat: 24.8607, lng: 67.0011, zoom: 11,
        showZoomControl: true,
      });
      try { map.scrollWheelZoom?.enable(); } catch {}
      try { map.invalidateSize(); } catch {}
      _cachedMap = map;
      onReady(map);
    } catch (err) {
      console.error('[MapView] initMap threw:', err);
    }
  }, 0);
}

function detachMap() {
  if (_cachedContainer && _cachedContainer.parentNode) {
    _cachedContainer.parentNode.removeChild(_cachedContainer);
  }
}

export function resetMapCache() {
  detachMap();
  if (_cachedMap) { try { _cachedMap.remove(); } catch {} _cachedMap = null; }
  _cachedContainer = null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function extractCoords(point) {
  if (!point || typeof point !== 'object') return null;
  const lat = point.lat ?? point.latitude ?? point.gpsLat ?? point.wgLat;
  const lng = point.lng ?? point.lon ?? point.longitude ?? point.gpsLng ?? point.wgLng;
  const latN = Number(lat), lngN = Number(lng);
  if (!Number.isFinite(latN) || !Number.isFinite(lngN)) return null;
  if (latN < -90 || latN > 90 || lngN < -180 || lngN > 180) return null;
  return { lat: latN, lng: lngN };
}

const DEVICE_ICON_HTML = `
  <div style="width:32px;height:32px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));">
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="#b91c1c" width="32" height="32">
      <path d="M14,10a2,2,0,1,1-2-2A2.006,2.006,0,0,1,14,10Zm5.5,0c0,6.08-4.67,9.89-6.67,11.24a1.407,1.407,0,0,1-.83.26,1.459,1.459,0,0,1-.84-.26C9.16,19.89,4.5,16.09,4.5,10A7.33,7.33,0,0,1,12,2.5,7.336,7.336,0,0,1,19.5,10ZM16,10a4,4,0,1,0-4,4A4,4,0,0,0,16,10Z"/>
    </svg>
  </div>`;

// ── Component ─────────────────────────────────────────────────────────────────
export default function MapView({ sn, label, latest, trajectory = [], playbackPoint = null, showLine = true, showFences = false, zones = [], multiDevices = [] }) {
  const containerRef   = useRef(null);
  const mapRef         = useRef(null);
  const markerRef      = useRef(null);
  const popupRef       = useRef(null);
  const coordsRef      = useRef(null);
  const latestRef      = useRef(null);
  const geocodeRef     = useRef(null);
  const displayNameRef = useRef('');
  const snRef          = useRef('');
  const labelRef       = useRef('');

  // Trajectory refs
  const polylineRef = useRef(null);
  const dotsRef     = useRef([]);
  const trajLenRef  = useRef(0);
  const canvasRef   = useRef(null);

  // Fence overlay refs
  const fenceLayersRef = useRef([]);

  // Multi-device marker refs
  const multiMarkersRef  = useRef(new Map()); // sn → { marker, pointHolder }
  const multiGeocodeRef  = useRef(new Map()); // sn → geocode result (cached)
  const multiSnsRef      = useRef(new Set()); // tracks prev selection for change detection
  const pannedForCountRef = useRef(0);        // # of devices that had coords at last pan

  const [mapLoaded, setMapLoaded] = useState(false);

  // During playback, drive the marker from playbackPoint instead of latest
  const activePoint = playbackPoint ?? latest;
  const isPlayback  = playbackPoint != null;

  const coords      = useMemo(() => extractCoords(activePoint), [activePoint]);
  const displayName = label || sn;

  console.log(`[MapView] render — sn:${sn} | isPlayback:${isPlayback} | coords:`, coords, '| traj pts:', trajectory.length);

  // Stable function — creates or moves the marker, wires up hover once
  const ensureMarker = React.useCallback((map, c) => {
    if (!window.L || !map || !c) return;
    if (!markerRef.current) {
      // iconAnchor: pin tip in the SVG is at y≈21.5/24 of viewBox → 21.5/24*32 ≈ 29px from top
      // popupAnchor: open popup just above the pin tip (offset matches iconAnchor)
      const icon = window.L.divIcon({
        html: DEVICE_ICON_HTML, className: '', iconSize: [32, 32], iconAnchor: [16, 29],
      });
      console.log('[Marker] creating new marker with iconAnchor [16, 29]');
      markerRef.current = window.L.marker([c.lat, c.lng], { icon }).addTo(map);
      markerRef.current.on('mouseover', () => {
        // Read the marker's own latLng — always in sync with its visual position,
        // avoids any coordsRef staleness if latest updated between renders
        const latlng = markerRef.current.getLatLng();
        const popupCoords = { lat: latlng.lat, lng: latlng.lng };
        console.log('[Popup] hover — marker latlng:', latlng, '| coordsRef:', coordsRef.current, '| geocode:', geocodeRef.current);
        if (Math.abs(latlng.lat - (coordsRef.current?.lat ?? 0)) > 0.0001 || Math.abs(latlng.lng - (coordsRef.current?.lng ?? 0)) > 0.0001) {
          console.warn('[Popup] ⚠️ marker latlng differs from coordsRef — marker was not yet moved to latest coords');
        }
        if (popupRef.current) popupRef.current.remove();
        popupRef.current = window.L.popup({ offset: [0, -30], closeButton: false, autoClose: false, className: 'mv-popup' })
          .setLatLng(latlng)
          .setContent(buildPopupHtml({
            displayName: displayNameRef.current, sn: snRef.current,
            label: labelRef.current, coords: popupCoords,
            point: latestRef.current, geocode: geocodeRef.current,
          }))
          .openOn(map);
      });
      markerRef.current.on('mouseout', () => {
        if (popupRef.current) { popupRef.current.remove(); popupRef.current = null; }
      });
    } else {
      markerRef.current.setLatLng([c.lat, c.lng]);
    }
  }, []);

  // Keep refs in sync so hover handler always has latest values without recreating listeners
  useEffect(() => { coordsRef.current      = coords;      }, [coords]);
  useEffect(() => { latestRef.current      = activePoint; }, [activePoint]); // popup shows playback point data during playback
  useEffect(() => { displayNameRef.current = displayName; }, [displayName]);
  useEffect(() => { snRef.current          = sn;          }, [sn]);
  useEffect(() => { labelRef.current       = label;       }, [label]);

  // Reverse geocode eagerly whenever active coords change — result ready before hover
  // During fast playback this fires frequently but tplGeocode caches so no repeat API calls
  useEffect(() => {
    if (!coords) { geocodeRef.current = null; return; }
    console.log('[Geocode] kicking off for', coords.lat, coords.lng, isPlayback ? '(playback)' : '(live)');
    tplGeocode(coords.lat, coords.lng).then(result => {
      geocodeRef.current = result;
      console.log('[Geocode] result:', result, isPlayback ? '(playback)' : '(live)');
      // If popup is already open, refresh it with the resolved geocode
      if (popupRef.current && mapRef.current) {
        popupRef.current.setContent(buildPopupHtml({
          displayName: displayNameRef.current,
          sn: snRef.current, label: labelRef.current,
          coords: coordsRef.current, point: latestRef.current,
          geocode: result,
        }));
      }
    });
  }, [coords?.lat, coords?.lng]);

  /* ── INVALIDATE SIZE after paint so Leaflet/Tangram pixel math is correct ── */
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    // rAF ensures we're after the browser paint — container has its real pixel size
    const raf = requestAnimationFrame(() => {
      try {
        mapRef.current.invalidateSize();
        console.log('[MapView] invalidateSize() called after paint — coordinate↔pixel mapping refreshed');
        // If coords already arrived, re-apply the view so the marker lands at correct pixels
        if (coordsRef.current) {
          mapRef.current.setView(
            [coordsRef.current.lat, coordsRef.current.lng],
            Math.max(mapRef.current.getZoom(), 15),
            { animate: false }
          );
          console.log('[MapView] re-applied setView after invalidateSize for', coordsRef.current);
        }
      } catch (e) {
        console.warn('[MapView] invalidateSize failed:', e);
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [mapLoaded]);

  /* ── RESIZE OBSERVER — keep Leaflet in sync if container dimensions change ── */
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(() => {
      if (!mapRef.current) return;
      try {
        mapRef.current.invalidateSize();
        console.log('[MapView] ResizeObserver → invalidateSize()');
      } catch {}
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  /* ── MAP INIT ── */
  useEffect(() => {
    if (!containerRef.current) return;
    loadTPLMaps(() => {
      if (!containerRef.current || mapRef.current) return;
      attachMap(containerRef.current, (map) => {
        mapRef.current = map;
        if (coordsRef.current) {
          ensureMarker(map, coordsRef.current);
          map.setView([coordsRef.current.lat, coordsRef.current.lng], 15, { animate: false });
        }
        setMapLoaded(true);
      });
    });
    return () => {
      try {
        if (popupRef.current  && _cachedMap) { popupRef.current.remove();                    popupRef.current  = null; }
        if (markerRef.current && _cachedMap) { _cachedMap.removeLayer(markerRef.current);    markerRef.current = null; }
        if (polylineRef.current && _cachedMap) { _cachedMap.removeLayer(polylineRef.current); polylineRef.current = null; }
        dotsRef.current.forEach(d => { try { _cachedMap.removeLayer(d); } catch {} });
        fenceLayersRef.current.forEach(p => { try { _cachedMap.removeLayer(p); } catch {} });
        multiMarkersRef.current.forEach(({ marker }) => { try { _cachedMap.removeLayer(marker); } catch {} });
      } catch {}
      dotsRef.current  = [];
      trajLenRef.current = 0;
      fenceLayersRef.current = [];
      multiMarkersRef.current.clear();
      multiGeocodeRef.current.clear();
      multiSnsRef.current = new Set();
      pannedForCountRef.current = 0;
      detachMap();
      mapRef.current = null;
    };
  }, []);

  /* ── DEVICE MARKER — runs when coords update after map is ready ── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.L) return;

    if (!coords) {
      console.log('[Marker] no coords — removing marker');
      if (popupRef.current)  { popupRef.current.remove();  popupRef.current  = null; }
      if (markerRef.current) { map.removeLayer(markerRef.current); markerRef.current = null; }
      return;
    }

    const targetZoom = Math.max(map.getZoom(), 15);

    // Check if target is already within the current visible bounds
    // If it is → smooth animate (live position update nearby)
    // If it isn't → snap instantly so marker appears in view immediately, no lag
    let inView = false;
    try { inView = map.getBounds().contains([coords.lat, coords.lng]); } catch {}

    const shouldAnimate = !isPlayback && inView;
    console.log(`[Marker] moving to`, coords.lat, coords.lng,
      `| inView:${inView} | isPlayback:${isPlayback} | animate:${shouldAnimate}`);

    if (!shouldAnimate) {
      // Snap map to target first so marker appears centred immediately
      map.setView([coords.lat, coords.lng], targetZoom, { animate: false });
    }
    ensureMarker(map, coords);
    if (shouldAnimate) {
      map.setView([coords.lat, coords.lng], targetZoom, { animate: true, duration: 0.4 });
    }
  }, [coords, mapLoaded, isPlayback]);

  /* ── TRAJECTORY ── */
  useEffect(() => {
    const map = mapRef.current;
    console.log(`[Trajectory] effect fired — mapReady:${!!map} | points:${trajectory?.length ?? 0} | prevRendered:${trajLenRef.current}`);
    if (!map || !window.L) {
      console.warn('[Trajectory] skipping — map or L not ready');
      return;
    }

    const items = (trajectory ?? [])
      .map(p => { const c = extractCoords(p); return c ? { c, p } : null; })
      .filter(Boolean);

    console.log(`[Trajectory] valid coords: ${items.length} / ${trajectory?.length ?? 0}`);

    // Empty trajectory — clear everything
    if (items.length === 0) {
      console.log('[Trajectory] empty — clearing polyline + dots');
      if (polylineRef.current) { try { map.removeLayer(polylineRef.current); } catch {} polylineRef.current = null; }
      dotsRef.current.forEach(d => { try { map.removeLayer(d); } catch {} });
      dotsRef.current  = [];
      trajLenRef.current = 0;
      return;
    }

    const latLngs = items.map(({ c }) => [c.lat, c.lng]);

    // Polyline — skipped when showLine=false (playback mode)
    if (showLine) {
      console.log('[Trajectory] drawing/updating polyline with', latLngs.length, 'pts');
      if (!polylineRef.current) {
        polylineRef.current = window.L.polyline(latLngs, {
          color: '#b91c1c', weight: 2.5, opacity: 0.65, interactive: false,
        }).addTo(map);
      } else {
        polylineRef.current.setLatLngs(latLngs);
      }
    } else {
      // Remove polyline if it was previously drawn (e.g. mode switch)
      if (polylineRef.current) {
        console.log('[Trajectory] showLine=false — removing existing polyline');
        try { map.removeLayer(polylineRef.current); } catch {}
        polylineRef.current = null;
      }
    }

    // One canvas renderer per map lifecycle for performance
    if (!canvasRef.current) canvasRef.current = window.L.canvas({ padding: 0.5 });

    // Only add dots that are new since the last render (incremental)
    const newItems = items.slice(trajLenRef.current);
    console.log(`[Trajectory] adding ${newItems.length} new dots (total now ${items.length})`);

    newItems.forEach(({ c, p }, relIdx) => {
      const absIdx = trajLenRef.current + relIdx;
      console.log(`[Trajectory] creating dot #${absIdx} at`, c.lat, c.lng);

      const dot = window.L.circleMarker([c.lat, c.lng], {
        radius: 4, color: '#7f1d1d', fillColor: '#fca5a5',
        fillOpacity: 0.8, weight: 1,
        renderer: canvasRef.current,
      }).addTo(map);

      const ts = formatTimestamp(p);

      dot.on('mouseover', () => {
        console.log(`[TrajDot] hover on dot #${absIdx} at`, c.lat, c.lng);

        // Open popup immediately with coords as placeholder
        const popup = window.L.popup({ offset: [0, 0], closeButton: false, className: 'mv-popup' })
          .setLatLng([c.lat, c.lng])
          .setContent(buildTrajDotPopup({ ts, geocode: null, coords: c }))
          .openOn(map);

        // Fetch geocode — if cached this resolves synchronously on next tick
        console.log(`[TrajDot] fetching geocode for dot #${absIdx}...`);
        let hoverActive = true;
        tplGeocode(c.lat, c.lng).then(geocode => {
          console.log(`[TrajDot] geocode resolved for dot #${absIdx}:`, geocode);
          if (!hoverActive) {
            console.log(`[TrajDot] mouse already left dot #${absIdx}, skipping popup update`);
            return;
          }
          popup.setContent(buildTrajDotPopup({ ts, geocode, coords: c }));
        }).catch(err => {
          console.warn(`[TrajDot] geocode failed for dot #${absIdx}:`, err);
        });

        dot.once('mouseout', () => { hoverActive = false; });
      });

      dot.on('mouseout', () => map.closePopup());
      dotsRef.current.push(dot);
    });
    trajLenRef.current = items.length;
    console.log(`[Trajectory] render complete — total dots: ${dotsRef.current.length} | showLine: ${showLine}`);
  }, [trajectory, mapLoaded, showLine]);

  /* ── FENCE OVERLAY ── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.L) return;

    fenceLayersRef.current.forEach(p => { try { map.removeLayer(p); } catch {} });
    fenceLayersRef.current = [];

    if (!showFences || zones.length === 0) return;

    zones.forEach((zone) => {
      const isMulti = Array.isArray(zone.polygons) && zone.polygons.length > 0;
      if (!isMulti && (!zone.polygon || zone.polygon.length === 0)) return;

      const latLngs = isMulti
        ? zone.polygons.map(ring => ring.map(({ lat, lng }) => [lat, lng]))
        : zone.polygon.map(({ lat, lng }) => [lat, lng]);

      const poly = window.L.polygon(latLngs, {
        color: '#C1121F', fillColor: '#C1121F', fillOpacity: 0.18, weight: 2,
        interactive: false,
      });
      poly.addTo(map);
      fenceLayersRef.current.push(poly);
    });
  }, [showFences, zones, mapLoaded]);

  /* ── MULTI-DEVICE MARKERS ── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.L) return;

    const incomingSns = new Set(multiDevices.map(d => d.sn));
    const prevSns     = multiSnsRef.current;

    // Detect if the set of selected devices changed (not just position updates)
    const selectionChanged =
      incomingSns.size !== prevSns.size ||
      [...incomingSns].some(sn => !prevSns.has(sn)) ||
      [...prevSns].some(sn => !incomingSns.has(sn));
    multiSnsRef.current = incomingSns;

    // Remove markers for devices no longer selected
    multiMarkersRef.current.forEach(({ marker }, sn) => {
      if (!incomingSns.has(sn)) {
        try { map.removeLayer(marker); } catch {}
        multiMarkersRef.current.delete(sn);
      }
    });

    if (multiDevices.length === 0) return;

    // Clean up geocode cache for deselected devices
    multiGeocodeRef.current.forEach((_, sn) => {
      if (!incomingSns.has(sn)) multiGeocodeRef.current.delete(sn);
    });

    multiDevices.forEach(({ sn, label: devLabel, latest: point, color }) => {
      const c = extractCoords(point);
      if (!c) return;

      if (multiMarkersRef.current.has(sn)) {
        const entry = multiMarkersRef.current.get(sn);
        entry.marker.setLatLng([c.lat, c.lng]);
        entry.pointHolder.current = point; // keep current for popup

        // Pre-geocode new position if it changed significantly
        tplGeocode(c.lat, c.lng).then(geo => {
          multiGeocodeRef.current.set(sn, geo);
        }).catch(() => {});
      } else {
        // First time: create marker
        const icon = window.L.divIcon({
          html: buildColoredPinHtml(color),
          className: '', iconSize: [28, 28], iconAnchor: [14, 25],
        });
        const marker      = window.L.marker([c.lat, c.lng], { icon }).addTo(map);
        const pointHolder = { current: point }; // mutable — updated on every position refresh

        marker.on('mouseover', () => {
          const latlng     = marker.getLatLng();
          const coords     = { lat: latlng.lat, lng: latlng.lng };
          const cachedGeo  = multiGeocodeRef.current.get(sn) ?? null;
          const currentPt  = pointHolder.current;

          if (popupRef.current) popupRef.current.remove();
          popupRef.current = window.L.popup({
            offset: [0, -26], closeButton: false, autoClose: false, className: 'mv-popup',
          })
            .setLatLng(latlng)
            .setContent(buildMultiDevicePopupHtml({ sn, label: devLabel, point: currentPt, geocode: cachedGeo, coords }))
            .openOn(map);

          if (!cachedGeo) {
            let active = true;
            tplGeocode(latlng.lat, latlng.lng).then(geo => {
              multiGeocodeRef.current.set(sn, geo);
              if (!active || !popupRef.current) return;
              popupRef.current.setContent(
                buildMultiDevicePopupHtml({ sn, label: devLabel, point: pointHolder.current, geocode: geo, coords })
              );
            }).catch(() => {});
            marker.once('mouseout', () => { active = false; });
          }
        });

        marker.on('mouseout', () => {
          if (popupRef.current) { popupRef.current.remove(); popupRef.current = null; }
        });

        // Pre-geocode eagerly so first hover has data immediately
        tplGeocode(c.lat, c.lng).then(geo => {
          multiGeocodeRef.current.set(sn, geo);
        }).catch(() => {});

        multiMarkersRef.current.set(sn, { marker, pointHolder });
      }
    });

    // ── Pan / fit-bounds ───────────────────────────────────────────────────────
    // Reset the "panned-for" counter whenever the set of selected devices changes.
    // This arms the deferred pan so it fires on the NEXT render that has coords,
    // even if selectionChanged is already false by then (async fetch resolves later).
    if (selectionChanged) {
      pannedForCountRef.current = 0;
    }

    const validCoords = multiDevices
      .map(d => extractCoords(d.latest))
      .filter(Boolean);

    // Pan whenever more devices have locations than the last time we panned.
    //   • fires immediately if coords exist at selection time
    //   • fires deferred when location fetch resolves (selectionChanged is false by then)
    //   • does NOT re-pan on routine auto-refresh (count stays the same)
    //   • does re-fit if user adds more devices and their locations arrive incrementally
    if (validCoords.length > pannedForCountRef.current) {
      pannedForCountRef.current = validCoords.length;
      if (validCoords.length === 1) {
        map.setView(
          [validCoords[0].lat, validCoords[0].lng],
          Math.max(map.getZoom(), 15),
          { animate: true, duration: 0.5 }
        );
      } else {
        try {
          const bounds = window.L.latLngBounds(validCoords.map(c => [c.lat, c.lng]));
          if (bounds.isValid()) map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 });
        } catch {}
      }
    }
  }, [multiDevices, mapLoaded]);

  /* ── UI ── */
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>

      {!sn && multiDevices.length === 0 && (
        <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, pointerEvents:'none' }}>
          <div style={{ background:'rgba(0,0,0,0.9)', backdropFilter:'blur(10px)', border:'1px solid #1f1f1f', borderRadius:14, padding:'24px 36px', boxShadow:'0 8px 30px rgba(0,0,0,0.6)', textAlign:'center' }}>
            <div style={{ fontSize:32, marginBottom:8, opacity:0.5 }}>📍</div>
            <div style={{ color:'#a3a3a3', fontSize:14, fontWeight:600 }}>Select a device from the sidebar</div>
          </div>
        </div>
      )}

      {sn && !coords && (
        <div style={{ position:'absolute', top:12, left:'50%', transform:'translateX(-50%)', zIndex:1000 }}>
          <div style={{ background:'rgba(0,0,0,0.75)', backdropFilter:'blur(6px)', border:'1px solid #2d2d2d', borderRadius:8, padding:'7px 16px', fontSize:12, color:'#a3a3a3', display:'flex', gap:8, alignItems:'center', whiteSpace:'nowrap' }}>
            <span style={{ width:8, height:8, borderRadius:'50%', background:'#f59e0b', display:'inline-block' }} />
            Waiting for GPS — {displayName}
          </div>
        </div>
      )}

      <div ref={containerRef} style={{ position:'absolute', inset:0 }} />
    </div>
  );
}
