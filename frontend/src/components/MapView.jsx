import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import loadTPLMaps from "./loadTPLMaps.js";
import { landmarkDisplayFromPoint, mapboxReverseGeocode, insidePakistan } from "../utils/landmark.js";
import { deviceColor } from "../utils/zonePolygonManager.js";
import { usePlaybackStore } from "../store/usePlaybackStore.js";
import { clusterStops, stopDurationMs, formatStopDuration } from "../utils/stopClustering.js";
import { peekGeocode, resolveGeocode } from "../utils/geocodeCache.js";

// ── Mapbox fallback — used for devices outside Pakistan ───────────────────────
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN ?? '';
const MAPBOX_TILE  = `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/256/{z}/{x}/{y}@2x?access_token=${MAPBOX_TOKEN}`;

// Street-level zoom enforced the moment playback starts, and held for the
// whole session — enforced every frame (cheap: no-op once already at this
// zoom), not just on the play transition, so nothing can ever leave the
// camera more zoomed out than this while playing.
const PLAYBACK_ZOOM = 16;

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

// ── Top-down car icon — rotates to face direction of travel ──────────────────
function buildCarIconHtml(bearing = 0) {
  return `<div style="transform:rotate(${bearing}deg);transform-origin:center center;width:28px;height:46px;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.55));">
    <svg viewBox="0 0 60 100" xmlns="http://www.w3.org/2000/svg" width="28" height="46">
      <rect x="8"  y="12" width="44" height="76" rx="10" fill="#dc2626"/>
      <rect x="12" y="22" width="36" height="24" rx="4"  fill="rgba(15,15,25,0.88)"/>
      <rect x="12" y="60" width="36" height="16" rx="3"  fill="rgba(15,15,25,0.72)"/>
      <rect x="10" y="13" width="12" height="7"  rx="2"  fill="#fde68a"/>
      <rect x="38" y="13" width="12" height="7"  rx="2"  fill="#fde68a"/>
      <rect x="10" y="80" width="12" height="7"  rx="2"  fill="#f87171"/>
      <rect x="38" y="80" width="12" height="7"  rx="2"  fill="#f87171"/>
      <rect x="2"  y="18" width="10" height="18" rx="3"  fill="#111827"/>
      <rect x="48" y="18" width="10" height="18" rx="3"  fill="#111827"/>
      <rect x="2"  y="64" width="10" height="18" rx="3"  fill="#111827"/>
      <rect x="48" y="64" width="10" height="18" rx="3"  fill="#111827"/>
    </svg>
  </div>`;
}

// ── Inject pulse keyframe once ───────────────────────────────────────────────
function ensurePulseStyle() {
  if (document.getElementById('pb-pin-pulse-style')) return;
  const s = document.createElement('style');
  s.id = 'pb-pin-pulse-style';
  s.textContent = `@keyframes pbPinPulse{0%{box-shadow:0 3px 8px rgba(0,0,0,.45),0 0 0 0 rgba(231,76,60,.65)}70%{box-shadow:0 3px 8px rgba(0,0,0,.45),0 0 0 10px rgba(231,76,60,0)}100%{box-shadow:0 3px 8px rgba(0,0,0,.45),0 0 0 0 rgba(231,76,60,0)}}`;
  document.head.appendChild(s);
}

// ── Active playback pin — same lollipop as the regular pin + pulsing ring + directional arrow ────
function buildPlaybackPinHtml(innerColor = '#E8192C', outerColor = '#8B0000', bearing = 0) {
  ensurePulseStyle();
  return `
  <div style="position:relative;display:flex;flex-direction:column;align-items:center;width:30px;height:48px;">
    <div style="width:26px;height:26px;border-radius:50%;flex-shrink:0;
      background:${outerColor};display:flex;align-items:center;justify-content:center;
      animation:pbPinPulse 1.4s ease-out infinite;">
      <div class="pb-rotatable-pin" style="width:16px;height:16px;border-radius:50%;background:${innerColor};
        display:flex;align-items:center;justify-content:center;
        transform:rotate(${bearing}deg);transition:transform 0.1s linear;">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="white" style="transform: translateY(-1px);">
          <path d="M12 2L20 20L12 17L4 20L12 2Z"/>
        </svg>
      </div>
    </div>
    <div style="width:4px;height:18px;flex-shrink:0;background:#3d3d3d;border-radius:0 0 3px 3px;"></div>
    <div style="position:absolute;bottom:0;left:50%;transform:translateX(-50%);
      width:16px;height:6px;border-radius:50%;background:rgba(0,0,0,0.18);"></div>
  </div>`;
}

