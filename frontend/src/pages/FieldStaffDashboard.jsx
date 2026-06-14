import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { RefreshCw, MapPin, Users, CheckCircle, XCircle, ChevronDown } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { useZoneCache } from '../context/ZoneCacheContext.jsx';
import { useFieldStaffCache } from '../context/FieldStaffCacheContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import loadTPLMaps from '../components/loadTPLMaps.js';
import './FieldStaffDashboard.css';

const API_BASE_URL = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_BASE_URL || '');

// ─── Custom dark zone dropdown ─────────────────────────────────────────────────
function ZoneDropdown({ value, onChange, kmlZones, userZones }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const allZones = [
    ...kmlZones.map(z => ({ ...z, group: 'KML Zones' })),
    ...userZones.map(z => ({ ...z, group: 'Custom Zones' })),
  ];
  const selected = allZones.find(z => z.zone_id === value);

  const ITEM_STYLE = (active) => ({
    padding: '9px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: 9,
    color:      active ? '#FFFFFF' : 'rgba(255,255,255,0.72)',
    background: active ? 'rgba(167,44,50,0.18)' : 'transparent',
    transition: 'background 0.1s',
  });

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          height: 36, padding: '0 12px', borderRadius: 8, fontSize: 13, fontWeight: 600,
          background: '#1a1a1a', border: `1px solid ${open ? 'rgba(167,44,50,0.55)' : 'rgba(255,255,255,0.12)'}`,
          color: selected ? '#FFFFFF' : 'rgba(255,255,255,0.38)',
          cursor: 'pointer', outline: 'none', minWidth: 220,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          transition: 'border-color 0.15s',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
          {selected && <span style={{ width: 6, height: 6, borderRadius: '50%', background: selected.color || '#A72C32', flexShrink: 0 }} />}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {selected?.name || '— Select a zone —'}
          </span>
        </span>
        <ChevronDown style={{ width: 12, height: 12, color: 'rgba(255,255,255,0.40)', flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 8, zIndex: 9999,
          boxShadow: '0 8px 32px rgba(0,0,0,0.70)',
          maxHeight: 280, overflowY: 'auto',
        }}>
          <div
            onClick={() => { onChange(''); setOpen(false); }}
            style={{ ...ITEM_STYLE(false), color: 'rgba(255,255,255,0.30)', borderBottom: '1px solid rgba(255,255,255,0.07)', fontSize: 12 }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            — Select a zone —
          </div>

          {kmlZones.length > 0 && (
            <>
              <div style={{ padding: '7px 14px 3px', fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.10em' }}>KML Zones</div>
              {kmlZones.map(z => (
                <div key={z.zone_id}
                  onClick={() => { onChange(z.zone_id); setOpen(false); }}
                  style={ITEM_STYLE(z.zone_id === value)}
                  onMouseEnter={e => { if (z.zone_id !== value) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = z.zone_id === value ? 'rgba(167,44,50,0.18)' : 'transparent'; }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: z.color || '#A72C32', flexShrink: 0 }} />
                  {z.name}
                </div>
              ))}
            </>
          )}

          {userZones.length > 0 && (
            <>
              <div style={{ padding: '7px 14px 3px', fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.10em', borderTop: kmlZones.length > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none', marginTop: kmlZones.length > 0 ? 4 : 0 }}>Custom Zones</div>
              {userZones.map(z => (
                <div key={z.zone_id}
                  onClick={() => { onChange(z.zone_id); setOpen(false); }}
                  style={ITEM_STYLE(z.zone_id === value)}
                  onMouseEnter={e => { if (z.zone_id !== value) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = z.zone_id === value ? 'rgba(167,44,50,0.18)' : 'transparent'; }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: z.color || '#A72C32', flexShrink: 0 }} />
                  {z.name}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// ─── Map Section ──────────────────────────────────────────────────────────────
function MapSection({ devices, selectedZone, mapContainerRef }) {
  const mapRef      = useRef(null);
  const markersRef  = useRef([]);
  const polygonRef  = useRef(null);
  const mapReadyRef = useRef(false);

  useEffect(() => {
    if (!mapContainerRef.current) return;
    const containerId = mapContainerRef.current.id;

    const cancelLoad = loadTPLMaps(() => {
      if (mapRef.current) return;
      const container = document.getElementById(containerId);
      if (!container) return;

      const map = window.TPLMaps.map.initMap({
        divID: containerId, lat: 31.5204, lng: 74.3587, zoom: 10, showZoomControl: true,
      });
      map.scrollWheelZoom?.enable();
      mapRef.current    = map;
      mapReadyRef.current = true;
      requestAnimationFrame(() => map.invalidateSize?.());
    });

    return () => {
      cancelLoad();
      markersRef.current.forEach(m => { try { mapRef.current?.removeLayer(m); } catch {} });
      markersRef.current = [];
      if (polygonRef.current) { try { mapRef.current?.removeLayer(polygonRef.current); } catch {} polygonRef.current = null; }
      mapRef.current?.remove?.();
      mapRef.current     = null;
      mapReadyRef.current = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Draw zone polygon when selectedZone changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;
    if (polygonRef.current) { try { map.removeLayer(polygonRef.current); } catch {} polygonRef.current = null; }
    if (!selectedZone) return;

    const coords = selectedZone.coordinates || selectedZone.polygon || [];
    if (!coords.length) return;

    const latlngs = coords.map(c => [c.lat, c.lng]);
    const poly = window.L.polygon(latlngs, {
      color: selectedZone.color || '#A72C32',
      fillColor: selectedZone.color || '#A72C32',
      fillOpacity: 0.14,
      weight: 2.5,
      opacity: 0.85,
    });
    poly.addTo(map);
    polygonRef.current = poly;
    try {
      const bounds = poly.getBounds();
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [60, 60], maxZoom: 14 });
    } catch {}
  }, [selectedZone]);

  // Update device markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;
    markersRef.current.forEach(m => { try { map.removeLayer(m); } catch {} });
    markersRef.current = [];

    const withCoords = devices.filter(d => d.latitude != null && d.longitude != null);
    withCoords.forEach(device => {
      const pinColor = device.isOnline ? '#22c55e' : '#ef4444';
      const iconHtml = `<div style="width:28px;height:28px;filter:drop-shadow(0 2px 4px rgba(0,0,0,.5));"><svg viewBox="0 0 24 24" fill="${pinColor}" width="28" height="28"><path d="M14,10a2,2,0,1,1-2-2A2.006,2.006,0,0,1,14,10Zm5.5,0c0,6.08-4.67,9.89-6.67,11.24a1.407,1.407,0,0,1-.83.26,1.459,1.459,0,0,1-.84-.26C9.16,19.89,4.5,16.09,4.5,10A7.33,7.33,0,0,1,12,2.5,7.336,7.336,0,0,1,19.5,10ZM16,10a4,4,0,1,0-4,4A4,4,0,0,0,16,10Z"/></svg></div>`;
      const icon = window.L.divIcon({ html: iconHtml, className: '', iconSize: [28, 28], iconAnchor: [14, 26], popupAnchor: [0, -24] });
      const marker = window.L.marker([device.latitude, device.longitude], { icon }).addTo(map);
      marker.bindPopup(`<div style="font-family:sans-serif;padding:4px;min-width:140px;"><div style="font-weight:700;font-size:13px;color:#f9fafb;">${device.name || device.sn}</div><div style="font-size:11px;color:#9ca3af;margin-top:2px;">${device.assignedUser || 'Unassigned'}</div></div>`);
      markersRef.current.push(marker);
    });
  }, [devices]);

  return (
    <div style={{ flex: '1 1 0', minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {!selectedZone && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 10,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(14,14,14,0.70)', backdropFilter: 'blur(4px)',
          gap: 10, pointerEvents: 'none',
        }}>
          <MapPin style={{ width: 32, height: 32, color: 'rgba(255,255,255,0.20)' }} />
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', fontWeight: 600 }}>Select a zone to focus the map</span>
        </div>
      )}
      <div ref={mapContainerRef} id="fsd-map" className="fsd-map-container" />
    </div>
  );
}

// ─── Small KPI Card ───────────────────────────────────────────────────────────
function KPIChip({ label, value, color, icon: Icon }) {
  return (
    <div style={{
      background: `${color}0D`, border: `1px solid ${color}28`,
      borderRadius: 12, padding: '12px 14px',
      display: 'flex', flexDirection: 'column', gap: 6, flex: 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ width: 24, height: 24, borderRadius: 6, background: `${color}1A`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon style={{ width: 12, height: 12, color }} />
        </div>
        <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.40)', textTransform: 'uppercase', letterSpacing: '0.09em' }}>{label}</span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.02em', lineHeight: 1 }}>{value}</div>
    </div>
  );
}

// ─── Zone Info Panel ──────────────────────────────────────────────────────────
function ZoneInfoPanel({ zone, stats, devices, loading, date }) {
  const deviceMap = useMemo(() => {
    const m = {};
    devices.forEach(d => { m[d.sn] = d; });
    return m;
  }, [devices]);

  const allSns      = zone?.device_sns || [];
  const donutData   = [
    { name: 'Visited',     value: Math.max(stats.visited,    0) },
    { name: 'Not Visited', value: Math.max(stats.notVisited, 0) },
  ];
  const DONUT_COLORS = ['#4ade80', '#1f2937'];
  const pctColor = stats.pct >= 70 ? '#4ade80' : stats.pct >= 40 ? '#FBBF24' : '#f87171';

  const PANEL = {
    background: '#1a1a1a',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 16,
    boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
    display: 'flex', flexDirection: 'column',
    height: '100%', overflow: 'hidden',
  };

  if (!zone) {
    return (
      <div style={{ ...PANEL, alignItems: 'center', justifyContent: 'center', gap: 14 }}>
        <MapPin style={{ width: 40, height: 40, color: 'rgba(255,255,255,0.10)' }} />
        <p style={{ color: 'rgba(255,255,255,0.28)', fontSize: 13, margin: 0, textAlign: 'center', maxWidth: 180, lineHeight: 1.5 }}>
          Select a zone above to view visit analytics
        </p>
      </div>
    );
  }

  return (
    <div style={PANEL}>

      {/* ── Zone identity header ── */}
      <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.01em', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{zone.name}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)', marginTop: 5, display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: zone.color || '#A72C32', display: 'inline-block', flexShrink: 0 }} />
              <span>TPL TRAKKER</span>
              <span style={{ opacity: 0.35 }}>·</span>
              <span>{allSns.length} device{allSns.length !== 1 ? 's' : ''} assigned</span>
              {date && <><span style={{ opacity: 0.35 }}>·</span><span>{date}</span></>}
            </div>
          </div>
          {loading && (
            <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.12)', borderTopColor: '#A72C32', animation: 'spin 0.8s linear infinite', flexShrink: 0, marginTop: 2 }} />
          )}
        </div>
      </div>

      {/* ── KPI chips ── */}
      <div style={{ padding: '14px 20px 0', display: 'flex', gap: 10, flexShrink: 0 }}>
        <KPIChip label="Total Assigned" value={allSns.length} color="#60A5FA" icon={Users} />
        <KPIChip label="Visited"        value={loading ? '—' : stats.visited}    color="#4ade80"  icon={CheckCircle} />
        <KPIChip label="Not Visited"    value={loading ? '—' : stats.notVisited} color="#f87171"  icon={XCircle} />
      </div>

      {/* ── Donut + Visit Rate ── */}
      <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 20, flexShrink: 0 }}>
        {/* Donut */}
        <div style={{ position: 'relative', width: 96, height: 96, flexShrink: 0 }}>
          <ResponsiveContainer width={96} height={96}>
            <PieChart>
              <Pie
                data={donutData} dataKey="value" cx="50%" cy="50%"
                innerRadius={28} outerRadius={44}
                strokeWidth={0} startAngle={90} endAngle={-270}
                isAnimationActive={!loading}
              >
                {donutData.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i]} />)}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0];
                  return (
                    <div style={{ background: '#161616', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 8, padding: '6px 10px', fontSize: 11 }}>
                      <span style={{ color: '#fff', fontWeight: 700 }}>{p.name}: {p.value}</span>
                    </div>
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          {/* Centre label */}
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: pctColor }}>
              {loading ? '—' : `${stats.pct}%`}
            </span>
          </div>
        </div>

        {/* Visit rate detail */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.10em', marginBottom: 6 }}>Visit Rate</div>
          <div style={{ fontSize: 42, fontWeight: 800, lineHeight: 1, color: pctColor, letterSpacing: '-0.03em' }}>
            {loading ? '—' : `${stats.pct}%`}
          </div>
          <div style={{ marginTop: 10, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${stats.pct}%`, background: pctColor, borderRadius: 3, transition: 'width 0.6s ease' }} />
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', marginTop: 5 }}>
            {stats.pct >= 70 ? 'Excellent compliance' : stats.pct >= 40 ? 'Needs improvement' : allSns.length === 0 ? 'No devices assigned' : 'Low compliance'}
          </div>
        </div>
      </div>

      {/* ── Device visit list ── */}
      <div style={{ flex: 1, overflowY: 'auto', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ padding: '10px 20px 6px', fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.30)', textTransform: 'uppercase', letterSpacing: '0.10em' }}>
          Device Visit Log · {date || 'Today'}
        </div>

        {allSns.length === 0 ? (
          <div style={{ padding: '28px 20px', textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: 12 }}>
            No devices assigned to this zone
          </div>
        ) : allSns.map(sn => {
          const dev     = deviceMap[sn];
          const visited = stats.visitedSns.has(sn);
          return (
            <div
              key={sn}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 20px', borderBottom: '1px solid rgba(255,255,255,0.03)', transition: 'background 0.12s' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.025)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: visited ? '#4ade80' : '#1f2937', flexShrink: 0, border: `1px solid ${visited ? 'rgba(74,222,128,0.5)' : 'rgba(255,255,255,0.12)'}` }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#FFFFFF', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {dev?.name || sn}
                </div>
                {dev?.assignedUser && (
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.32)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dev.assignedUser}</div>
                )}
              </div>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '2px 9px', borderRadius: 5, flexShrink: 0,
                background: visited ? 'rgba(74,222,128,0.10)' : 'rgba(31,41,55,0.80)',
                color:      visited ? '#4ade80'               : 'rgba(255,255,255,0.28)',
                border:     `1px solid ${visited ? 'rgba(74,222,128,0.22)' : 'rgba(255,255,255,0.06)'}`,
              }}>
                {visited ? '✓ Visited' : '✗ Not visited'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function FieldStaffDashboard() {
  const mapContainerRef = useRef(null);
  const { zones }       = useZoneCache();
  const { devices }     = useFieldStaffCache();
  const { accessToken } = useAuth();

  const [selectedZoneId, setSelectedZoneId] = useState('');
  const [selectedDate,   setSelectedDate]   = useState(todayStr());
  const [zoneTracks,     setZoneTracks]     = useState([]);
  const [tracksLoading,  setTracksLoading]  = useState(false);
  const fetchTagRef = useRef(null);

  const selectedZone = useMemo(
    () => zones.find(z => z.zone_id === selectedZoneId) || null,
    [zones, selectedZoneId]
  );

  // Devices assigned to selected zone (for map markers)
  const zoneDevices = useMemo(() => {
    if (!selectedZone) return [];
    const sns = new Set(selectedZone.device_sns || []);
    return devices.filter(d => sns.has(d.sn));
  }, [selectedZone, devices]);

  const fetchTracks = useCallback(async () => {
    if (!selectedZoneId || !selectedDate || !accessToken) return;
    const tag = `${selectedZoneId}:${selectedDate}`;
    fetchTagRef.current = tag;
    setTracksLoading(true);
    setZoneTracks([]);
    try {
      const start = encodeURIComponent(`${selectedDate}T00:00:00`);
      const end   = encodeURIComponent(`${selectedDate}T23:59:59`);
      const res   = await fetch(
        `${API_BASE_URL}/api/geofence/tracks/${encodeURIComponent(selectedZoneId)}?start=${start}&end=${end}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!res.ok) return;
      const data = await res.json();
      if (fetchTagRef.current !== tag) return;
      setZoneTracks(data?.devices || data || []);
    } catch {}
    finally { if (fetchTagRef.current === tag) setTracksLoading(false); }
  }, [selectedZoneId, selectedDate, accessToken]);

  useEffect(() => { fetchTracks(); }, [fetchTracks]);

  const stats = useMemo(() => {
    const allSns     = selectedZone?.device_sns || [];
    const visitedSns = new Set(
      zoneTracks.filter(t => (t.insidePoints?.length ?? t.inside_points?.length ?? 0) > 0).map(t => t.sn)
    );
    const visited    = allSns.filter(sn => visitedSns.has(sn)).length;
    const notVisited = allSns.length - visited;
    const pct        = allSns.length > 0 ? Math.round((visited / allSns.length) * 100) : 0;
    return { total: allSns.length, visited, notVisited, pct, visitedSns };
  }, [selectedZone, zoneTracks]);

  const { kmlZones, userZones } = useMemo(() => ({
    kmlZones:  zones.filter(z => !z.isUserZone),
    userZones: zones.filter(z =>  z.isUserZone),
  }), [zones]);

  return (
    <div className="fsd-dashboard">

      {/* ── Header ── */}
      <div className="fsd-header">
        <div className="fsd-header-left">
          <div className="fsd-header-text">
            <h1 className="fsd-title">Field Staff Dashboard</h1>
            <p className="fsd-subtitle">Zone visit compliance monitoring</p>
          </div>
        </div>

        <div className="fsd-filters-bar" style={{ alignItems: 'flex-end', gap: 12 }}>

          {/* Zone selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.40)', textTransform: 'uppercase', letterSpacing: '0.09em' }}>Zone</label>
            <ZoneDropdown
              value={selectedZoneId}
              onChange={setSelectedZoneId}
              kmlZones={kmlZones}
              userZones={userZones}
            />
          </div>

          {/* Date picker */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.40)', textTransform: 'uppercase', letterSpacing: '0.09em' }}>Date</label>
            <input
              type="date"
              value={selectedDate}
              max={todayStr()}
              onChange={e => setSelectedDate(e.target.value)}
              onClick={e => { try { e.target.showPicker(); } catch {} }}
              style={{
                height: 36, padding: '0 12px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                color: '#FFFFFF', cursor: 'pointer', outline: 'none',
              }}
            />
          </div>

          {/* Refresh button */}
          {selectedZoneId && (
            <button
              onClick={fetchTracks}
              disabled={tracksLoading}
              title="Refresh"
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 36, height: 36, borderRadius: 8, alignSelf: 'flex-end',
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)',
                color: '#FFFFFF', cursor: tracksLoading ? 'not-allowed' : 'pointer',
                opacity: tracksLoading ? 0.50 : 0.85, transition: 'all 0.12s', flexShrink: 0,
              }}
            >
              <RefreshCw style={{ width: 14, height: 14, animation: tracksLoading ? 'spin 1s linear infinite' : 'none' }} />
            </button>
          )}
        </div>
      </div>

      {/* ── Split layout ── */}
      <div className="fsd-top-layout" style={{ flex: 1, minHeight: 0 }}>

        {/* Left: Map */}
        <div className="fsd-map-card">
          <MapSection
            devices={zoneDevices}
            selectedZone={selectedZone}
            mapContainerRef={mapContainerRef}
          />
        </div>

        {/* Right: Zone info panel */}
        <div className="fsd-side-cards" style={{ display: 'flex', flexDirection: 'column' }}>
          <ZoneInfoPanel
            zone={selectedZone}
            stats={stats}
            devices={devices}
            loading={tracksLoading}
            date={selectedDate}
          />
        </div>

      </div>

    </div>
  );
}
