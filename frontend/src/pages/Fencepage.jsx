// src/pages/FencePage.jsx
import React, { useState, useEffect, useRef, useCallback, useMemo, Component } from 'react';
import loadTPLMaps from '../components/loadTPLMaps.js';
import { useDeviceCache } from '../context/DeviceCacheContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useZoneCache } from '../context/ZoneCacheContext.jsx';
import {
  createPolygonManager,
  pointInPolygon,
  pointInMultiPolygon,
  buildDeviceColorMap,
  deviceColor,
} from '../utils/zonePolygonManager.js';
import { useResizablePanel } from '../hooks/useResizablePanel.js';
import ZoneSidebar from '../components/ZoneSidebar.jsx';
import ZoneToolbox from '../components/ZoneToolbox.jsx';
import AssignDeviceModal from '../components/AssignDeviceModal.jsx';
import ConfirmDeleteDeviceModal from '../components/ConfirmDeleteDeviceModal.jsx';
import ZoneDetailSidebar from '../components/ZoneDetailSidebar.jsx';
import TPLLoader from '../components/TPLLoader.jsx';
import LocatingOverlay from '../components/LocatingOverlay.jsx';
import { frameBounds } from '../utils/frameBounds.js';
import { parseKML } from '../utils/kmlParser.js';
import './FencePage.css';

const API_BASE_URL = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_BASE_URL || '');

const TRACK_RANGES = [
  { label: '1D',  days: 1  },
  { label: '3D',  days: 3  },
  { label: '7D',  days: 7  },
  { label: '14D', days: 14 },
  { label: '30D', days: 30 },
];

// Same rule the backend uses (_get_device_status): a device counts as online
// while its newest location report is under 12 hours old.
const ONLINE_THRESHOLD_MS = 720 * 60 * 1000;

const pad2 = (n) => String(n).padStart(2, '0');

