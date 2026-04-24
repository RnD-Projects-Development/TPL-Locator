// src/pages/FencePage.jsx
import React, { useState, useEffect, useRef, useCallback, Component } from 'react';
import loadTPLMaps from '../components/loadTPLMaps.js';
import { useDeviceCache } from '../context/DeviceCacheContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { createPolygonManager, pointInPolygon } from '../utils/zonePolygonManager.js';
import { tplGeocode } from '../utils/tplGeocode.js';
import ZoneSidebar from '../components/ZoneSidebar.jsx';
import AssignDeviceModal from '../components/AssignDeviceModal.jsx';
import { KML_ZONES } from '../data/kmlZones.js';
import './FencePage.css';

const API_BASE_URL = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_BASE_URL || '');

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

// ─── Main page ────────────────────────────────────────────────────────────────
function FencePageInner() {
  const { devices, refresh } = useDeviceCache();
  const { accessToken, isAdmin } = useAuth();

  const mapRef          = useRef(null);
  const mapContainerRef = useRef(null);
  const polygonManager  = useRef(null);
  const resizeObserver  = useRef(null);

  // ── Core state ──────────────────────────────────────────────────────────────
  const [mapReady,       setMapReady]       = useState(false);
  const [zones,          setZones]          = useState(KML_ZONES);
  const [selectedZoneId, setSelectedZoneId] = useState(null);

  // assignments: { zone_id: [{ sn, user_name }] }
  const [assignments,    setAssignments]    = useState({});

  // zoneStatuses: { zone_id: [{ sn, user_name, status, latest, first_seen, last_seen }] }
  const [zoneStatuses,   setZoneStatuses]   = useState({});
  const [statusLoading,  setStatusLoading]  = useState(false);

  // assignModal: { zone } | null
  const [assignModal,    setAssignModal]    = useState(null);

  // assigningZoneId: zone currently awaiting assign + status-fetch to complete
  const [assigningZoneId, setAssigningZoneId] = useState(null);

  // ── Playback state ──────────────────────────────────────────────────────────
  // deviceTracks: Array<{ sn, user_name, insidePoints, outsidePoints, firstSeen, lastSeen }>
  const [deviceTracks,  setDeviceTracks]  = useState([]);
  const [tracksLoading, setTracksLoading] = useState(false);
  // Ref to detect stale fetches when zone changes mid-flight
  const tracksFetchZoneRef = useRef(null);

  // ── Auth headers helper ─────────────────────────────────────────────────────
  const authHeaders = useCallback(() => ({
    'Content-Type': 'application/json',
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  }), [accessToken]);

  // ── Map initialisation ──────────────────────────────────────────────────────
  useEffect(() => {
    loadTPLMaps(() => {
      if (mapRef.current) { setMapReady(true); return; }

      const map = window.TPLMaps.map.initMap({
        divID: 'fence-map', lat: 31.5135, lng: 74.3170, zoom: 15, showZoomControl: true,
      });
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
    });
    return () => {
      resizeObserver.current?.disconnect();
      polygonManager.current?.clearAll();
      mapRef.current?.remove?.();
      mapRef.current = null; polygonManager.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Render KML polygons ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !polygonManager.current) return;
    polygonManager.current.renderZones(KML_ZONES, {
      onZoneClick: (id) => setSelectedZoneId(id),
      onZoneHover: () => {}, onZoneHoverOut: () => {},
    });
  }, [mapReady]);

  // ── Reverse-geocode zone names ──────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady) return;
    let cancelled = false;
    Promise.all(
      KML_ZONES.map(async (zone) => {
        try {
          const geo  = await tplGeocode(zone.center.lat, zone.center.lng);
          const name = geo?.area || geo?.roadOnly || geo?.city || zone.name;
          return { ...zone, name };
        } catch { return zone; }
      })
    ).then((named) => { if (!cancelled) setZones(named); });
    return () => { cancelled = true; };
  }, [mapReady]);

  // ── Derive assignments from device cache ─────────────────────────────────
  useEffect(() => {
    const map = {};
    devices.forEach((d) => {
      if (d.zone && d.zone.startsWith('beat_')) {
        if (!map[d.zone]) map[d.zone] = [];
        map[d.zone].push({
          sn:        d.sn,
          user_name: d.assigned_user_name || d.assignedUser || d.sn,
        });
      }
    });
    setAssignments(map);
  }, [devices]);

  // ── Fetch geofence statuses from backend ─────────────────────────────────
  const fetchStatuses = useCallback(async () => {
    setStatusLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/geofence/status`, {
        headers: authHeaders(),
      });
      if (!res.ok) return;
      const data = await res.json();

      const enriched = {};
      Object.entries(data.zones || {}).forEach(([zone_id, entries]) => {
        enriched[zone_id] = entries.map((e) => {
          const dev = devices.find((d) => d.sn === e.sn);
          return {
            ...e,
            user_name: dev?.assigned_user_name || dev?.assignedUser || e.sn,
          };
        });
      });
      setZoneStatuses(enriched);
    } catch { /* keep previous statuses */ }
    finally {
      setStatusLoading(false);
      setAssigningZoneId(null);
    }
  }, [authHeaders, devices]);

  useEffect(() => {
    if (!accessToken) return;
    fetchStatuses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignments, accessToken]);

  // ── Sync zone selection → map polygon highlight ────────────────────────────
  useEffect(() => {
    if (!mapReady || !polygonManager.current) return;
    polygonManager.current.selectZone(selectedZoneId);
  }, [selectedZoneId, mapReady]);

  // ── Fetch + render device GPS tracks when zone is selected ────────────────
  useEffect(() => {
    if (!mapReady || !polygonManager.current) return;

    // Always clear stale dots immediately when zone changes (or is deselected)
    polygonManager.current.clearDeviceDots();
    setDeviceTracks([]);

    if (!selectedZoneId || !accessToken) return;

    const devicesInZone = assignments[selectedZoneId] || [];
    if (devicesInZone.length === 0) return;

    // Get the zone polygon for point-in-polygon classification
    const selectedZone = zones.find((z) => z.zone_id === selectedZoneId);
    if (!selectedZone || !selectedZone.polygon) return;

    // Calculate 30 days ago for playback endpoint
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    const startStr = startDate.toISOString();
    const endStr = endDate.toISOString();

    // Stamp this fetch so we can discard results if the zone changes mid-flight
    const fetchTag = selectedZoneId;
    tracksFetchZoneRef.current = fetchTag;
    setTracksLoading(true);

    Promise.all(
      devicesInZone.map(async ({ sn, user_name }) => {
        try {
          const res = await fetch(
            `${API_BASE_URL}/api/devices/${encodeURIComponent(sn)}/playback?start=${encodeURIComponent(startStr)}&end=${encodeURIComponent(endStr)}`,
            { headers: authHeaders() },
          );
          if (!res.ok) return null;
          const data = await res.json();

          // Accept { points: [...] } or a bare array
          const rawPoints = Array.isArray(data) ? data : (data.points || []);

          // Normalise field names (lat/lng OR latitude/longitude)
          const points = rawPoints
            .map((p) => ({
              lat:       p.lat       ?? p.latitude,
              lng:       p.lng       ?? p.longitude,
              timestamp: p.timestamp ?? p.ts ?? p.time ?? null,
            }))
            .filter((p) => p.lat != null && p.lng != null);

          // Classify points as inside/outside the zone polygon
          const insidePoints = [];
          const outsidePoints = [];
          const polygon = selectedZone.polygon;

          points.forEach((pt) => {
            if (pointInPolygon(pt.lat, pt.lng, polygon)) {
              insidePoints.push(pt);
            } else {
              outsidePoints.push(pt);
            }
          });

          // Calculate first/last seen from inside points only
          const sortedInside = [...insidePoints].sort((a, b) => 
            new Date(a.timestamp || 0) - new Date(b.timestamp || 0)
          );
          const firstSeen = sortedInside.length > 0 ? sortedInside[0].timestamp : null;
          const lastSeen = sortedInside.length > 0 ? sortedInside[sortedInside.length - 1].timestamp : null;

          return { sn, user_name, insidePoints, outsidePoints, firstSeen, lastSeen };
        } catch {
          return null; // skip devices whose playback fetch fails
        }
      })
    ).then((results) => {
      // Discard if the user switched zones while we were in-flight
      if (tracksFetchZoneRef.current !== fetchTag) return;

      const tracks = results.filter(Boolean);
      setDeviceTracks(tracks);
      setTracksLoading(false);

      polygonManager.current?.renderDeviceDots(tracks, selectedZone.polygon);
    });

    return () => {
      // Mark as stale on cleanup so the .then() above is a no-op
      if (tracksFetchZoneRef.current === fetchTag) {
        tracksFetchZoneRef.current = null;
      }
    };
  // Re-fetch whenever the selected zone changes OR assignments for that zone change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedZoneId, mapReady, accessToken, assignments, zones]);

  // ── Assign device ───────────────────────────────────────────────────────────
  async function handleAssign(zone_id, sn) {
    setAssignModal(null);
    setAssigningZoneId(zone_id);

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/admin/devices/${encodeURIComponent(sn)}`,
        { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ zone: zone_id }) },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setAssigningZoneId(null);
        throw new Error(body?.detail || 'Assignment failed');
      }
      refresh();
    } catch (err) {
      setAssigningZoneId(null);
      throw err;
    }
  }

  // ── Unassign device ─────────────────────────────────────────────────────────
  async function handleUnassign(sn) {
    // Optimistically remove from sidebar state immediately
    setZoneStatuses((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((id) => {
        next[id] = next[id].filter((e) => e.sn !== sn);
      });
      return next;
    });
    setAssignments((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((id) => {
        next[id] = next[id].filter((e) => e.sn !== sn);
      });
      return next;
    });
    // Remove this device's dots from the map immediately too
    setDeviceTracks((prev) => {
      const next = prev.filter((t) => t.sn !== sn);
      polygonManager.current?.renderDeviceDots(next);
      return next;
    });

    fetch(
      `${API_BASE_URL}/api/admin/devices/${encodeURIComponent(sn)}`,
      { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ zone: '' }) },
    ).then(() => refresh()).catch(() => refresh());
  }

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="fp-page">

      {/* ── Top bar ── */}
      <div className="fp-topbar">
        <div className="fp-topbar-left">
          <span className="fp-topbar-label">Geofencing</span>
          <span className="fp-topbar-area">
            <svg width="11" height="11" viewBox="0 0 24 24"
                 fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/>
              <circle cx="12" cy="10" r="1" fill="currentColor"/>
            </svg>
            UC 216 — Muslim Town &nbsp;·&nbsp; {zones.length} zones
          </span>
        </div>
        <div className="fp-topbar-right">
          {/* Subtle inline indicator while tracks are loading */}
          {tracksLoading && (
            <span style={{
              fontSize: 11, color: '#60a5fa',
              display: 'inline-flex', alignItems: 'center', gap: 5, marginRight: 10,
            }}>
              <span className="fp-spinner" />
              Loading tracks…
            </span>
          )}
          <button
            onClick={fetchStatuses}
            disabled={statusLoading}
            className="fp-btn-load"
            style={{ fontSize: 11 }}
          >
            {statusLoading ? <><span className="fp-spinner" /> Refreshing…</> : '↻ Refresh Status'}
          </button>
        </div>
      </div>

      {/* ── Body ── */}
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

        <div className="fp-map-wrap">
          <div ref={mapContainerRef} id="fence-map"
               style={{ position: 'absolute', inset: 0 }} />
        </div>

      </div>

      {/* ── Assign Device Modal ── */}
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