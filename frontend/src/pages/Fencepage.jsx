// src/pages/FencePage.jsx
import React, { useState, useEffect, useRef, useCallback, Component } from 'react';
import loadTPLMaps from '../components/loadTPLMaps.js';
import { useDeviceCache } from '../context/DeviceCacheContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useZoneCache } from '../context/ZoneCacheContext.jsx';
import { createPolygonManager, pointInPolygon, pointInMultiPolygon } from '../utils/zonePolygonManager.js';
import ZoneSidebar from '../components/ZoneSidebar.jsx';
import AssignDeviceModal from '../components/AssignDeviceModal.jsx';
import TPLLoader from '../components/TPLLoader.jsx';
import './FencePage.css';

const API_BASE_URL = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_BASE_URL || '');

// ─── Error Boundary ───────────────────────────────────────────────────────────
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e) { return { error: e }; }
  render() {
    if (this.state.error) return (
      <div style={{ padding: 32, fontFamily: 'monospace', background: '#111', color: '#dc2626' }}>
        <h2 style={{ marginBottom: 12 }}>FencePage crashed</h2>
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: '#f1f5f9' }}>
          {this.state.error?.message}{'\n\n'}{this.state.error?.stack}
        </pre>
      </div>
    );
    return this.props.children;
  }
}

