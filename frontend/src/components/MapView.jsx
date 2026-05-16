import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

// ── Smooth animation between two lat/lng points ───────────────────────────────
function smoothMoveTo(marker, fromLat, fromLng, toLat, toLng, duration, onTick) {
  const start = performance.now();
  let rafId;

  function frame(now) {
    const elapsed = now - start;
    const t = Math.min(elapsed / duration, 1);

    const lat = fromLat + (toLat - fromLat) * t;
    const lng = fromLng + (toLng - fromLng) * t;

    try { marker.setLatLng([lat, lng]); } catch {}
    if (onTick) onTick(lat, lng);

    if (t < 1) {
      rafId = requestAnimationFrame(frame);
    }
  }

  rafId = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(rafId);
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function MapView({
  sn, label, latest, trajectory = [], playbackPoint = null,
  showLine = true, showFences = false, zones = [], multiDevices = [],
  playbackSpeed = 3000,
  // Playback page passes the FULL unsliced trajectory + current index.
  // MapView owns which segments are visible so it can advance exactly one
  // segment per step, preventing bulk-commits on seek/scrub.
  isPlaybackPage = false,
  playbackIndex = 0,
}) {
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

  // ── Standard trajectory refs (used by Trajectory page / non-playback) ────
  const polylineRef  = useRef(null);
  const dotsRef      = useRef([]);
  const trajLenRef   = useRef(0);
  const canvasRef    = useRef(null);

  // ── Playback-isolated trajectory refs ────────────────────────────────────
  // Architecture: "committed polyline" + "animated tip polyline"
  //   - pbCommittedLineRef  : static polyline of all fully-completed segments
  //                           [point_0 … point_N] — never mutated during tween
  //   - pbTipLineRef        : tiny 2-point polyline [point_N, interpolatedPos]
  //                           updated every animation frame — no DOM flicker
  //                           because only the second vertex moves
  //   - pbDotsRef           : canvas circle markers for visited waypoints
  //   - pbCommittedIdxRef   : index of the last fully-committed point
  //   - pbCanvasRef         : shared canvas renderer for dots
  const pbCommittedLineRef = useRef(null); // polyline: committed path
  const pbTipLineRef       = useRef(null); // polyline: animated tip segment
  const pbDotsRef          = useRef([]);   // dot markers for visited waypoints
  const pbCommittedIdxRef  = useRef(-1);   // index of last committed waypoint
  const pbCanvasRef        = useRef(null);
  const pbActiveRef        = useRef(false); // true while playback tween is running

  // Fence overlay refs
  const fenceLayersRef = useRef([]);

  // Multi-device marker refs
  const multiMarkersRef   = useRef(new Map());
  const multiGeocodeRef   = useRef(new Map());
  const multiSnsRef       = useRef(new Set());
  const pannedForCountRef = useRef(0);

  // ── Smooth playback animation refs ───────────────────────────────────────
  const animFromRef    = useRef(null);
  const cancelTweenRef = useRef(null);

  const [mapLoaded, setMapLoaded] = useState(false);

  const activePoint = playbackPoint ?? latest;
  const isPlayback  = playbackPoint != null;

  const coords      = useMemo(() => extractCoords(activePoint), [activePoint]);
  const displayName = label || sn;

  // ── Helper: wipe all standard trajectory layers ───────────────────────────
  const clearTrajectoryLayers = useCallback((map) => {
    if (!map) return;
    if (polylineRef.current) {
      try { map.removeLayer(polylineRef.current); } catch {}
      polylineRef.current = null;
    }
    dotsRef.current.forEach(d => { try { map.removeLayer(d); } catch {} });
    dotsRef.current  = [];
    trajLenRef.current = 0;
  }, []);

  // ── Helper: wipe all playback-specific layers ─────────────────────────────
  const clearPlaybackLayers = useCallback((map) => {
    if (!map) return;
    if (pbCommittedLineRef.current) {
      try { map.removeLayer(pbCommittedLineRef.current); } catch {}
      pbCommittedLineRef.current = null;
    }
    if (pbTipLineRef.current) {
      try { map.removeLayer(pbTipLineRef.current); } catch {}
      pbTipLineRef.current = null;
    }
    pbDotsRef.current.forEach(d => { try { map.removeLayer(d); } catch {} });
    pbDotsRef.current = [];
    pbCommittedIdxRef.current = -1;
    pbActiveRef.current = false;
  }, []);

  // Stable marker creation / hover wiring
  const ensureMarker = useCallback((map, c) => {
    if (!window.L || !map || !c) return;
    if (!markerRef.current) {
      const icon = window.L.divIcon({
        html: DEVICE_ICON_HTML, className: '', iconSize: [32, 32], iconAnchor: [16, 29],
      });
      markerRef.current = window.L.marker([c.lat, c.lng], { icon }).addTo(map);
      animFromRef.current = { lat: c.lat, lng: c.lng };

      markerRef.current.on('mouseover', () => {
        const latlng = markerRef.current.getLatLng();
        const popupCoords = { lat: latlng.lat, lng: latlng.lng };
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
    }
  }, []);

  // Keep refs in sync
  useEffect(() => { coordsRef.current      = coords;      }, [coords]);
  useEffect(() => { latestRef.current      = activePoint; }, [activePoint]);
  useEffect(() => { displayNameRef.current = displayName; }, [displayName]);
  useEffect(() => { snRef.current          = sn;          }, [sn]);
  useEffect(() => { labelRef.current       = label;       }, [label]);

  // Reverse geocode eagerly
  useEffect(() => {
    if (!coords) { geocodeRef.current = null; return; }
    tplGeocode(coords.lat, coords.lng).then(result => {
      geocodeRef.current = result;
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

  /* ── INVALIDATE SIZE ── */
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const raf = requestAnimationFrame(() => {
      try {
        mapRef.current.invalidateSize();
        if (coordsRef.current) {
          mapRef.current.setView(
            [coordsRef.current.lat, coordsRef.current.lng],
            Math.max(mapRef.current.getZoom(), 15),
            { animate: false }
          );
        }
      } catch (e) {
        console.warn('[MapView] invalidateSize failed:', e);
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [mapLoaded]);

  /* ── RESIZE OBSERVER ── */
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(() => {
      if (!mapRef.current) return;
      try { mapRef.current.invalidateSize(); } catch {}
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
      if (cancelTweenRef.current) { cancelTweenRef.current(); cancelTweenRef.current = null; }
      try {
        if (popupRef.current  && _cachedMap) { popupRef.current.remove();                    popupRef.current  = null; }
        if (markerRef.current && _cachedMap) { _cachedMap.removeLayer(markerRef.current);    markerRef.current = null; }
        clearTrajectoryLayers(_cachedMap);
        clearPlaybackLayers(_cachedMap);
        fenceLayersRef.current.forEach(p => { try { _cachedMap.removeLayer(p); } catch {} });
        multiMarkersRef.current.forEach(({ marker }) => { try { _cachedMap.removeLayer(marker); } catch {} });
      } catch {}
      fenceLayersRef.current = [];
      multiMarkersRef.current.clear();
      multiGeocodeRef.current.clear();
      multiSnsRef.current = new Set();
      pannedForCountRef.current = 0;
      animFromRef.current = null;
      detachMap();
      mapRef.current = null;
    };
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  /* ── DEVICE MARKER — with smooth playback animation ── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.L) return;

    if (!coords) {
      if (cancelTweenRef.current) { cancelTweenRef.current(); cancelTweenRef.current = null; }
      if (popupRef.current)  { popupRef.current.remove();  popupRef.current  = null; }
      if (markerRef.current) { map.removeLayer(markerRef.current); markerRef.current = null; }
      animFromRef.current = null;
      return;
    }

    if (cancelTweenRef.current) {
      cancelTweenRef.current();
      cancelTweenRef.current = null;
    }

    if (isPlayback) {
      ensureMarker(map, coords);

      const from = animFromRef.current ?? coords;
      const to   = coords;

      const distSq = (to.lat - from.lat) ** 2 + (to.lng - from.lng) ** 2;
      if (distSq < 1e-14) {
        markerRef.current?.setLatLng([to.lat, to.lng]);
        animFromRef.current = to;
        return;
      }

      const tweenDuration = Math.max(playbackSpeed * 0.98, 100);

      // ── Playback page: update the animated tip polyline each frame ────────
      // This is the key fix: instead of calling setLatLngs on the full committed
      // polyline every frame, we only move the second vertex of the 2-point tip
      // line. The committed polyline is never touched during the tween.
      let onTickFn = null;
      if (isPlaybackPage && pbTipLineRef.current) {
        onTickFn = (lat, lng) => {
          try {
            pbTipLineRef.current?.setLatLngs([
              [from.lat, from.lng],
              [lat, lng],
            ]);
          } catch {}
        };
      }

      cancelTweenRef.current = smoothMoveTo(
        markerRef.current,
        from.lat, from.lng,
        to.lat,   to.lng,
        tweenDuration,
        onTickFn,
      );

      const timeoutId = setTimeout(() => {
        animFromRef.current = to;
        cancelTweenRef.current = null;

        // When the tween completes, collapse the tip line back to a zero-length
        // segment at the destination. The committed line already ends at `from`
        // (the previous waypoint); the next effect run will extend it to `to`.
        if (isPlaybackPage && pbTipLineRef.current) {
          try {
            pbTipLineRef.current.setLatLngs([[to.lat, to.lng], [to.lat, to.lng]]);
          } catch {}
        }
      }, tweenDuration);

      const targetZoom = Math.max(map.getZoom(), 15);
      let inView = false;
      try { inView = map.getBounds().contains([to.lat, to.lng]); } catch {}
      if (!inView) {
        map.setView([to.lat, to.lng], targetZoom, { animate: true, duration: 0.5 });
      }

      const originalCancel = cancelTweenRef.current;
      cancelTweenRef.current = () => {
        if (originalCancel) originalCancel();
        clearTimeout(timeoutId);
      };

    } else {
      // Live mode: reset animation origin
      animFromRef.current = coords;

      const targetZoom = Math.max(map.getZoom(), 15);
      let inView = false;
      try { inView = map.getBounds().contains([coords.lat, coords.lng]); } catch {}

      const shouldAnimate = inView;

      if (!shouldAnimate) {
        map.setView([coords.lat, coords.lng], targetZoom, { animate: false });
      }
      ensureMarker(map, coords);
      if (!markerRef.current) return;
      markerRef.current.setLatLng([coords.lat, coords.lng]);
      if (shouldAnimate) {
        map.setView([coords.lat, coords.lng], targetZoom, { animate: true, duration: 0.4 });
      }
    }
  }, [coords, mapLoaded, isPlayback, playbackSpeed, ensureMarker, isPlaybackPage]);

  /* ── STANDARD TRAJECTORY (non-playback pages: Trajectory page etc.) ─────
   * This block is completely bypassed when isPlaybackPage is true.
   * The Trajectory page continues to use this untouched path.
   */
  useEffect(() => {
    // Skip entirely for playback page — it has its own renderer below
    if (isPlaybackPage) return;

    const map = mapRef.current;
    if (!map || !window.L) return;

    const items = (trajectory ?? [])
      .map(p => { const c = extractCoords(p); return c ? { c, p } : null; })
      .filter(Boolean);

    if (items.length < trajLenRef.current || items.length === 0) {
      clearTrajectoryLayers(map);
    }

    if (items.length === 0) return;

    const latLngs = items.map(({ c }) => [c.lat, c.lng]);

    if (showLine || isPlayback) {
      if (!polylineRef.current) {
        polylineRef.current = window.L.polyline(latLngs, {
          color: '#b91c1c', weight: 2.5, opacity: 0.65, interactive: false,
        }).addTo(map);
      } else {
        polylineRef.current.setLatLngs(latLngs);
      }
    } else {
      if (polylineRef.current) {
        try { map.removeLayer(polylineRef.current); } catch {}
        polylineRef.current = null;
      }
    }

    if (!canvasRef.current) canvasRef.current = window.L.canvas({ padding: 0.5 });

    const MAX_DOTS  = 300;
    const stepSize  = items.length > MAX_DOTS ? Math.ceil(items.length / MAX_DOTS) : 1;

    const newItems = items.slice(trajLenRef.current);

    newItems.forEach(({ c, p }, relIdx) => {
      const absIdx = trajLenRef.current + relIdx;

      if (absIdx % stepSize !== 0 && absIdx !== items.length - 1) return;

      const dot = window.L.circleMarker([c.lat, c.lng], {
        radius: 4, color: '#7f1d1d', fillColor: '#fca5a5',
        fillOpacity: 0.8, weight: 1,
        renderer: canvasRef.current,
      }).addTo(map);

      const ts = formatTimestamp(p);

      dot.on('mouseover', () => {
        const popup = window.L.popup({ offset: [0, 0], closeButton: false, className: 'mv-popup' })
          .setLatLng([c.lat, c.lng])
          .setContent(buildTrajDotPopup({ ts, geocode: null, coords: c }))
          .openOn(map);

        let hoverActive = true;
        tplGeocode(c.lat, c.lng).then(geocode => {
          if (!hoverActive) return;
          popup.setContent(buildTrajDotPopup({ ts, geocode, coords: c }));
        }).catch(() => {});

        dot.once('mouseout', () => { hoverActive = false; });
      });

      dot.on('mouseout', () => map.closePopup());
      dotsRef.current.push(dot);
    });

    trajLenRef.current = items.length;
  }, [trajectory, mapLoaded, showLine, isPlayback, isPlaybackPage, clearTrajectoryLayers]);

  /* ── PLAYBACK-PAGE TRAJECTORY RENDERER ──────────────────────────────────
   *
   * Architecture: Committed path + Animated tip
   * ─────────────────────────────────────────────
   * pbCommittedLineRef  — polyline of all fully-completed segments up to
   *                       (playbackIndex - 1). Never mutated during animation
   *                       frames → zero flicker.
   *
   * pbTipLineRef        — 2-point polyline [waypoint_(idx-1), interpolatedPos].
   *                       The tween's onTick slides the second vertex each rAF.
   *                       A 2-point setLatLngs is microscopically cheap.
   *
   * pbDotsRef           — canvas circle markers for each committed waypoint.
   *
   * Key invariant:
   *   PlaybackPage passes the FULL unsliced trajectory + playbackIndex.
   *   This effect watches playbackIndex directly, so it always advances by
   *   exactly ONE segment — even if the host re-renders multiple times or
   *   the user scrubs the slider. Committed path never bulk-grows.
   *
   *   Committed covers indices [0 … playbackIndex-1].
   *   Tip covers the live segment [playbackIndex-1 … marker's current pos].
   */
  useEffect(() => {
    if (!isPlaybackPage) return;

    const map = mapRef.current;
    if (!map || !window.L) return;

    // ── Live / session mode on the Playback page ──────────────────────────
    // No trajectory lines at all — just the marker.
    if (!isPlayback) {
      clearPlaybackLayers(map);
      return;
    }

    // ── Build full items array from the unsliced trajectory ───────────────
    const items = (trajectory ?? [])
      .map(p => { const c = extractCoords(p); return c ? { c, p } : null; })
      .filter(Boolean);

    if (items.length === 0) {
      clearPlaybackLayers(map);
      return;
    }

    // ── Reset when playbackIndex went backwards (seek/reset/new load) ─────
    // pbCommittedIdxRef holds the last index whose waypoint was committed.
    // If the current playbackIndex is behind or equal to it, we must wipe
    // and re-bootstrap from the new position.
    if (playbackIndex <= pbCommittedIdxRef.current && pbCommittedIdxRef.current >= 0) {
      clearPlaybackLayers(map);
    }

    if (!pbCanvasRef.current) pbCanvasRef.current = window.L.canvas({ padding: 0.5 });

    // ── Bootstrap: create the two polylines on first entry ───────────────
    if (pbCommittedIdxRef.current < 0) {
      // Guard: need at least the starting waypoint
      if (playbackIndex >= items.length) return;

      const startItem = items[playbackIndex];

      // Committed line: degenerate single point — invisible but extensible.
      pbCommittedLineRef.current = window.L.polyline(
        [[startItem.c.lat, startItem.c.lng]],
        { color: '#b91c1c', weight: 2.5, opacity: 0.65, interactive: false }
      ).addTo(map);

      // Tip line: collapsed at the start point.
      pbTipLineRef.current = window.L.polyline(
        [[startItem.c.lat, startItem.c.lng], [startItem.c.lat, startItem.c.lng]],
        { color: '#b91c1c', weight: 2.5, opacity: 0.65, interactive: false }
      ).addTo(map);

      pbCommittedIdxRef.current = playbackIndex;
      return; // nothing more to commit on the very first step
    }

    // ── Commit exactly one new waypoint ───────────────────────────────────
    // The committed line ends at pbCommittedIdxRef.current.
    // playbackIndex is the marker's current logical position.
    // We extend by one: commit up to playbackIndex (the just-reached waypoint).
    // The *next* segment (playbackIndex → playbackIndex+1) is left to the tip.
    const prevCommitted = pbCommittedIdxRef.current;
    const nextCommitted = playbackIndex; // advance to current position

    if (nextCommitted > prevCommitted && nextCommitted < items.length) {
      // Extend committed line by the one new waypoint
      const newPt = items[nextCommitted].c;
      const existing = pbCommittedLineRef.current?.getLatLngs() ?? [];
      try {
        pbCommittedLineRef.current?.setLatLngs([
          ...existing,
          window.L.latLng(newPt.lat, newPt.lng),
        ]);
      } catch {}

      // Drop a dot at the newly committed waypoint (sub-sampled)
      const MAX_DOTS = 300;
      const stepSize = items.length > MAX_DOTS ? Math.ceil(items.length / MAX_DOTS) : 1;
      if (nextCommitted % stepSize === 0 || nextCommitted === items.length - 1) {
        _addPbDot(map, newPt, items[nextCommitted].p);
      }

      pbCommittedIdxRef.current = nextCommitted;
    }

    // ── Seed the tip for the upcoming segment ─────────────────────────────
    // Collapsed at the current position — the tween's onTick will stretch it
    // forward toward the next waypoint.
    if (pbTipLineRef.current && playbackIndex < items.length) {
      const fromPt = items[pbCommittedIdxRef.current]?.c;
      if (fromPt) {
        try {
          pbTipLineRef.current.setLatLngs([
            [fromPt.lat, fromPt.lng],
            [fromPt.lat, fromPt.lng],
          ]);
        } catch {}
      }
    }

    function _addPbDot(map, c, p) {
      if (!window.L) return;
      const dot = window.L.circleMarker([c.lat, c.lng], {
        radius: 4, color: '#7f1d1d', fillColor: '#fca5a5',
        fillOpacity: 0.8, weight: 1,
        renderer: pbCanvasRef.current,
      }).addTo(map);

      const ts = formatTimestamp(p);
      dot.on('mouseover', () => {
        const popup = window.L.popup({ offset: [0, 0], closeButton: false, className: 'mv-popup' })
          .setLatLng([c.lat, c.lng])
          .setContent(buildTrajDotPopup({ ts, geocode: null, coords: c }))
          .openOn(map);

        let hoverActive = true;
        tplGeocode(c.lat, c.lng).then(geocode => {
          if (!hoverActive) return;
          popup.setContent(buildTrajDotPopup({ ts, geocode, coords: c }));
        }).catch(() => {});
        dot.once('mouseout', () => { hoverActive = false; });
      });
      dot.on('mouseout', () => map.closePopup());
      pbDotsRef.current.push(dot);
    }

  }, [playbackIndex, trajectory, mapLoaded, isPlayback, isPlaybackPage, clearPlaybackLayers]);

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

    const selectionChanged =
      incomingSns.size !== prevSns.size ||
      [...incomingSns].some(sn => !prevSns.has(sn)) ||
      [...prevSns].some(sn => !incomingSns.has(sn));
    multiSnsRef.current = incomingSns;

    multiMarkersRef.current.forEach(({ marker }, sn) => {
      if (!incomingSns.has(sn)) {
        try { map.removeLayer(marker); } catch {}
        multiMarkersRef.current.delete(sn);
      }
    });

    if (multiDevices.length === 0) return;

    multiGeocodeRef.current.forEach((_, sn) => {
      if (!incomingSns.has(sn)) multiGeocodeRef.current.delete(sn);
    });

    multiDevices.forEach(({ sn, label: devLabel, latest: point, color }) => {
      const c = extractCoords(point);
      if (!c) return;

      if (multiMarkersRef.current.has(sn)) {
        const entry = multiMarkersRef.current.get(sn);
        entry.marker.setLatLng([c.lat, c.lng]);
        entry.pointHolder.current = point;
        tplGeocode(c.lat, c.lng).then(geo => {
          multiGeocodeRef.current.set(sn, geo);
        }).catch(() => {});
      } else {
        const icon = window.L.divIcon({
          html: buildColoredPinHtml(color),
          className: '', iconSize: [28, 28], iconAnchor: [14, 25],
        });
        const marker      = window.L.marker([c.lat, c.lng], { icon }).addTo(map);
        const pointHolder = { current: point };

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

        tplGeocode(c.lat, c.lng).then(geo => {
          multiGeocodeRef.current.set(sn, geo);
        }).catch(() => {});

        multiMarkersRef.current.set(sn, { marker, pointHolder });
      }
    });

    if (selectionChanged) {
      pannedForCountRef.current = 0;
    }

    const validCoords = multiDevices
      .map(d => extractCoords(d.latest))
      .filter(Boolean);

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