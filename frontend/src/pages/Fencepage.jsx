// src/pages/FencePage.jsx
import React, { useState, useEffect, useRef, useCallback, useMemo, Component } from 'react';
import loadTPLMaps from '../components/loadTPLMaps.js';
import { useDeviceCache } from '../context/DeviceCacheContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useZoneCache } from '../context/ZoneCacheContext.jsx';
import { createPolygonManager, pointInPolygon, pointInMultiPolygon } from '../utils/zonePolygonManager.js';
import ZoneSidebar from '../components/ZoneSidebar.jsx';
import ZoneToolbox from '../components/ZoneToolbox.jsx';
import AssignDeviceModal from '../components/AssignDeviceModal.jsx';
import TPLLoader from '../components/TPLLoader.jsx';
import './FencePage.css';

const API_BASE_URL = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_BASE_URL || '');

const TRACK_RANGES = [
  { label: '1D',  days: 1  },
  { label: '3D',  days: 3  },
  { label: '7D',  days: 7  },
  { label: '14D', days: 14 },
  { label: '30D', days: 30 },
];

// ─── Entry/exit detection ─────────────────────────────────────────────────────
function computeEntryExits(allPoints, isInZone) {
  if (!allPoints || allPoints.length === 0) return [];
  const events = [];
  let prevInside = null;
  for (const pt of allPoints) {
    const inside = isInZone(pt.lat, pt.lng);
    if (prevInside === null) {
      prevInside = inside;
      if (inside) events.push({ type: 'ENTER', timestamp: pt.timestamp });
      continue;
    }
    if (!prevInside && inside)  events.push({ type: 'ENTER', timestamp: pt.timestamp });
    else if (prevInside && !inside) events.push({ type: 'EXIT',  timestamp: pt.timestamp });
    prevInside = inside;
  }
  return events;
}

