// src/pages/FencePage.jsx
import React, { useState, useEffect, useRef, useCallback, Component } from 'react';
import loadTPLMaps from '../components/loadTPLMaps.js';
import { useDeviceCache } from '../context/DeviceCacheContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { createPolygonManager } from '../utils/zonePolygonManager.js';
import { tplGeocode } from '../utils/tplGeocode.js';
import ZoneSidebar from '../components/ZoneSidebar.jsx';
import './FencePage.css';

// ─── Constants ────────────────────────────────────────────────────────────────
const API_BASE_URL = import.meta.env.DEV
  ? ''
  : (import.meta.env.VITE_API_BASE_URL || '');

const TIME_SHORTCUTS = [
  { label: '1H',  hours: 1   },
  { label: '3H',  hours: 3   },
  { label: '6H',  hours: 6   },
  { label: '1D',  hours: 24  },
  { label: '7D',  hours: 168 },
];

// ─── Date helpers ─────────────────────────────────────────────────────────────
function _dateStr(d)  { return d.toISOString().split('T')[0]; }
function _timeStr(d)  { return d.toTimeString().slice(0, 5); }

function _rangeFromHours(hours) {
  const end   = new Date();
  const start = new Date(end.getTime() - hours * 3_600_000);
  return { start, end };
}

// ─── API ──────────────────────────────────────────────────────────────────────
async function fetchZones(sn, accessToken, startDt, endDt) {
  const headers = { 'Content-Type': 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const params = new URLSearchParams({
    start: startDt.toISOString(),
    end:   endDt.toISOString(),
  });

  const res = await fetch(
    `${API_BASE_URL}/api/devices/${encodeURIComponent(sn)}/zones?${params}`,
    { headers },
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let message = text;
    try { const j = JSON.parse(text); message = j?.detail || j?.error || text; } catch {}
    throw new Error(message || `Failed to load zones (${res.status})`);
  }

  return res.json();
}

async function geocodeZoneNames(zones) {
  return Promise.all(
    zones.map(async (zone, idx) => {
      try {
        // Zones get a GENERIC name — the neighbourhood / road / city the
        // centre sits in, NOT the nearest landmark (POI) at those coords.
        // Priority: area (Gulshan-e-Iqbal, Korangi) → road (University Road)
        // → city (Karachi) → fallback.
        const geo  = await tplGeocode(zone.center.lat, zone.center.lng);
        const name =
          geo?.area     ||
          geo?.roadOnly ||
          geo?.city     ||
          zone.name     ||
          `Zone ${idx + 1}`;
        return { ...zone, name };
      } catch {
        return { ...zone, name: zone.name || `Zone ${idx + 1}` };
      }
    }),
  );
}

// ─── Error Boundary ───────────────────────────────────────────────────────────
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e) { return { error: e }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, fontFamily: 'monospace', background: '#111', color: '#dc2626' }}>
          <h2 style={{ marginBottom: 12 }}>FencePage crashed</h2>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: '#f1f5f9' }}>
            {this.state.error?.message}{'\n\n'}{this.state.error?.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Map overlays ─────────────────────────────────────────────────────────────
function EmptyMapOverlay() {
  return (
    <div className="fp-map-overlay">
      <div className="fp-map-overlay-box">
        <div style={{ fontSize: 32, marginBottom: 4, opacity: 0.35 }}>📍</div>
        <p className="fp-map-overlay-title">Select a device to view its activity zones</p>
      </div>
    </div>
  );
}

function NoZonesOverlay() {
  return (
    <div className="fp-map-overlay" style={{ pointerEvents: 'none' }}>
      <div className="fp-map-overlay-box">
        <div style={{ fontSize: 28, marginBottom: 4, opacity: 0.3 }}>🗺️</div>
        <p className="fp-map-overlay-title">No zones found for this range</p>
      </div>
    </div>
  );
}

// ─── SVG icons (kept inline to avoid extra imports) ───────────────────────────
const CalIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd"/>
  </svg>
);

const ClkIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd"/>
  </svg>
);