// ─── Main page ────────────────────────────────────────────────────────────────
function FencePageInner() {
  const { devices, refresh } = useDeviceCache();
  const { accessToken, isAdmin } = useAuth();
  const { zones } = useZoneCache();

  const mapRef             = useRef(null);
  const mapContainerRef    = useRef(null);
  const mapWrapRef         = useRef(null);
  const polygonManager     = useRef(null);
  const resizeObserver     = useRef(null);
  const tracksFetchZoneRef = useRef(null);
  const zoneStatusesRef    = useRef({});
  const accessTokenRef     = useRef(accessToken);
  const devicesRef         = useRef(devices);

  const [mapReady,        setMapReady]        = useState(false);
  const [selectedZoneId,  setSelectedZoneId]  = useState(null);
  const [assignments,     setAssignments]     = useState({});
  const [zoneStatuses,    setZoneStatuses]    = useState({});
  const [statusLoading,   setStatusLoading]   = useState(false);
  const [assignModal,     setAssignModal]     = useState(null);
  const [assigningZoneId, setAssigningZoneId] = useState(null);
  const [deviceTracks,    setDeviceTracks]    = useState([]);
  const [tracksLoading,   setTracksLoading]   = useState(false);
  const [tracksFetchKey,  setTracksFetchKey]  = useState(0);

  // Keep refs in sync
  useEffect(() => { accessTokenRef.current = accessToken; }, [accessToken]);
  useEffect(() => { devicesRef.current = devices; }, [devices]);
  useEffect(() => { zoneStatusesRef.current = zoneStatuses; }, [zoneStatuses]);

  // Stable auth headers
  const authHeaders = useCallback(() => ({
    'Content-Type': 'application/json',
    ...(accessTokenRef.current ? { Authorization: `Bearer ${accessTokenRef.current}` } : {}),
  }), []);

  // ── Map init ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const cancelLoad = loadTPLMaps(() => {
      // Guard: component may have unmounted while SDK was loading
      if (!document.getElementById('fence-map')) return;
      if (mapRef.current) { setMapReady(true); return; }
      const map = window.TPLMaps.map.initMap({
        divID: 'fence-map', lat: 31.5135, lng: 74.3170, zoom: 15, showZoomControl: true,
      });
      map.scrollWheelZoom?.enable();
      mapRef.current         = map;
      polygonManager.current = createPolygonManager(map);
      requestAnimationFrame(() => map.invalidateSize?.());
      if (mapContainerRef.current) {
        resizeObserver.current = new ResizeObserver(() =>
          requestAnimationFrame(() => mapRef.current?.invalidateSize?.())
        );
        resizeObserver.current.observe(mapContainerRef.current);
      }
      setMapReady(true);
    });
    return () => {
      cancelLoad();
      resizeObserver.current?.disconnect();
      polygonManager.current?.clearAll();
      mapRef.current?.remove?.();
      mapRef.current = null;
      polygonManager.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render KML polygons — re-renders when zones update (e.g. after geocoding) ──
  useEffect(() => {
    if (!mapReady || !polygonManager.current || !zones.length) return;
    polygonManager.current.renderZones(zones, {
      onZoneClick: (id) => setSelectedZoneId(id),
      onZoneHover: () => {},
      onZoneHoverOut: () => {},
    });
  }, [mapReady, zones]);

  // ── Derive assignments from device cache ──────────────────────────────────────
  useEffect(() => {
    const map = {};
    devices.forEach((d) => {
      // Skip devices with no valid SN — they can't be assigned via the API and
      // would cause a 404 "not found" if sn were passed as undefined/null.
      if (!d.sn || String(d.sn).trim() === '' || String(d.sn) === 'undefined') return;
      const deviceZones = d.fence_zone_ids?.length ? d.fence_zone_ids : (d.zone ? [d.zone] : []);
      deviceZones.forEach((zid) => {
        if (!map[zid]) map[zid] = [];
        map[zid].push({ sn: d.sn, user_name: d.assigned_user_name || d.assignedUser || d.sn });
      });
    });
    setAssignments(map);
  }, [devices]);

  // ── Fetch geofence statuses ───────────────────────────────────────────────────
  const fetchStatuses = useCallback(async () => {
    setStatusLoading(true);
    try {
      const controller = new AbortController();
      const timeoutId  = setTimeout(() => controller.abort(), 30_000);
      let res;
      try {
        res = await fetch(`${API_BASE_URL}/api/geofence/status`, {
          headers: authHeaders(),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }
      if (!res.ok) return;
      const { zones: zoneData = {} } = await res.json();
      const enriched = {};
      Object.entries(zoneData).forEach(([zone_id, entries]) => {
        enriched[zone_id] = entries.map((e) => {
          const dev = devicesRef.current.find((d) => d.sn === e.sn);
          return { ...e, user_name: dev?.assigned_user_name || dev?.assignedUser || e.sn };
        });
      });
      setZoneStatuses(enriched);
    } catch { /* keep previous statuses on error/timeout */ }
    finally {
      setStatusLoading(false);
      setAssigningZoneId(null);
    }
  }, [authHeaders]);

  useEffect(() => {
    if (accessToken) fetchStatuses();
  }, [accessToken]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Zone selection → map highlight ────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !polygonManager.current) return;
    polygonManager.current.selectZone(selectedZoneId);
  }, [selectedZoneId, mapReady]);

  // ── Fetch + render device GPS tracks ─────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !polygonManager.current) return;

    polygonManager.current.clearDeviceDots();
    setDeviceTracks([]);

    if (!selectedZoneId || !accessToken) return;

    const selectedZone = zones.find((z) => z.zone_id === selectedZoneId);
    if (!selectedZone?.polygon && !selectedZone?.polygons?.length) return;

    const end   = new Date();
    const start = new Date(end - 30 * 24 * 60 * 60 * 1000);
    const url   = `${API_BASE_URL}/api/geofence/tracks/${encodeURIComponent(selectedZoneId)}` +
                  `?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`;

    const fetchTag = selectedZoneId;
    tracksFetchZoneRef.current = fetchTag;
    setTracksLoading(true);

    fetch(url, { headers: authHeaders() })
      .then(async (res) => {
        if (!res.ok) { setTracksLoading(false); return; }

        const data = await res.json();
        if (tracksFetchZoneRef.current !== fetchTag) { setTracksLoading(false); return; }

        const statusMap = zoneStatusesRef.current[selectedZoneId] || [];
        const isInZone  = selectedZone.polygons
          ? (lat, lng) => pointInMultiPolygon(lat, lng, selectedZone.polygons)
          : (lat, lng) => pointInPolygon(lat, lng, selectedZone.polygon);

        const tracks = (data.devices || []).map((dev) => {
          const user_name     = statusMap.find((e) => e.sn === dev.sn)?.user_name ?? dev.sn;
          const allPoints     = (dev.points || []).map(p => ({ lat: p.lat, lng: p.lng, timestamp: p.timestamp ?? null }));
          const insidePoints  = allPoints.filter(p => isInZone(p.lat, p.lng));
          const outsidePoints = allPoints.filter(p => !isInZone(p.lat, p.lng));
          return {
            sn: dev.sn, user_name, insidePoints, outsidePoints,
            firstSeen: insidePoints[0]?.timestamp ?? null,
            lastSeen:  insidePoints.at(-1)?.timestamp ?? null,
          };
        });

        setDeviceTracks(tracks);
        polygonManager.current?.renderDeviceDots(tracks);
        setTracksLoading(false);
      })
      .catch(() => setTracksLoading(false));

    return () => { if (tracksFetchZoneRef.current === fetchTag) tracksFetchZoneRef.current = null; };
  }, [selectedZoneId, mapReady, accessToken, zones, authHeaders, tracksFetchKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Assign device ─────────────────────────────────────────────────────────────
  async function handleAssign(zone_id, sn) {
    console.log('[FencePage] handleAssign zone_id=%s sn=%s', zone_id, sn);

    // Guard: sn must be a non-empty string — if it's undefined/null the API will
    // return 404 "not found" because the path becomes /api/admin/devices/undefined.
    if (!sn || String(sn).trim() === '' || String(sn) === 'undefined') {
      const msg = 'Cannot assign device: device serial number (SN) is missing or invalid.';
      console.error('[FencePage]', msg, { zone_id, sn });
      setAssigningZoneId(null);
      throw new Error(msg);
    }

    setAssigningZoneId(zone_id);
    try {
      const url = `${API_BASE_URL}/api/devices/${encodeURIComponent(String(sn).trim())}`;
      const body = JSON.stringify({ add_zone: zone_id });
      console.log('[FencePage] PUT', url, body);
      const res = await fetch(url, { method: 'PUT', headers: authHeaders(), body });
      console.log('[FencePage] response status:', res.status);
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        console.error('[FencePage] assign error:', errBody);
        throw new Error(errBody?.detail || `Assignment failed (HTTP ${res.status})`);
      }
      setAssignModal(null); // close modal only after success
      await refresh();
      fetchStatuses();
      setTracksFetchKey((k) => k + 1); // re-fetch tracks so new device's points appear
    } catch (err) {
      console.error('[FencePage] handleAssign caught:', err);
      setAssigningZoneId(null);
      throw err; // modal's handleConfirm catches this and shows the error message
    }
  }

  // ── Unassign device ───────────────────────────────────────────────────────────
  async function handleUnassign(sn, zone_id) {
    setZoneStatuses((prev) => ({ ...prev, [zone_id]: (prev[zone_id] || []).filter((e) => e.sn !== sn) }));
    setAssignments((prev) => ({ ...prev, [zone_id]: (prev[zone_id] || []).filter((e) => e.sn !== sn) }));
    setDeviceTracks((prev) => {
      const next = prev.filter((t) => t.sn !== sn);
      polygonManager.current?.renderDeviceDots(next);
      return next;
    });
    fetch(
      `${API_BASE_URL}/api/devices/${encodeURIComponent(sn)}`,
      { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ remove_zone: zone_id }) },
    ).catch(() => refresh());
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="fp-page">

      {/* Top bar */}
      <div className="fp-topbar">
        <div className="fp-topbar-left">
          <span className="fp-topbar-label">Geofencing</span>
          <span className="fp-topbar-area">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/>
              <circle cx="12" cy="10" r="1" fill="currentColor"/>
            </svg>
            UC 216 — Muslim Town &nbsp;·&nbsp; 1 zone
          </span>
        </div>
        <div className="fp-topbar-right">