// Location timestamps are stored as naive Pakistan wall-clock, so range queries
// must be sent as naive strings too — toISOString() would shift the window by
// the browser's UTC offset and silently drop the most recent hours of points.
// Mirrors naiveLocal() in PlaybackPage.jsx / playbackCache.js.
function naiveLocal(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T` +
         `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function isRecentReport(ts) {
  if (!ts) return false;
  const t = new Date(ts).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < ONLINE_THRESHOLD_MS;
}

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
  const { devices, refresh, silentRefresh } = useDeviceCache();
  const { accessToken, isAdmin, user } = useAuth();
  const { zones, refreshZones, zonesLoading } = useZoneCache();
  const canManageFence = isAdmin || Boolean(user?.geofence_create_access);

  const mapRef             = useRef(null);
  const mapContainerRef    = useRef(null);
  const mapWrapRef         = useRef(null);
  const polygonManager     = useRef(null);
  const resizeObserver     = useRef(null);
  const tracksFetchZoneRef = useRef(null);
  const accessTokenRef     = useRef(accessToken);
  const devicesRef         = useRef(devices);
  const zonesRef           = useRef(zones);
  const [mapReady,       setMapReady]       = useState(false);
  const [toolboxMode,    setToolboxMode]    = useState(null);  // null | 'create' | 'edit'
  const [editingZone,    setEditingZone]    = useState(null);
  const [isSaving,       setIsSaving]       = useState(false);
  const [selectedZoneId, setSelectedZoneId] = useState(null);
  const [assignments,     setAssignments]     = useState({});
  const [assignModal,     setAssignModal]     = useState(null);
  const [deleteTarget,    setDeleteTarget]    = useState(null);  // { entry, zone_id, zoneName }
  const [assigningZoneId, setAssigningZoneId] = useState(null);
  const [deviceTracks,    setDeviceTracks]    = useState([]);
  const [tracksLoading,   setTracksLoading]   = useState(false);
  const [tracksFetchKey,  setTracksFetchKey]  = useState(0);
  const [tracksRangeDays, setTracksRangeDays] = useState(1);
  const [isUploadingKML,  setIsUploadingKML]  = useState(false);
  const kmlInputRef = useRef(null);

  // User-adjustable zone sidebar width (drag the divider, double-click resets).
  const zonePanel = useResizablePanel('fp_sidebar_w', { defaultWidth: 260, min: 220, max: 480, edge: 'right' });
  const rightPanel = useResizablePanel('fp_sidebar_right_w', { defaultWidth: 260, min: 220, max: 480, edge: 'left' });
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);

  // Keep refs in sync
  useEffect(() => { accessTokenRef.current = accessToken; }, [accessToken]);
  useEffect(() => { devicesRef.current = devices; }, [devices]);
  useEffect(() => { zonesRef.current = zones; }, [zones]);

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

  // ── Render zone polygons — re-renders when zones update (e.g. after geocoding) ──
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

  // Derive per-zone device statuses from the device cache (assignments).
  const displayStatuses = useMemo(() => {
    const result = {};
    Object.entries(assignments).forEach(([zid, devs]) => {
      if (devs.length > 0) {
        result[zid] = devs.map((d) => ({ ...d, status: d.status || 'OFFLINE' }));
      }
    });
    return result;
  }, [assignments]);

  // One distinct colour per device in the selected zone. Assigned over the whole
  // set (not hashed per-sn) so two devices can never come out the same colour.
  const zoneColorMap = useMemo(
    () => buildDeviceColorMap((assignments[selectedZoneId] || []).map((d) => d.sn)),
    [assignments, selectedZoneId],
  );

  // Tracks + their assigned colour. Kept separate from the fetch so a colour
  // change never re-triggers a network round-trip.
  const coloredTracks = useMemo(
    () => deviceTracks.map((t) => ({ ...t, color: zoneColorMap[t.sn] || deviceColor(t.sn) })),
    [deviceTracks, zoneColorMap],
  );

  // Rows for the right sidebar: presence (online/offline) comes from the newest
  // location report; zone membership comes from where that same newest report
  // falls relative to this zone's polygon.
  const zoneDeviceRows = useMemo(() => {
    const list = assignments[selectedZoneId] || [];
    const trackBySn = Object.fromEntries(coloredTracks.map((t) => [t.sn, t]));

    return list.map((d) => {
      const dev   = devices.find((x) => x.sn === d.sn);
      const track = trackBySn[d.sn];
      const lastReportAt = dev?.dataRetrievalTime || track?.lastPoint?.timestamp || null;

      const presence =
        String(dev?.status || '').toLowerCase() === 'online' || isRecentReport(track?.lastPoint?.timestamp)
          ? 'online'
          : 'offline';

      let zoneStatus = 'NO_DATA';
      if (track?.lastPoint) zoneStatus = track.lastPointInside ? 'IN_ZONE' : 'OUT_OF_ZONE';

      return {
        ...d,
        presence,
        zoneStatus,
        lastReportAt,
        color: zoneColorMap[d.sn] || deviceColor(d.sn),
      };
    });
  }, [assignments, selectedZoneId, coloredTracks, devices, zoneColorMap]);

  // Draw device dots whenever the tracks or their colours change.
  useEffect(() => {
    if (!mapReady || !polygonManager.current) return;
    polygonManager.current.renderDeviceDots(coloredTracks);
  }, [coloredTracks, mapReady]);

  // ── Zone selection → map highlight + zoom to zone bounds ─────────────────────
  useEffect(() => {
    if (!mapReady || !polygonManager.current) return;
    polygonManager.current.selectZone(selectedZoneId);

    if (!selectedZoneId) return;
    const zone = zones.find(z => z.zone_id === selectedZoneId);
    if (!zone) return;

    const pts = zone.polygons
      ? zone.polygons.flat().map(p => [p.lat, p.lng])
      : (zone.polygon || []).map(p => [p.lat, p.lng]);

    if (pts.length < 2) return;
    try {
      const bounds = window.L.latLngBounds(pts);
      frameBounds(mapRef.current, bounds, { padding: [50, 50], maxZoom: 17 });
    } catch {}
  }, [selectedZoneId, mapReady, zones]);

  // ── Fetch + render device GPS tracks ─────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !polygonManager.current) return;

    polygonManager.current.clearDeviceDots();
    setDeviceTracks([]);

    if (!selectedZoneId || !accessToken) return;

    const selectedZone = zonesRef.current.find((z) => z.zone_id === selectedZoneId);
    if (!selectedZone?.polygon && !selectedZone?.polygons?.length) return;

    const end   = new Date();
    const start = new Date(end.getTime() - tracksRangeDays * 24 * 60 * 60 * 1000);
    const url   = `${API_BASE_URL}/api/geofence/tracks/${encodeURIComponent(selectedZoneId)}` +
                  `?start=${encodeURIComponent(naiveLocal(start))}&end=${encodeURIComponent(naiveLocal(end))}`;

    const fetchTag = selectedZoneId;
    tracksFetchZoneRef.current = fetchTag;
    setTracksLoading(true);

    fetch(url, { headers: authHeaders() })
      .then(async (res) => {
        if (!res.ok) { setTracksLoading(false); return; }

        const data = await res.json();
        if (tracksFetchZoneRef.current !== fetchTag) { setTracksLoading(false); return; }

        const isInZone  = selectedZone.polygons
          ? (lat, lng) => pointInMultiPolygon(lat, lng, selectedZone.polygons)
          : (lat, lng) => pointInPolygon(lat, lng, selectedZone.polygon);

        const tracks = (data.devices || []).map((dev) => {
          const deviceDoc = devicesRef.current.find((d) => d.sn === dev.sn);
          const user_name = deviceDoc?.assigned_user_name || deviceDoc?.assignedUser || dev.sn;
          // Keep only points the map can actually plot, then re-sort by time —
          // the in/out-of-zone badge depends on the true newest report, so it
          // must not rely on the server's ordering holding after filtering.
          const allPoints = (dev.points || [])
            .filter(p => Number.isFinite(p?.lat) && Number.isFinite(p?.lng))
            .map(p => ({ lat: p.lat, lng: p.lng, timestamp: p.timestamp ?? null }))
            .sort((a, b) => new Date(a.timestamp ?? 0) - new Date(b.timestamp ?? 0));

          const dropped = (dev.points || []).length - allPoints.length;
          if (dropped > 0) {
            console.warn('[fence] sn=%s dropped %d point(s) with invalid lat/lng', dev.sn, dropped);
          }

          const insidePoints  = allPoints.filter(p => isInZone(p.lat, p.lng));
          const outsidePoints = allPoints.filter(p => !isInZone(p.lat, p.lng));
          const events        = computeEntryExits(allPoints, isInZone);
          const lastPoint     = allPoints.at(-1) ?? null;

          return {
            sn: dev.sn, user_name, insidePoints, outsidePoints, events,
            firstSeen: insidePoints[0]?.timestamp ?? null,
            lastSeen:  insidePoints.at(-1)?.timestamp ?? null,
            // Latest report overall — drives the IN ZONE / OUT OF ZONE badge.
            lastPoint,
            lastPointInside: lastPoint ? isInZone(lastPoint.lat, lastPoint.lng) : false,
            totalPoints: allPoints.length,
          };
        });

        setDeviceTracks(tracks);
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
                    new Notification('TPL fence Alert', {
                      body: `${t.user_name} ${ev.type === 'ENTER' ? 'entered' : 'exited'} zone ${zoneName}`,
                      tag: `GEO-${t.sn}-${(ev.timestamp || '').replace(/\D/g, '')}`,
                    });
                  } catch {}
                });
              });
            } else {
              try {
                new Notification('TPL fence Alert', {
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
  }, [selectedZoneId, mapReady, accessToken, authHeaders, tracksFetchKey, tracksRangeDays]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Assign devices ────────────────────────────────────────────────────────────
  // Sends device SNs in a single batch request to avoid slow sequential round-trips.
  async function handleAssign(zone_id, sns, onProgress) {
    const list = (Array.isArray(sns) ? sns : [sns])
      .map(s => String(s ?? '').trim())
      .filter(s => s && s !== 'undefined');

    if (list.length === 0) return { failures: [] };

    setAssigningZoneId(zone_id);
    const failures = [];

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/zones/${encodeURIComponent(zone_id)}/assign`,
        { method: 'POST', headers: authHeaders(), body: JSON.stringify({ sns: list }) },
      );
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        failures.push({ sn: list.join(', '), message: errBody?.detail || `HTTP ${res.status}` });
      }

      onProgress?.(list.length);

      // Force-refresh device cache silently
      await silentRefresh();
      setTracksFetchKey((k) => k + 1);
      return { failures };
    } catch (err) {
      failures.push({ sn: list.join(', '), message: err?.message || 'network error' });
      return { failures };
    } finally {
      setAssigningZoneId(null);
    }
  }

  // ── Delete device from zone ───────────────────────────────────────────────────
  // Only ever called after the user confirms in ConfirmDeleteDeviceModal. Local
  // state is updated after the API call succeeds, so a failed delete leaves the
  // UI matching what is actually in the database.
  async function handleDeleteDevice(sn, zone_id) {
    const res = await fetch(
      `${API_BASE_URL}/api/zones/${encodeURIComponent(zone_id)}/assign/${encodeURIComponent(sn)}`,
      { method: 'DELETE', headers: authHeaders() },
    );
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody?.detail || `Delete failed (HTTP ${res.status})`);
    }

    setAssignments((prev) => ({ ...prev, [zone_id]: (prev[zone_id] || []).filter((e) => e.sn !== sn) }));
    setDeviceTracks((prev) => prev.filter((t) => t.sn !== sn));
    await silentRefresh();
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

  // ── Upload KML handlers ───────────────────────────────────────────────────────
  const handleUploadKMLClick = useCallback(() => {
    kmlInputRef.current?.click();
  }, []);

  const handleKmlFileChange = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ''; // allow selecting same file again if desired

    setIsUploadingKML(true);
    try {
      const text = await file.text();
      const parsedZones = parseKML(text);
      if (!parsedZones || parsedZones.length === 0) {
        alert('No valid polygon boundaries found in this KML file.');
        return;
      }

      const res = await fetch(`${API_BASE_URL}/api/zones/batch`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(parsedZones),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody?.detail || `Failed to import zones (HTTP ${res.status})`);
      }

      await refreshZones();
      await refresh();

      // Zoom & frame map to imported zones
      const allCoords = parsedZones.flatMap((z) => z.coordinates || []).map((p) => [p.lat, p.lng]);
      if (allCoords.length > 0 && mapRef.current && window.L) {
        try {
          const bounds = window.L.latLngBounds(allCoords);
          frameBounds(mapRef.current, bounds, { padding: [50, 50], maxZoom: 16 });
        } catch {}
      }
    } catch (err) {
      console.error('[FencePage] KML upload failed:', err);
      alert(err.message || 'Failed to parse and import KML file');
    } finally {
      setIsUploadingKML(false);
    }
  }, [authHeaders, refresh, refreshZones]);

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="fp-page">
      {/* Hidden file input for KML upload */}
      <input
        type="file"
        ref={kmlInputRef}
        accept=".kml,.xml"
        onChange={handleKmlFileChange}
        style={{ display: 'none' }}
      />

      {/* Top bar */}
      <div className="fp-topbar">
        <div className="fp-topbar-left">
          <span className="fp-topbar-label">Fencing</span>
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
        </div>
      </div>

      {/* Body */}
      <div className="fp-body">
        <div className="pb-panel-resizable" style={{ width: zonePanel.width }}>
        <ZoneSidebar
          zones={zones}
          selectedZoneId={selectedZoneId}
          onSelect={(id) => { setSelectedZoneId(id); if (id) setIsRightSidebarOpen(true); }}
          zoneStatuses={displayStatuses}
          assignments={assignments}
          onOpenAssign={canManageFence ? (zone) => setAssignModal({ zone }) : null}
          assigningZoneId={assigningZoneId}
          deviceTracks={coloredTracks}
          tracksLoading={tracksLoading}
          zonesLoading={zonesLoading}
          onCreateZone={canManageFence ? () => {
            setEditingZone(null);
            setToolboxMode('create');
          } : null}
          onEditZone={canManageFence ? handleEditZone : null}
          onDeleteZone={canManageFence ? handleDeleteZone : null}
          onUploadKML={canManageFence ? handleUploadKMLClick : null}
          isUploadingKML={isUploadingKML}
          isAdmin={isAdmin}
          currentUserId={String(user?._id || user?.id || '')}
        />
        </div>
        <div className="pb-resizer" {...zonePanel.handleProps} />
        <div className="fp-map-wrap" ref={mapWrapRef}>
          <div ref={mapContainerRef} id="fence-map" style={{ position: 'absolute', inset: 0 }} />
          <LocatingOverlay isVisible={Boolean(tracksLoading && selectedZoneId)} />
          
          {/* Floating Expand Button (only when closed) */}
          {!isRightSidebarOpen && selectedZoneId && (
            <div className="fp-expand-hover-zone">
              <div className="fp-expand-btn-wrapper">
                <button className="btn-uiverse" onClick={() => setIsRightSidebarOpen(true)} title="Expand sidebar">
                  <div className="btn-uiverse-box" style={{ transform: 'scaleX(-1)', left: 'auto', right: 0 }}>
                    <span className="btn-uiverse-elem">
                      <svg viewBox="0 0 46 40" xmlns="http://www.w3.org/2000/svg">
                        <path d="M46 20.038c0-.7-.3-1.5-.8-2.1l-16-17c-1.1-1-3.2-1.4-4.4-.3-1.2 1.1-1.2 3.3 0 4.4l11.3 11.9H3c-1.7 0-3 1.3-3 3s1.3 3 3 3h33.1l-11.3 11.9c-1 1-1.2 3.3 0 4.4 1.2 1.1 3.3.8 4.4-.3l16-17c.5-.5.8-1.1.8-1.9z"></path>
                      </svg>
                    </span>
                    <span className="btn-uiverse-elem">
                      <svg viewBox="0 0 46 40" xmlns="http://www.w3.org/2000/svg">
                        <path d="M46 20.038c0-.7-.3-1.5-.8-2.1l-16-17c-1.1-1-3.2-1.4-4.4-.3-1.2 1.1-1.2 3.3 0 4.4l11.3 11.9H3c-1.7 0-3 1.3-3 3s1.3 3 3 3h33.1l-11.3 11.9c-1 1-1.2 3.3 0 4.4 1.2 1.1 3.3.8 4.4-.3l16-17c.5-.5.8-1.1.8-1.9z"></path>
                      </svg>
                    </span>
                  </div>
                </button>
              </div>
            </div>
          )}
        </div>

        {isRightSidebarOpen && (
          <>
            <div className="pb-resizer" {...rightPanel.handleProps} />
            <div className="pb-panel-resizable" style={{ width: rightPanel.width, background: 'var(--surface-1)', borderLeft: '1px solid var(--border-default)', height: '100%' }}>
              <ZoneDetailSidebar
                zone={zones.find(z => z.zone_id === selectedZoneId)}
                zoneDevices={zoneDeviceRows}
                statusLoading={false}
                isAssigning={assigningZoneId === selectedZoneId}
                deviceTracks={coloredTracks}
                tracksLoading={tracksLoading}
                onDeleteDevice={canManageFence ? (entry) => setDeleteTarget({
                  entry,
                  zone_id: selectedZoneId,
                  zoneName: zones.find(z => z.zone_id === selectedZoneId)?.name || 'this zone',
                }) : null}
                onClose={() => setIsRightSidebarOpen(false)}
              />
            </div>
          </>
        )}


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
          onAssign={(sns, onProgress) => handleAssign(assignModal.zone.zone_id, sns, onProgress)}
          onClose={() => setAssignModal(null)}
        />
      )}

      {/* Delete-device disclaimer — nothing is written until this is confirmed */}
      {deleteTarget && (
        <ConfirmDeleteDeviceModal
          deviceLabel={deleteTarget.entry.user_name || deleteTarget.entry.sn}
          sn={deleteTarget.entry.sn}
          zoneName={deleteTarget.zoneName}
          onConfirm={() => handleDeleteDevice(deleteTarget.entry.sn, deleteTarget.zone_id)}
          onClose={() => setDeleteTarget(null)}
        />
      )}

    </div>
  );
}

export default function FencePage() {
  return <ErrorBoundary><FencePageInner /></ErrorBoundary>;
}