// ── Small data-point pin — dark maroon lollipop, smaller than main pin ───────
function buildSmallPinHtml() {
  return `
  <div style="position:relative;display:flex;flex-direction:column;align-items:center;width:14px;height:22px;">
    <div style="width:11px;height:11px;border-radius:50%;flex-shrink:0;
      background:#7F1D1D;display:flex;align-items:center;justify-content:center;
      box-shadow:0 1px 4px rgba(0,0,0,0.5);">
      <div style="width:5px;height:5px;border-radius:50%;background:#A72C32;"></div>
    </div>
    <div style="width:2px;height:9px;flex-shrink:0;background:#3d3d3d;border-radius:0 0 2px 2px;"></div>
    <div style="position:absolute;bottom:0;left:50%;transform:translateX(-50%);
      width:7px;height:3px;border-radius:50%;background:rgba(0,0,0,0.15);"></div>
  </div>`;
}

// ── Stop marker — actual stop sign
function buildActualStopSignHtml() {
  return `
  <div style="position:relative; width:24px; height:24px; display:flex; align-items:center; justify-content:center; filter: drop-shadow(0 2px 3px rgba(0,0,0,0.4));">
    <svg viewBox="0 0 100 100" width="24" height="24">
      <polygon points="29.3,2.5 70.7,2.5 97.5,29.3 97.5,70.7 70.7,97.5 29.3,97.5 2.5,70.7 2.5,29.3" fill="#7F1D1D" stroke="white" stroke-width="4"/>
      <polygon points="31,7 69,7 93,31 93,69 69,93 31,93 7,69 7,31" fill="none" stroke="white" stroke-width="1.5"/>
      <rect x="38" y="32" width="8" height="36" fill="white" rx="2" />
      <rect x="54" y="32" width="8" height="36" fill="white" rx="2" />
    </svg>
  </div>`;
}