<button onClick={fetchStatuses} disabled={statusLoading} className="fp-btn-load" style={{ fontSize: 11 }}>
            {statusLoading ? <><span className="fp-spinner" /> Refreshing…</> : '↻ Refresh Status'}
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="fp-body">
        <ZoneSidebar
          zones={zones}
          selectedZoneId={selectedZoneId}
          onSelect={setSelectedZoneId}
          zoneStatuses={zoneStatuses}
          statusLoading={statusLoading}
          assignments={assignments}
          onOpenAssign={isAdmin ? (zone) => setAssignModal({ zone }) : null}
          onUnassign={isAdmin ? handleUnassign : null}
          assigningZoneId={assigningZoneId}
          deviceTracks={deviceTracks}
          tracksLoading={tracksLoading}
        />
        <div className="fp-map-wrap" ref={mapWrapRef}>
          <div ref={mapContainerRef} id="fence-map" style={{ position: 'absolute', inset: 0 }} />
          {/* GPS tracks loading overlay — absolutely positioned inside the map
              wrap (which is position:relative), so it always covers exactly the
              map. Absolute positioning is unaffected by the transformed
              <main>.page-anim ancestor that previously broke position:fixed. */}
          {tracksLoading && <TPLLoader overlay label="Fetching GPS tracks…" />}
        </div>
      </div>

      {/* Assign Device Modal */}
      {assignModal && (
        <AssignDeviceModal
          zone={assignModal.zone}
          devices={devices}
          assignments={assignments}
          onAssign={(sn) => handleAssign(assignModal.zone.zone_id, sn)}
          onClose={() => setAssignModal(null)}
        />
      )}

    </div>
  );
}

export default function FencePage() {
  return <ErrorBoundary><FencePageInner /></ErrorBoundary>;
}