// ─── Error Boundary ───────────────────────────────────────────────────────────
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e) { return { error: e }; }
  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] caught render crash:', error, info);
  }
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
  const { zones, refreshZones } = useZoneCache();

  const mapRef             = useRef(null);
  const mapContainerRef    = useRef(null);
  const mapWrapRef         = useRef(null);
  const polygonManager     = useRef(null);
  const resizeObserver     = useRef(null);
  const tracksFetchZoneRef = useRef(null);
  const zoneStatusesRef    = useRef({});
  const accessTokenRef     = useRef(accessToken);
  const devicesRef         = useRef(devices);
  const [mapReady,       setMapReady]       = useState(false);
  const [toolboxMode,    setToolboxMode]    = useState(null);  // null | 'create' | 'edit'
  const [editingZone,    setEditingZone]    = useState(null);
  const [isSaving,       setIsSaving]       = useState(false);
  const [selectedZoneId, setSelectedZoneId] = useState(null);
  const [assignments,     setAssignments]     = useState({});
  const [zoneStatuses,    setZoneStatuses]    = useState({});
  const [statusLoading,   setStatusLoading]   = useState(false);
  const [assignModal,     setAssignModal]     = useState(null);
  const [assigningZoneId, setAssigningZoneId] = useState(null);
  const [deviceTracks,    setDeviceTracks]    = useState([]);
  const [tracksLoading,   setTracksLoading]   = useState(false);
  const [tracksFetchKey,  setTracksFetchKey]  = useState(0);
  const [tracksRangeDays, setTracksRangeDays] = useState(7);

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

  // For user-created zones (MongoDB 24-char hex IDs), /api/geofence/status never
  // returns data, so supplement zoneStatuses with data derived from the device cache.
  const displayStatuses = useMemo(() => {
    const result = { ...zoneStatuses };
    Object.entries(assignments).forEach(([zid, devs]) => {
      if (/^[0-9a-f]{24}$/i.test(zid) && devs.length > 0) {
        result[zid] = devs.map((d) => ({ ...d, status: d.status || 'OFFLINE' }));
      }
    });
    return result;
  }, [zoneStatuses, assignments]);

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
    const start = new Date(end.getTime() - tracksRangeDays * 24 * 60 * 60 * 1000);
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
          const events        = computeEntryExits(allPoints, isInZone);
          return {
            sn: dev.sn, user_name, insidePoints, outsidePoints, events,
            firstSeen: insidePoints[0]?.timestamp ?? null,
            lastSeen:  insidePoints.at(-1)?.timestamp ?? null,
          };
        });

        setDeviceTracks(tracks);
        polygonManager.current?.renderDeviceDots(tracks);
        setTracksLoading(false);

        // Fire browser notifications for detected entry/exit events
        const totalEvents = tracks.reduce((s, t) => s + (t.events?.length ?? 0), 0);
        if (totalEvents > 0 && typeof window !== 'undefined' && 'Notification' in window) {
          const fire = () => {
            const zoneName = selectedZone?.name || selectedZone?.beat || selectedZoneId;
            if (totalEvents <= 3) {
              tracks.forEach((t) => {
                (t.events || []).forEach((ev) => {
                  try {
                    new Notification('TPL Geofence Alert', {
                      body: `${t.user_name} ${ev.type === 'ENTER' ? 'entered' : 'exited'} zone ${zoneName}`,
                      tag: `GEO-${t.sn}-${(ev.timestamp || '').replace(/\D/g, '')}`,
                    });
                  } catch {}
                });
              });
            } else {
              try {
                new Notification('TPL Geofence Alert', {
                  body: `${totalEvents} entry/exit events detected in zone ${zoneName}`,
                  tag: `GEO-SUMMARY-${selectedZoneId}`,
                });
              } catch {}
            }
          };
          if (Notification.permission === 'granted') {
            fire();
          } else if (Notification.permission !== 'denied') {
            Notification.requestPermission().then((p) => { if (p === 'granted') fire(); }).catch(() => {});
          }
        }
      })
      .catch(() => setTracksLoading(false));

    return () => { if (tracksFetchZoneRef.current === fetchTag) tracksFetchZoneRef.current = null; };
  }, [selectedZoneId, mapReady, accessToken, zones, authHeaders, tracksFetchKey, tracksRangeDays]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Assign device ─────────────────────────────────────────────────────────────
  async function handleAssign(zone_id, sn) {
    if (!sn || String(sn).trim() === '' || String(sn) === 'undefined') {
      setAssigningZoneId(null);
      throw new Error('Cannot assign device: serial number is missing or invalid.');
    }
    setAssigningZoneId(zone_id);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/zones/${encodeURIComponent(zone_id)}/assign`,
        { method: 'POST', headers: authHeaders(), body: JSON.stringify({ sn: String(sn).trim() }) },
      );
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody?.detail || `Assignment failed (HTTP ${res.status})`);
      }
      setAssignModal(null);
      await refresh();
      fetchStatuses();
      setTracksFetchKey((k) => k + 1);
    } catch (err) {
      setAssigningZoneId(null);
      throw err;
    }
  }

  // ── Unassign device ───────────────────────────────────────────────────────────
  async function handleUnassign(sn, zone_id) {
    // Optimistic UI update
    setZoneStatuses((prev) => ({ ...prev, [zone_id]: (prev[zone_id] || []).filter((e) => e.sn !== sn) }));
    setAssignments((prev) => ({ ...prev, [zone_id]: (prev[zone_id] || []).filter((e) => e.sn !== sn) }));
    setDeviceTracks((prev) => {
      const next = prev.filter((t) => t.sn !== sn);
      polygonManager.current?.renderDeviceDots(next);
      return next;
    });
    fetch(
      `${API_BASE_URL}/api/zones/${encodeURIComponent(zone_id)}/assign/${encodeURIComponent(sn)}`,
      { method: 'DELETE', headers: authHeaders() },
    ).catch(() => refresh());
  }

  // ── Zone toolbox handlers ─────────────────────────────────────────────────────
  async function handleSaveZone(data) {
    setIsSaving(true);
    try {
      if (toolboxMode === 'create') {
        const res = await fetch(`${API_BASE_URL}/api/zones`, {
          method: 'POST', headers: authHeaders(),
          body: JSON.stringify({ name: data.name, company: data.company, color: data.color, shape: data.shape, coordinates: data.coordinates, center: data.center, radius: data.radius }),
        });
        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.detail || 'Failed to create zone'); }
      } else {
        const res = await fetch(`${API_BASE_URL}/api/zones/${encodeURIComponent(editingZone.zone_id)}`, {
          method: 'PUT', headers: authHeaders(),
          body: JSON.stringify({ name: data.name, company: data.company, color: data.color, shape: data.shape, coordinates: data.coordinates, center: data.center, radius: data.radius }),
        });
        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.detail || 'Failed to update zone'); }
      }
      setToolboxMode(null);
      setEditingZone(null);
      refreshZones();
      refresh();
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteZone(zone_id) {
    try {
      await fetch(`${API_BASE_URL}/api/zones/${encodeURIComponent(zone_id)}`, {
        method: 'DELETE', headers: authHeaders(),
      });
    } catch {}
    if (selectedZoneId === zone_id) setSelectedZoneId(null);
    refreshZones();
    refresh();
  }

  function handleEditZone(zone) {
    setEditingZone(zone);
    setToolboxMode('edit');
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="fp-page">

      {/* Top bar */}
      <div className="fp-topbar">
        <div className="fp-topbar-left">
          <span className="fp-topbar-label">Geofencing</span>
        </div>
        <div className="fp-topbar-right">
          {/* Date-range shortcuts */}
          <div className="fp-shortcuts">
            {TRACK_RANGES.map(({ label, days }) => (
              <button
                key={label}
                className={`fp-shortcut-btn${tracksRangeDays === days ? ' active' : ''}`}
                onClick={() => setTracksRangeDays(days)}
                disabled={tracksLoading && tracksRangeDays === days}
                title={`Show last ${days} day${days === 1 ? '' : 's'}`}
              >
                {tracksRangeDays === days && tracksLoading
                  ? <span className="fp-spinner" />
                  : label}
              </button>
            ))}
          </div>
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
          zoneStatuses={displayStatuses}
          statusLoading={statusLoading}
          assignments={assignments}
          onOpenAssign={isAdmin ? (zone) => setAssignModal({ zone }) : null}
          onUnassign={isAdmin ? handleUnassign : null}
          assigningZoneId={assigningZoneId}
          deviceTracks={deviceTracks}
          tracksLoading={tracksLoading}
          onCreateZone={isAdmin ? () => {
            setEditingZone(null);
            setToolboxMode('create');
          } : null}
          onEditZone={isAdmin ? handleEditZone : null}
          onDeleteZone={isAdmin ? handleDeleteZone : null}
        />
        <div className="fp-map-wrap" ref={mapWrapRef}>
          <div ref={mapContainerRef} id="fence-map" style={{ position: 'absolute', inset: 0 }} />
          {tracksLoading && <TPLLoader overlay label="Fetching GPS tracks…" />}
        </div>

        {toolboxMode && (
          <ZoneToolbox
            mode={toolboxMode}
            initialZone={editingZone}
            mapRef={mapRef}
            onSave={handleSaveZone}
            onCancel={() => { setToolboxMode(null); setEditingZone(null); }}
            isSaving={isSaving}
          />
        )}
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