// ── Compute compass bearing (0° = north, clockwise) between two coordinates ──
function getBearing(fromLat, fromLng, toLat, toLng) {
  const dLng = (toLng - fromLng) * Math.PI / 180;
  const lat1 = fromLat * Math.PI / 180;
  const lat2 = toLat   * Math.PI / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

// ── Lollipop pin — outer ring + bright inner circle + slim stem + ground shadow ─
function buildPinIconHtml(innerColor = '#E8192C', outerColor = '#8B0000') {
  return `
  <div style="position:relative;display:flex;flex-direction:column;align-items:center;width:30px;height:48px;">
    <div style="width:26px;height:26px;border-radius:50%;flex-shrink:0;
      background:${outerColor};
      display:flex;align-items:center;justify-content:center;
      box-shadow:0 3px 8px rgba(0,0,0,0.45);">
      <div style="width:16px;height:16px;border-radius:50%;background:${innerColor};"></div>
    </div>
    <div style="width:4px;height:18px;flex-shrink:0;
      background:#3d3d3d;
      border-radius:0 0 3px 3px;"></div>
    <div style="position:absolute;bottom:0;left:50%;transform:translateX(-50%);
      width:16px;height:6px;border-radius:50%;
      background:rgba(0,0,0,0.18);"></div>
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

function attachMap(parent, onReady, onError) {
  if (_cachedMap && _cachedContainer) {
    console.log('[MapView] reusing cached map instance');
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
    if (!window.TPLMaps || !window.TPLMaps.map || typeof window.TPLMaps.map.initMap !== 'function') {
      console.error('[MapView] initMap unavailable — TPLMaps globals not ready', {
        TPLMaps: !!window.TPLMaps,
        'TPLMaps.map': !!(window.TPLMaps && window.TPLMaps.map),
        L: !!window.L,
      });
      if (onError) onError('Map SDK loaded but initMap is unavailable');
      return;
    }
    try {
      console.log('[MapView] calling TPLMaps.map.initMap …');
      const map = window.TPLMaps.map.initMap({
        divID: 'mapview-persistent',
        lat: 24.8607, lng: 67.0011, zoom: 11,
        showZoomControl: true,
      });
      try { map.scrollWheelZoom?.enable(); } catch {}
      try { map.invalidateSize(); } catch {}
      _cachedMap = map;
      console.log('[MapView] ✅ initMap succeeded — map instance created');
      onReady(map);
    } catch (err) {
      console.error('[MapView] ❌ initMap threw:', err);
      if (onError) onError('Map failed to initialise (initMap threw)');
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

const DEVICE_ICON_HTML = buildPinIconHtml('#E8192C', '#8B0000');

// ── Smooth animation between two lat/lng points ───────────────────────────────
function smoothMoveTo(marker, fromLat, fromLng, toLat, toLng, duration, onTick) {
  const start = performance.now();
  let rafId;

  function frame(now) {
    const elapsed = now - start;
    const rawT = Math.min(elapsed / duration, 1);
    // Cubic ease-in-out: slow start, fast middle, slow stop
    const t = rawT < 0.5 ? 2 * rawT * rawT : -1 + (4 - 2 * rawT) * rawT;

    const lat = fromLat + (toLat - fromLat) * t;
    const lng = fromLng + (toLng - fromLng) * t;

    try { marker.setLatLng([lat, lng]); } catch {}
    if (onTick) onTick(lat, lng);

    if (rawT < 1) {
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
  onFocusDevice = null,
  // All trajectory points rendered immediately as dim background dots (playback page only).
  staticDots = [],
  isPlaying = false,
  // Backend TPL reverse-geocode lookup, used (Pakistan-only, as a fallback)
  // when labelling playback-page pins with their landmark.
  getGeocode = null,
}) {
  const onFocusRef     = useRef(onFocusDevice);
  useEffect(() => { onFocusRef.current = onFocusDevice; }, [onFocusDevice]);

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

  // ── Playback-isolated refs ────────────────────────────────────────────────
  // No trajectory line is rendered on the playback page — only the marker
  // and its visited-waypoint dots.
  //   - pbDotsRef           : canvas circle markers for visited waypoints
  //   - pbCommittedIdxRef   : index of the last fully-committed point
  //   - pbCanvasRef         : shared canvas renderer for dots
  const pbDotsRef          = useRef([]);   // dot markers for visited waypoints
  const pbCommittedIdxRef  = useRef(-1);   // index of last committed waypoint
  const pbCanvasRef        = useRef(null);
  const pbActiveRef        = useRef(false); // true while playback tween is running
  const pbLastIdxRef       = useRef(-1);   // index of the raw point the marker last jumped to
  const pbLastGeoKeyRef    = useRef(null); // coordinate key last resolved for the main-pin tooltip

  // Static preview dots refs (playback page — all points shown immediately on load)
  const staticDotsRef   = useRef([]);

  // Tile-swap — we add our own Mapbox layer on top when outside Pakistan
  const mapboxLayerRef = useRef(null);

  // Fence overlay refs
  const fenceLayersRef = useRef([]);

  // Multi-device marker refs
  const multiMarkersRef = useRef(new Map());
  const multiGeocodeRef = useRef(new Map());
  const multiSnsRef     = useRef(new Set());
  // Tracks which SNs we've already panned to in the current selection.
  // We pan exactly once per device per selection (when its first location arrives).
  const pannedSnsRef    = useRef(new Set());

  // ── Smooth playback animation refs ───────────────────────────────────────
  const animFromRef      = useRef(null);
  const cancelTweenRef   = useRef(null);
  const prevIsPlayingRef = useRef(false);

  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError]   = useState(null);
  const [retryTick, setRetryTick] = useState(0);

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
    pbDotsRef.current.forEach(d => { try { map.removeLayer(d); } catch {} });
    pbDotsRef.current = [];
    pbCommittedIdxRef.current = -1;
    pbActiveRef.current = false;
    pbLastIdxRef.current = -1;
    pbLastGeoKeyRef.current = null;
  }, []);

  // Stable marker creation / hover wiring
  const ensureMarker = useCallback((map, c) => {
    if (!window.L || !map || !c) return;
    if (!markerRef.current) {
      const icon = window.L.divIcon({
        html: DEVICE_ICON_HTML, className: '', iconSize: [30, 48], iconAnchor: [15, 42],
      });
      markerRef.current = window.L.marker([c.lat, c.lng], { icon }).addTo(map);
      animFromRef.current = { lat: c.lat, lng: c.lng };

      markerRef.current.on('click', () => {
        if (onFocusRef.current && snRef.current) onFocusRef.current(snRef.current);
      });
    }
  }, []);

  // Keep refs in sync
  useEffect(() => { coordsRef.current      = coords;      }, [coords]);
  useEffect(() => { latestRef.current      = activePoint; }, [activePoint]);
  useEffect(() => { displayNameRef.current = displayName; }, [displayName]);
  useEffect(() => { snRef.current          = sn;          }, [sn]);
  useEffect(() => { labelRef.current       = label;       }, [label]);

  // Landmark — backend-stored first, Mapbox fallback for outside-Pakistan
  useEffect(() => {
    // `coords` on the playback page is a dummy (0,0) sentinel while playing
    // (see `isPlayback` below) — real position lives in the turf/rAF
    // renderer, not in this prop. Reverse-geocoding (0,0) would just spam
    // Nominatim for "null island" every time playback starts.
    if (isPlaybackPage && isPlayback) return;

    let cancelled = false;

    const updatePopup = (geocode) => {
      geocodeRef.current = geocode;
      if (popupRef.current && mapRef.current) {
        popupRef.current.setContent(buildPopupHtml({
          displayName: displayNameRef.current,
          sn: snRef.current, label: labelRef.current,
          coords: coordsRef.current, point: latestRef.current,
          geocode,
        }));
      }
    };

    const display = landmarkDisplayFromPoint(activePoint);
    if (display) { updatePopup(display); return; }

    // No backend landmark — use Mapbox for outside-Pakistan devices
    if (!coords || insidePakistan(coords.lat, coords.lng)) {
      updatePopup(null);
      return;
    }

    mapboxReverseGeocode(coords.lat, coords.lng, MAPBOX_TOKEN).then(mbx => {
      if (!cancelled) updatePopup(mbx ?? null);
    });

    return () => { cancelled = true; };
  }, [activePoint?.landmark, coords?.lat, coords?.lng, isPlaybackPage, isPlayback]);

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

  /* ── TILE SWAP — overlay a Mapbox layer when any visible device is outside Pakistan ── */
  useEffect(() => {
    if (!mapLoaded || !mapRef.current || !window.L) return;
    // `coords` on the playback page is a dummy (0,0) sentinel while playing
    // (real position lives in the turf/rAF renderer's own state, not this
    // prop) — (0,0) is never "inside Pakistan", so treating it as real would
    // permanently overlay a second, competing Mapbox tile layer on top of
    // the TPL base map. But we still need SOME real-coordinate signal here:
    // TPL Maps has no tile coverage outside Pakistan, so a genuinely
    // out-of-Pakistan device playing back would otherwise render a totally
    // blank map (no fallback tile layer ever gets added). Use the actual
    // loaded trajectory points instead of the dummy sentinel.
    let outside;
    if (isPlaybackPage && isPlayback) {
      outside = (staticDots ?? []).some(p => {
        const c = extractCoords(p);
        return c && !insidePakistan(c.lat, c.lng);
      });
    } else if (coords) {
      outside = !insidePakistan(coords.lat, coords.lng);
    } else {
      // Multi-device mode: check any device in multiDevices
      outside = multiDevices.some(d => { const c = extractCoords(d.latest); return c && !insidePakistan(c.lat, c.lng); });
    }
    if (outside && !mapboxLayerRef.current) {
      try {
        mapboxLayerRef.current = window.L.tileLayer(MAPBOX_TILE, { maxZoom: 19 }).addTo(mapRef.current);
      } catch {}
    } else if (!outside && mapboxLayerRef.current) {
      try { mapRef.current.removeLayer(mapboxLayerRef.current); } catch {}
      mapboxLayerRef.current = null;
    }
  }, [coords?.lat, coords?.lng, mapLoaded, multiDevices, isPlaybackPage, isPlayback, staticDots]);

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
    setMapError(null);
    loadTPLMaps(
      () => {
        if (!containerRef.current || mapRef.current) return;
        setMapError(null);
        attachMap(
          containerRef.current,
          (map) => {
            mapRef.current = map;
            if (coordsRef.current) {
              ensureMarker(map, coordsRef.current);
              map.setView([coordsRef.current.lat, coordsRef.current.lng], 15, { animate: false });
            }
            setMapLoaded(true);
          },
          (reason) => { setMapError(reason || 'Map failed to initialise'); },
        );
      },
      (reason) => { setMapError(reason || 'Map failed to load'); },
    );
    return () => {
      if (cancelTweenRef.current) { cancelTweenRef.current(); cancelTweenRef.current = null; }
      try {
        if (popupRef.current  && _cachedMap) { popupRef.current.remove();                    popupRef.current  = null; }
        if (markerRef.current && _cachedMap) { _cachedMap.removeLayer(markerRef.current);    markerRef.current = null; }
        clearTrajectoryLayers(_cachedMap);
        clearPlaybackLayers(_cachedMap);
        staticDotsRef.current.forEach(d => { try { _cachedMap.removeLayer(d); } catch {} });
        staticDotsRef.current = [];
        fenceLayersRef.current.forEach(p => { try { _cachedMap.removeLayer(p); } catch {} });
        multiMarkersRef.current.forEach(({ marker }) => { try { _cachedMap.removeLayer(marker); } catch {} });
      } catch {}
      fenceLayersRef.current = [];
      multiMarkersRef.current.clear();
      multiGeocodeRef.current.clear();
      multiSnsRef.current  = new Set();
      pannedSnsRef.current = new Set();
      animFromRef.current  = null;
      if (mapboxLayerRef.current) {
        try { _cachedMap?.removeLayer(mapboxLayerRef.current); } catch {}
        mapboxLayerRef.current = null;
      }
      detachMap();
      mapRef.current = null;
    };
  }, [retryTick]);  // eslint-disable-line react-hooks/exhaustive-deps

  /* ── LOCK MAP INTERACTION DURING ACTIVE PLAYBACK ──────────────────────────
   * While playing, the camera is hard-locked to the marker (see the rAF
   * follow-camera step above) — letting the user drag/zoom at the same time
   * would just have the map fight them every frame. Pausing hands full
   * control back. Since the underlying Leaflet map instance is a persistent
   * singleton reused across pages/devices, the cleanup unconditionally
   * re-enables everything so navigating away mid-playback can never leave
   * some other page's map stuck locked.
   */
  useEffect(() => {
    prevIsPlayingRef.current = isPlaying;
    const map = mapRef.current;
    if (!map) return;

    const shouldLock = isPlaybackPage && isPlaying;
    const handlers = [
      map.dragging, map.touchZoom, map.doubleClickZoom,
      map.scrollWheelZoom, map.boxZoom, map.keyboard, map.tap,
    ].filter(Boolean);
    handlers.forEach(h => { try { shouldLock ? h.disable() : h.enable(); } catch {} });

    const zoomEl = map.zoomControl?.getContainer?.();
    if (zoomEl) {
      zoomEl.style.pointerEvents = shouldLock ? 'none' : '';
      zoomEl.style.opacity = shouldLock ? '0.4' : '';
    }

    return () => {
      try {
        map.dragging?.enable();
        map.touchZoom?.enable();
        map.doubleClickZoom?.enable();
        map.scrollWheelZoom?.enable();
        map.boxZoom?.enable();
        map.keyboard?.enable();
        map.tap?.enable();
        const el = map.zoomControl?.getContainer?.();
        if (el) { el.style.pointerEvents = ''; el.style.opacity = ''; }
      } catch {}
    };
  }, [isPlaying, isPlaybackPage, mapLoaded]);

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

      if (isPlaybackPage) {
        // The rAF renderer below owns marker position and panning for the
        // playback page. `coords` here is just a dummy (0,0) sentinel to
        // signal "playback active" — tweening toward it would snap the
        // marker/map to null island, so skip entirely.
        animFromRef.current = coords;
        return;
      }

      const from = animFromRef.current ?? coords;
      const to   = coords;

      const distSq = (to.lat - from.lat) ** 2 + (to.lng - from.lng) ** 2;
      if (distSq < 1e-14) {
        markerRef.current?.setLatLng([to.lat, to.lng]);
        animFromRef.current = to;
        if (isPlaybackPage) {
          try {
            markerRef.current?.setIcon(window.L.divIcon({
              html: buildPlaybackPinHtml('#E8192C', '#8B0000', 0), className: '', iconSize: [30, 48], iconAnchor: [15, 42],
            }));
          } catch {}
        }
        return;
      }

      const dist = Math.sqrt(distSq);
      const bearing = getBearing(from.lat, from.lng, to.lat, to.lng);

      // Very large jump (GPS gap / error): snap instantly so the pin doesn't
      // race across the screen.
      const SNAP_DEG = 0.006; // ≈ 600 m
      if (dist > SNAP_DEG) {
        markerRef.current?.setLatLng([to.lat, to.lng]);
        animFromRef.current = to;
        if (isPlaybackPage) {
          try {
            markerRef.current?.setIcon(window.L.divIcon({
              html: buildPlaybackPinHtml('#E8192C', '#8B0000', bearing), className: '', iconSize: [30, 48], iconAnchor: [15, 42],
            }));
          } catch {}
          try {
            map.setView([to.lat, to.lng], Math.max(map.getZoom(), 16), { animate: false });
          } catch {}
        }
        return;
      }

      // Use the full step interval for every segment so the pin is always in
      // motion — never sits still between waypoints (Google Maps-style glide).
      const tweenDuration = Math.max(playbackSpeed * 0.98, 100);

      // Switch to pulsing pin during active playback movement
      if (isPlaybackPage) {
        try {
          markerRef.current?.setIcon(window.L.divIcon({
            html: buildPlaybackPinHtml('#E8192C', '#8B0000', bearing), className: '', iconSize: [30, 48], iconAnchor: [15, 42],
          }));
        } catch {}
      }

      cancelTweenRef.current = smoothMoveTo(
        markerRef.current,
        from.lat, from.lng,
        to.lat,   to.lng,
        tweenDuration,
        null,
      );

      const timeoutId = setTimeout(() => {
        animFromRef.current = to;
        cancelTweenRef.current = null;
      }, tweenDuration);

      if (isPlaybackPage) {
        // Smart pan: Only pan if the pin approaches the viewport edge.
        try {
          const bounds = map.getBounds();
          const targetPoint = map.project([to.lat, to.lng]);
          const nw = map.project(bounds.getNorthWest());
          const se = map.project(bounds.getSouthEast());
          
          const paddingX = (se.x - nw.x) * 0.15;
          const paddingY = (se.y - nw.y) * 0.15;

          const isNearEdge = (
            targetPoint.x < nw.x + paddingX ||
            targetPoint.x > se.x - paddingX ||
            targetPoint.y < nw.y + paddingY ||
            targetPoint.y > se.y - paddingY
          );

          if (isNearEdge) {
            map.stop();
            map.panTo([to.lat, to.lng], {
              animate: true,
              duration: tweenDuration / 1000,
              easeLinearity: 0.5,
            });
          }
        } catch {}
      } else {
        const targetZoom = Math.max(map.getZoom(), 15);
        let inView = false;
        try { inView = map.getBounds().contains([to.lat, to.lng]); } catch {}
        if (!inView) {
          map.setView([to.lat, to.lng], targetZoom, { animate: true, duration: 0.5 });
        }
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
        radius: 4, color: '#7f1d1d', fillColor: '#dc2626',
        fillOpacity: 0.9, weight: 1,
        interactive: false,
        renderer: canvasRef.current,
      }).addTo(map);

      dotsRef.current.push(dot);
    });

    trajLenRef.current = items.length;
  }, [trajectory, mapLoaded, showLine, isPlayback, isPlaybackPage, clearTrajectoryLayers]);

  /* ── PLAYBACK-PAGE TRAJECTORY RENDERER ──────────────────────────────────
   *
   * No glide/tween — the marker jumps straight to each raw GPS point as
   * playback reveals it (same pacing the sidebar uses for its visited
   * list), instead of continuously interpolating a position along the
   * route. `tick` still advances `currentDistance` smoothly every frame
   * (that drives the progress bar/slider), but the pin itself only moves
   * when that distance crosses into the next real waypoint.
   */
  useEffect(() => {
    if (!isPlaybackPage) return;

    const map = mapRef.current;
    if (!map || !window.L) return;

    if (!isPlayback) {
      clearPlaybackLayers(map);
      return;
    }

    if (!pbCanvasRef.current) pbCanvasRef.current = window.L.canvas({ padding: 0.5 });

    const renderLabel = (geo, point) => {
      const loc = geo?.primary
        ? (geo.isSpecific ? geo.primary : `Near ${geo.primary}`)
        : 'No landmark';
      return `<div class="pb-map-label"><div class="pb-map-label-loc">${loc}</div><div class="pb-map-label-ts">${formatTimestamp(point)}</div></div>`;
    };

    const updateMainTooltip = (point) => {
      const marker = markerRef.current;
      if (!marker) return;
      const geo = peekGeocode(point);
      if (!marker.getTooltip()) {
        marker.bindTooltip(renderLabel(geo, point), {
          permanent: true, direction: 'top', offset: [0, -40],
          className: 'pb-map-label-tip pb-map-label-tip-main', opacity: 1,
        });
      } else {
        marker.setTooltipContent(renderLabel(geo, point));
      }
      if (geo) return;
      const c = extractCoords(point);
      if (!c) return;
      const key = `${c.lat.toFixed(5)},${c.lng.toFixed(5)}`;
      if (pbLastGeoKeyRef.current === key) return;
      pbLastGeoKeyRef.current = key;
      resolveGeocode(point, getGeocode).then((resolved) => {
        try { marker.setTooltipContent(renderLabel(resolved, point)); } catch {}
      });
    };

    let rafId;
    let lastTime = performance.now();

    const loop = (now) => {
      rafId = requestAnimationFrame(loop);

      const deltaMs = now - lastTime;
      lastTime = now;

      const state = usePlaybackStore.getState();
      const { rawPoints, cumulativeDistances, currentDistance } = state;
      if (rawPoints.length === 0) return;

      if (state.isPlaying) {
        state.tick(deltaMs);
      }

      // Which raw point is currently "active" — binary search since
      // cumulativeDistances is monotonically non-decreasing (matches the
      // sidebar's own visitedIdx calculation, so pin and log stay in sync).
      let lo = 0, hi = cumulativeDistances.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (cumulativeDistances[mid] <= currentDistance) lo = mid + 1;
        else hi = mid;
      }
      const idx = Math.max(0, Math.min(lo - 1, rawPoints.length - 1));

      if (idx === pbLastIdxRef.current) return;
      pbLastIdxRef.current = idx;

      const point = rawPoints[idx];
      const c = extractCoords(point);
      if (!c) return;

      if (markerRef.current) {
        markerRef.current.setLatLng([c.lat, c.lng]);
      }
      updateMainTooltip(point);

      // Snap the camera straight to the new point — no pan/zoom animation,
      // matching the pin's own instant jump. Only while actively playing;
      // paused/scrubbing leaves the camera under manual control (map
      // dragging/zoom are also only locked while playing, see below).
      if (state.isPlaying) {
        try {
          if (map.getZoom() !== PLAYBACK_ZOOM) {
            map.setZoom(PLAYBACK_ZOOM, { animate: false });
          }
          map.setView([c.lat, c.lng], PLAYBACK_ZOOM, { animate: false });
        } catch (e) {}
      }
    };

    rafId = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(rafId);
  }, [isPlaybackPage, mapLoaded, isPlayback, clearPlaybackLayers, getGeocode]);

  /* ── STATIC PREVIEW DOTS (playback page — full trajectory's stops shown immediately, no line) ── */
  useEffect(() => {
    if (!isPlaybackPage) return;
    const map = mapRef.current;
    if (!map || !window.L) return;

    staticDotsRef.current.forEach(d => { try { map.removeLayer(d); } catch {} });
    staticDotsRef.current = [];

    const rawItems = (staticDots ?? [])
      .map(p => { const c = extractCoords(p); return c ? { c, p } : null; })
      .filter(Boolean);

    if (rawItems.length === 0) return;

    const latLngs = rawItems.map(({ c }) => [c.lat, c.lng]);

    // Group points near the same landmark (or within a few meters as a
    // fallback) and within a short time gap into a single "stop" — a
    // stationary/idling device pinging the same place repeatedly would
    // otherwise stack indistinguishable pins and crossing line segments on
    // top of each other. Shared with the visit-log sidebar so both render
    // identical groupings for the same trajectory.
    const groups = clusterStops(rawItems.map(({ p }) => p));

    const smallPinIcon = window.L.divIcon({
      html: buildSmallPinHtml(),
      className: '',
      iconSize: [14, 22],
      iconAnchor: [7, 22],
    });

    // Every pin gets a permanent on-map label showing its landmark +
    // timestamp (or, for a multi-point stop, its duration) — the same
    // content the sidebar's visit-log row shows for that point/group, so
    // the map and sidebar always read the same at a glance.
    const labelFor = (geo, group, isStop, nextGroup) => {
      const loc = geo?.primary
        ? (geo.isSpecific ? geo.primary : `Near ${geo.primary}`)
        : 'No landmark';
      const sub = isStop
        ? `<span class="pb-map-label-stop">STOP</span> ${nextGroup ? formatStopDuration(stopDurationMs(group, nextGroup)) : 'Ongoing'}`
        : formatTimestamp(group.points[0]);
      return `<div class="pb-map-label"><div class="pb-map-label-loc">${loc}</div><div class="pb-map-label-ts">${sub}</div></div>`;
    };

    groups.forEach((group, i) => {
      const nextGroup = groups[i + 1];
      const { coords: c } = group;
      const isStop = group.points.length > 1;
      const icon = isStop
        ? window.L.divIcon({ html: buildActualStopSignHtml(), className: '', iconSize: [24, 24], iconAnchor: [12, 12] })
        : smallPinIcon;

      const dot = window.L.marker([c.lat, c.lng], {
        icon,
        interactive: false,
        keyboard: false,
      }).addTo(map);

      const geoPoint = { ...group.points[0], landmark: group.landmark ?? group.points[0]?.landmark };
      const geo = peekGeocode(geoPoint);
      dot.bindTooltip(labelFor(geo, group, isStop, nextGroup), {
        permanent: true, direction: 'top', offset: [0, isStop ? -14 : -20],
        className: 'pb-map-label-tip', opacity: 1,
      });

      if (!geo) {
        resolveGeocode(geoPoint, getGeocode).then((resolved) => {
          try { dot.setTooltipContent(labelFor(resolved, group, isStop, nextGroup)); } catch {}
        });
      }

      staticDotsRef.current.push(dot);
    });

    // Force Leaflet to re-measure the container before fitting/centering.
    // The persistent map instance gets detached/reattached across page and
    // device switches (see attachMap/detachMap above), and the ResizeObserver
    // that normally keeps `_size` in sync fires asynchronously — so on first
    // load right after a switch, fitBounds below can still be computing
    // against a stale container size, producing a pan/zoom that's off until
    // the user manually zooms (which forces Leaflet to fully re-project
    // against the container's actual current size).
    try { map.invalidateSize({ animate: false, pan: false }); } catch {}

    // Fit map to show all points on load
    if (latLngs.length > 1) {
      try {
        const bounds = window.L.latLngBounds(latLngs);
        if (bounds.isValid()) map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
      } catch {}
    } else if (latLngs.length === 1) {
      try { map.setView(latLngs[0], Math.max(map.getZoom(), 15)); } catch {}
    }

  }, [staticDots, mapLoaded, isPlaybackPage, getGeocode]);

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

    multiDevices.forEach(({ sn, label: devLabel, latest: point, color }) => {
      const c = extractCoords(point);
      if (!c) return;

      if (multiMarkersRef.current.has(sn)) {
        const entry = multiMarkersRef.current.get(sn);
        entry.marker.setLatLng([c.lat, c.lng]);
        entry.pointHolder.current = point;
      } else {
        const icon = window.L.divIcon({
          html: buildPinIconHtml(color),
          className: '', iconSize: [30, 48], iconAnchor: [15, 42],
        });
        const marker      = window.L.marker([c.lat, c.lng], { icon }).addTo(map);
        const pointHolder = { current: point };

        marker.on('click', () => {
          if (onFocusRef.current) onFocusRef.current(sn);
        });

        multiMarkersRef.current.set(sn, { marker, pointHolder });
      }
    });

    if (selectionChanged) {
      // Drop SNs that are no longer selected so they re-pan if re-added
      pannedSnsRef.current = new Set(
        [...pannedSnsRef.current].filter(sn => incomingSns.has(sn))
      );
    }

    const validCoords = multiDevices
      .map(d => extractCoords(d.latest))
      .filter(Boolean);

    // Pan exactly once per device per selection — when its first location arrives.
    const hasNewLocation = multiDevices.some(
      d => extractCoords(d.latest) && !pannedSnsRef.current.has(d.sn)
    );

    if (hasNewLocation) {
      multiDevices.forEach(d => {
        if (extractCoords(d.latest)) pannedSnsRef.current.add(d.sn);
      });
      if (validCoords.length === 1) {
        map.setView(
          [validCoords[0].lat, validCoords[0].lng],
          Math.max(map.getZoom(), 15),
          { animate: true, duration: 0.5 }
        );
      } else if (validCoords.length > 1) {
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

      {mapError && (
        <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.82)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1200, padding:24 }}>
          <div style={{ maxWidth:380, textAlign:'center', background:'rgba(0,0,0,0.92)', backdropFilter:'blur(10px)', border:'1px solid #3a1414', borderRadius:14, padding:'26px 30px', boxShadow:'0 8px 30px rgba(0,0,0,0.6)' }}>
            <div style={{ width:46, height:46, margin:'0 auto 12px', display:'grid', placeItems:'center', borderRadius:'50%', background:'rgba(220,38,38,0.12)', border:'1px solid rgba(220,38,38,0.35)' }}>
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <div style={{ color:'#fff', fontSize:15, fontWeight:700, marginBottom:6 }}>Map unavailable</div>
            <div style={{ color:'#a3a3a3', fontSize:13, lineHeight:1.5 }}>
              Couldn’t reach the TPL Maps service. Check your network/VPN connection to <span style={{ fontFamily:"'JetBrains Mono', monospace", color:'#d1d1d1' }}>api.tplmaps.com</span> and try again.
            </div>
            <button
              onClick={() => { setMapError(null); setMapLoaded(false); setRetryTick(t => t + 1); }}
              style={{ marginTop:16, padding:'8px 18px', borderRadius:8, border:'1px solid rgba(255,255,255,0.18)', background:'#A72C32', color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer' }}
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {!sn && multiDevices.length === 0 && (
        <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, pointerEvents:'none' }}>
          <div style={{ background:'rgba(0,0,0,0.9)', backdropFilter:'blur(10px)', border:'1px solid #1f1f1f', borderRadius:14, padding:'24px 36px', boxShadow:'0 8px 30px rgba(0,0,0,0.6)', textAlign:'center' }}>
            <div style={{ fontSize:32, marginBottom:8, opacity:0.5 }}>📍</div>
            <div style={{ color:'#a3a3a3', fontSize:14, fontWeight:600 }}>Select a device from the sidebar</div>
          </div>
        </div>
      )}

      {sn && !coords && (
        <div style={{ position:'absolute', top:0, left:0, right:0, height:3, zIndex:1000, overflow:'hidden', pointerEvents:'none' }}>
          <style>{`@keyframes mv-shimmer{0%{transform:translateX(-100%)}100%{transform:translateX(200%)}}`}</style>
          <div style={{ position:'absolute', inset:0, background:'rgba(167,44,50,0.25)' }} />
          <div style={{ position:'absolute', top:0, bottom:0, width:'50%', background:'linear-gradient(90deg,transparent,#A72C32,transparent)', animation:'mv-shimmer 1.4s ease-in-out infinite' }} />
        </div>
      )}

      <div ref={containerRef} style={{ position:'absolute', inset:0 }} />
    </div>
  );
}