// ─── Main page ────────────────────────────────────────────────────────────────
function FencePageInner() {
  const { devices }     = useDeviceCache();
  const { accessToken } = useAuth();

  // ── Map refs (never in state) ───────────────────────────────────────────────
  const mapRef           = useRef(null);
  const mapContainerRef  = useRef(null);
  const polygonManager   = useRef(null);
  const resizeObserver   = useRef(null);
  const loadCtxRef       = useRef(null);   // cancellation token for in-flight loads

  // ── UI state ────────────────────────────────────────────────────────────────
  const [mapReady,        setMapReady]        = useState(false);
  const [selectedSn,      setSelectedSn]      = useState('');
  const [zones,           setZones]           = useState([]);
  const [selectedZoneId,  setSelectedZoneId]  = useState(null);
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState('');
  const [activeShortcut,  setActiveShortcut]  = useState('7D');

  // ── Date range state (initialised to last 7 days) ───────────────────────────
  const _init7d = _rangeFromHours(168);
  const [startDate, setStartDate] = useState(() => _dateStr(_init7d.start));
  const [startTime, setStartTime] = useState("00:00");
  const [endDate,   setEndDate]   = useState(() => _dateStr(_init7d.end));
  const [endTime,   setEndTime]   = useState("23:59");

  // ── Map initialisation ──────────────────────────────────────────────────────
  useEffect(() => {
    loadTPLMaps(() => {
      if (mapRef.current) { setMapReady(true); return; }

      const map = window.TPLMaps.map.initMap({
        divID:           'fence-map',
        lat:             30.3753,
        lng:             69.3451,
        zoom:            6,
        showZoomControl: true,
      });

      // Ensure scroll-wheel zoom is enabled
      map.scrollWheelZoom?.enable();

      mapRef.current         = map;
      polygonManager.current = createPolygonManager(map);

      requestAnimationFrame(() => { map.invalidateSize?.(); });

      if (mapContainerRef.current) {
        resizeObserver.current = new ResizeObserver(() => {
          requestAnimationFrame(() => { mapRef.current?.invalidateSize?.(); });
        });
        resizeObserver.current.observe(mapContainerRef.current);
      }

      setMapReady(true);
      console.log('[FencePage] map initialised');
    });

    return () => {
      if (loadCtxRef.current) loadCtxRef.current.cancelled = true;
      resizeObserver.current?.disconnect();
      polygonManager.current?.clearAll();
      mapRef.current?.remove?.();
      mapRef.current         = null;
      polygonManager.current = null;
      console.log('[FencePage] map destroyed');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Core load function ──────────────────────────────────────────────────────
  const triggerZoneLoad = useCallback((startDt, endDt) => {
    if (!mapRef.current || !polygonManager.current) return;

    // Cancel any previous in-flight request
    if (loadCtxRef.current) loadCtxRef.current.cancelled = true;
    const ctx = { cancelled: false };
    loadCtxRef.current = ctx;

    setLoading(true);
    setError('');
    setZones([]);
    setSelectedZoneId(null);
    polygonManager.current.clearAll();

    fetchZones(selectedSnRef.current, accessToken, startDt, endDt)
      .then((data) => {
        if (ctx.cancelled) return;
        // Backend returns unnamed zones — give each a provisional "Zone N"
        // label so the sidebar renders immediately while TPLMaps geocodes.
        const rawZones = (data.zones ?? []).map((z, i) => ({
          ...z,
          name: z.name || `Zone ${i + 1}`,
        }));
        setZones(rawZones);
        polygonManager.current?.renderZones(rawZones, {
          onZoneClick:    (id) => setSelectedZoneId(id),
          onZoneHover:    () => {},
          onZoneHoverOut: () => {},
        });
        if (rawZones.length > 0) {
          geocodeZoneNames(rawZones).then((named) => {
            if (!ctx.cancelled) setZones(named);
          });
        }
      })
      .catch((err) => {
        if (!ctx.cancelled) setError(err.message || 'Failed to load zones');
      })
      .finally(() => {
        if (!ctx.cancelled) setLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  // Keep a stable ref to selectedSn so triggerZoneLoad (memoised) can read it
  const selectedSnRef = useRef(selectedSn);
  useEffect(() => { selectedSnRef.current = selectedSn; }, [selectedSn]);

  // ── Auto-load when device changes ──────────────────────────────────────────
  useEffect(() => {
    if (!mapReady) return;
    if (!selectedSn) {
      if (loadCtxRef.current) loadCtxRef.current.cancelled = true;
      polygonManager.current?.clearAll();
      setZones([]);
      setSelectedZoneId(null);
      setError('');
      return;
    }
    const start = new Date(`${startDate}T${startTime}:00`);
    const end   = new Date(`${endDate}T${endTime}:59`);
    triggerZoneLoad(start, end);
  // Only re-trigger on device change — date changes use the Load button
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSn, mapReady]);

  // ── Sync zone selection → highlight + pan ──────────────────────────────────
  useEffect(() => {
    if (!mapReady || !polygonManager.current) return;
    polygonManager.current.selectZone(selectedZoneId);
  }, [selectedZoneId, mapReady]);

  // ── Shortcut handler ────────────────────────────────────────────────────────
  function handleShortcut(shortcut) {
    if (!selectedSn) { setError('Select a device first'); return; }
    const { start, end } = _rangeFromHours(shortcut.hours);
    setStartDate(_dateStr(start));
    setStartTime(_timeStr(start));
    setEndDate(_dateStr(end));
    setEndTime(_timeStr(end));
    setActiveShortcut(shortcut.label);
    triggerZoneLoad(start, end);
  }

  // ── Manual load button ──────────────────────────────────────────────────────
  function handleLoad() {
    if (!selectedSn) { setError('Select a device first'); return; }
    const start = new Date(`${startDate}T${startTime}:00`);
    const end   = new Date(`${endDate}T${endTime}:59`);
    if (isNaN(start) || isNaN(end)) { setError('Invalid date range'); return; }
    if (start >= end)                { setError('Start must be before end'); return; }
    setActiveShortcut(null);
    triggerZoneLoad(start, end);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="fp-page">

      {/* ── Top bar ── */}
      <div className="fp-topbar">
        <div className="fp-topbar-left">
          <span className="fp-topbar-label">Geofencing</span>
          {selectedSn && zones.length > 0 && !loading && (
            <span className="fp-topbar-area">
              <svg width="11" height="11" viewBox="0 0 24 24"
                   fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/>
                <circle cx="12" cy="10" r="1" fill="currentColor"/>
              </svg>
              {zones.length} zone{zones.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        <div className="fp-topbar-right">

          {/* Device selector */}
          <select
            className="fp-device-select"
            value={selectedSn}
            onChange={(e) => setSelectedSn(e.target.value)}
          >
            <option value="">Select a device…</option>
            {devices.map((d) => (
              <option key={d.sn} value={d.sn}>
                {d.assigned_user_name || d.assignedUser || d.sn}
              </option>
            ))}
          </select>

          {/* Time shortcuts */}
          <div className="fp-shortcuts">
            {TIME_SHORTCUTS.map((s) => (
              <button
                key={s.label}
                className={`fp-shortcut-btn${activeShortcut === s.label ? ' active' : ''}`}
                onClick={() => handleShortcut(s)}
                disabled={loading}
              >
                {activeShortcut === s.label && loading
                  ? <span className="fp-spinner" />
                  : s.label}
              </button>
            ))}
          </div>

          {/* Start date + time */}
          <div className="fp-date-group">
            <label>Start</label>
            <div className="fp-date-btn"
                 onClick={(e) => e.currentTarget.querySelector('input[type=date]').showPicker()}>
              <CalIcon />
              <span>{startDate}</span>
              <input type="date" value={startDate}
                     onChange={(e) => { setStartDate(e.target.value); setActiveShortcut(null); }} />
            </div>
            <div className="fp-date-btn"
                 onClick={(e) => e.currentTarget.querySelector('input[type=time]').showPicker()}>
              <ClkIcon />
              <span>{startTime}</span>
              <input type="time" value={startTime}
                     onChange={(e) => { setStartTime(e.target.value); setActiveShortcut(null); }} />
            </div>
          </div>

          {/* End date + time */}
          <div className="fp-date-group">
            <label>End</label>
            <div className="fp-date-btn"
                 onClick={(e) => e.currentTarget.querySelector('input[type=date]').showPicker()}>
              <CalIcon />
              <span>{endDate}</span>
              <input type="date" value={endDate}
                     onChange={(e) => { setEndDate(e.target.value); setActiveShortcut(null); }} />
            </div>
            <div className="fp-date-btn"
                 onClick={(e) => e.currentTarget.querySelector('input[type=time]').showPicker()}>
              <ClkIcon />
              <span>{endTime}</span>
              <input type="time" value={endTime}
                     onChange={(e) => { setEndTime(e.target.value); setActiveShortcut(null); }} />
            </div>
          </div>

          {/* Load button */}
          <button
            className="fp-btn-load"
            onClick={handleLoad}
            disabled={!selectedSn || loading}
          >
            {loading
              ? <><span className="fp-spinner" /> Loading…</>
              : 'Load Zones'}
          </button>

        </div>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className="fp-error">
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
          </svg>
          {error}
          <button className="fp-error-close" onClick={() => setError('')}>✕</button>
        </div>
      )}

      {/* ── Body ── */}
      <div className="fp-body">

        <ZoneSidebar
          zones={zones}
          selectedZoneId={selectedZoneId}
          onSelect={setSelectedZoneId}
          loading={loading}
        />

        <div className="fp-map-wrap">
          <div ref={mapContainerRef} id="fence-map"
               style={{ position: 'absolute', inset: 0 }} />
          {!selectedSn && <EmptyMapOverlay />}
          {selectedSn && !loading && zones.length === 0 && !error && <NoZonesOverlay />}
        </div>

      </div>
    </div>
  );
}

export default function FencePage() {
  return <ErrorBoundary><FencePageInner /></ErrorBoundary>;
}
