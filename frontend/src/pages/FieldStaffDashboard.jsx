import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { RefreshCw, MapPin, Users, CheckCircle, XCircle, ChevronDown } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { useZoneCache } from '../context/ZoneCacheContext.jsx';
import { useFieldStaffCache } from '../context/FieldStaffCacheContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import loadTPLMaps from '../components/loadTPLMaps.js';
import { landmarkFromPoint, clientReverseGeocode } from '../utils/landmark.js';
import { frameBounds } from '../utils/frameBounds.js';
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
    padding: '0.5625em 0.875em', fontSize: '0.8125em', fontWeight: 600, cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: '0.5625em',
    color:      active ? '#FFFFFF' : 'rgba(255,255,255,0.72)',
    background: active ? 'rgba(167,44,50,0.18)' : 'transparent',
    transition: 'background 0.1s',
  });

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          height: '2.75em', padding: '0 0.875em', borderRadius: '0.5em', fontSize: '0.9375em', fontWeight: 600,
          background: '#1a1a1a', border: `1px solid ${open ? 'rgba(167,44,50,0.55)' : 'rgba(255,255,255,0.12)'}`,
          color: selected ? '#FFFFFF' : 'rgba(255,255,255,0.38)',
          cursor: 'pointer', outline: 'none', minWidth: '15em',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.625em',
          transition: 'border-color 0.15s',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5em', overflow: 'hidden' }}>
          {selected && <span style={{ width: '0.375em', height: '0.375em', borderRadius: '50%', background: selected.color || '#A72C32', flexShrink: 0 }} />}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {selected?.name || '— Select a zone —'}
          </span>
        </span>
        <ChevronDown style={{ width: '0.75em', height: '0.75em', color: 'rgba(255,255,255,0.40)', flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          background: '#1a1a1a', border: '0.0625em solid rgba(255,255,255,0.12)',
          borderRadius: '0.5em', zIndex: 9999,
          boxShadow: '0 0.5em 2em rgba(0,0,0,0.70)',
          maxHeight: '17.5em', overflowY: 'auto',
        }}>
          <div
            onClick={() => { onChange(''); setOpen(false); }}
            style={{ ...ITEM_STYLE(false), color: 'rgba(255,255,255,0.30)', borderBottom: '1px solid rgba(255,255,255,0.07)', fontSize: '0.75em' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            — Select a zone —
          </div>

          {kmlZones.length > 0 && (
            <>
              <div style={{ padding: '0.4375em 0.875em 0.1875em', fontSize: '0.5625em', fontWeight: 700, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.10em' }}>KML Zones</div>
              {kmlZones.map(z => (
                <div key={z.zone_id}
                  onClick={() => { onChange(z.zone_id); setOpen(false); }}
                  style={ITEM_STYLE(z.zone_id === value)}
                  onMouseEnter={e => { if (z.zone_id !== value) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = z.zone_id === value ? 'rgba(167,44,50,0.18)' : 'transparent'; }}
                >
                  <span style={{ width: '0.375em', height: '0.375em', borderRadius: '50%', background: z.color || '#A72C32', flexShrink: 0 }} />
                  {z.name}
                </div>
              ))}
            </>
          )}

          {userZones.length > 0 && (
            <>
              <div style={{ padding: '0.4375em 0.875em 0.1875em', fontSize: '0.5625em', fontWeight: 700, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.10em', borderTop: kmlZones.length > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none', marginTop: kmlZones.length > 0 ? 4 : 0 }}>Custom Zones</div>
              {userZones.map(z => (
                <div key={z.zone_id}
                  onClick={() => { onChange(z.zone_id); setOpen(false); }}
                  style={ITEM_STYLE(z.zone_id === value)}
                  onMouseEnter={e => { if (z.zone_id !== value) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = z.zone_id === value ? 'rgba(167,44,50,0.18)' : 'transparent'; }}
                >
                  <span style={{ width: '0.375em', height: '0.375em', borderRadius: '50%', background: z.color || '#A72C32', flexShrink: 0 }} />
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
function MapSection({ devices, selectedZone, mapContainerRef, accessToken }) {
  const mapRef      = useRef(null);
  const markersRef  = useRef([]);
  const polygonRef  = useRef(null);
  const mapReadyRef = useRef(false);
  const geoCacheRef = useRef({});

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
      if (bounds.isValid()) frameBounds(map, bounds, { padding: [60, 60], maxZoom: 14 });
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
      const outerColor = device.isOnline ? '#14532d' : '#8B0000';
      const innerColor = device.isOnline ? '#22c55e' : '#E8192C';
      const iconHtml = `<div style="position:relative;display:flex;flex-direction:column;align-items:center;width: '1.875em'px;height: '3em'px;"><div style="width: '1.625em'px;height: '1.625em'px;border-radius:50%;flex-shrink:0;background:${outerColor};display:flex;align-items:center;justify-content:center;box-shadow:0 3px 8px rgba(0,0,0,0.45);"><div style="width: '1em'px;height: '1em'px;border-radius:50%;background:${innerColor};"></div></div><div style="width: '0.25em'px;height: '1.125em'px;flex-shrink:0;background:#3d3d3d;border-radius:0 0 3px 3px;"></div><div style="position:absolute;bottom:0;left:50%;transform:translateX(-50%);width: '1em'px;height: '0.375em'px;border-radius:50%;background:rgba(0,0,0,0.18);"></div></div>`;
      const icon = window.L.divIcon({ html: iconHtml, className: '', iconSize: [30, 48], iconAnchor: [15, 42], popupAnchor: [0, -44] });
      const marker = window.L.marker([device.latitude, device.longitude], { icon }).addTo(map);

      const buildPopup = (addr) =>
        `<div style="font-family:sans-serif;padding: '0.25em'px 2px;min-width: '10em'px;max-width: '13.75em'px;">` +
        `<div style="font-weight:700;font-size:13px;color:#f9fafb;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${device.name || device.sn}</div>` +
        `<div style="font-size:11px;color:#9ca3af;margin-top:2px;">${device.assignedUser || 'Unassigned'}</div>` +
        (addr
          ? `<div style="font-size:10px;color:#86efac;margin-top:4px;line-height: '0.0875em';">${addr}</div>`
          : `<div style="font-size:10px;color:rgba(255,255,255,0.25);margin-top:4px;">Loading address…</div>`) +
        `</div>`;

      marker.bindPopup(buildPopup(geoCacheRef.current[device.sn]));

      marker.on('popupopen', async () => {
        if (geoCacheRef.current[device.sn]) return;
        try {
          // 1. Stored landmark on the device record (set by backend on ingest)
          let addr = landmarkFromPoint(device);
          // 2. Client-side TPL Maps pipeline (landmark.js)
          if (!addr) addr = await clientReverseGeocode(device.latitude, device.longitude);
          // 3. Backend /api/geocode as last resort
          if (!addr && accessToken) {
            const res = await fetch(
              `${API_BASE_URL}/api/geocode?lat=${device.latitude}&lng=${device.longitude}`,
              { headers: { Authorization: `Bearer ${accessToken}` } }
            );
            if (res.ok) {
              const data = await res.json();
              addr = data.landmark || null;
            }
          }
          if (addr) {
            geoCacheRef.current[device.sn] = addr;
            marker.getPopup()?.setContent(buildPopup(addr));
          }
        } catch {}
      });

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
          gap: '0.625em', pointerEvents: 'none',
        }}>
          <MapPin style={{ width: '2em', height: '2em', color: 'rgba(255,255,255,0.20)' }} />
          <span style={{ fontSize: '0.8125em', color: 'rgba(255,255,255,0.35)', fontWeight: 600 }}>Select a zone to focus the map</span>
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
      borderRadius: '0.875em', padding: '1em',
      display: 'flex', flexDirection: 'column', gap: '0.5em', flex: 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5em' }}>
        <div style={{ width: '1.75em', height: '1.75em', borderRadius: '0.375em', background: `${color}1A`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon style={{ width: '0.875em', height: '0.875em', color }} />
        </div>
        <span style={{ fontSize: '0.625em', fontWeight: 700, color: 'rgba(255,255,255,0.40)', textTransform: 'uppercase', letterSpacing: '0.09em' }}>{label}</span>
      </div>
      <div style={{ fontSize: '2em', fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.02em', lineHeight: 1 }}>{value}</div>
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
    border: '0.0625em solid rgba(255,255,255,0.07)',
    borderRadius: '1em',
    boxShadow: '0 0.25em 1.5em rgba(0,0,0,0.4)',
    display: 'flex', flexDirection: 'column',
    height: '100%', overflow: 'hidden',
  };

  if (!zone) {
    return (
      <div style={{ ...PANEL, alignItems: 'center', justifyContent: 'center', gap: '0.875em' }}>
        <MapPin style={{ width: '2.5em', height: '2.5em', color: 'rgba(255,255,255,0.10)' }} />
        <p style={{ color: 'rgba(255,255,255,0.28)', fontSize: '0.8125em', margin: 0, textAlign: 'center', maxWidth: '11.25em', lineHeight: 1.5 }}>
          Select a zone above to view visit analytics
        </p>
      </div>
    );
  }

  return (
    <div style={PANEL}>

      {/* ── Zone identity header ── */}
      <div style={{ padding: '1.5em 1.5em 1.25em', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.625em' }}>
          <div>
            <div style={{ fontSize: '1.25em', fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.01em', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{zone.name}</div>
            <div style={{ fontSize: '0.75em', color: 'rgba(255,255,255,0.38)', marginTop: '0.375em', display: 'flex', alignItems: 'center', gap: '0.5em', flexWrap: 'wrap' }}>
              <span style={{ width: '0.5em', height: '0.5em', borderRadius: '50%', background: zone.color || '#A72C32', display: 'inline-block', flexShrink: 0 }} />
              <span style={{ fontWeight: 600 }}>TPL TRAKKER</span>
              <span style={{ opacity: 0.35 }}>·</span>
              <span>{allSns.length} device{allSns.length !== 1 ? 's' : ''} assigned</span>
              {date && <><span style={{ opacity: 0.35 }}>·</span><span>{date}</span></>}
            </div>
          </div>
          {loading && (
            <div style={{ width: '1.5em', height: '1.5em', borderRadius: '50%', border: '0.125em solid rgba(255,255,255,0.12)', borderTopColor: '#A72C32', animation: 'spin 0.8s linear infinite', flexShrink: 0, marginTop: '0.125em' }} />
          )}
        </div>
      </div>

      {/* ── KPI chips ── */}
      <div style={{ padding: '1.25em 1.5em 0', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.875em', flexShrink: 0 }}>
        <KPIChip label="Assigned" value={allSns.length} color="#60A5FA" icon={Users} />
        <KPIChip label="Visited"  value={loading ? '—' : stats.visited}    color="#4ade80"  icon={CheckCircle} />
        <KPIChip label="Missed"   value={loading ? '—' : stats.notVisited} color="#f87171"  icon={XCircle} />
      </div>

      {/* ── Donut + Visit Rate ── */}
      <div style={{ 
        padding: '1.25em 1.5em', 
        display: 'flex', alignItems: 'center', gap: '2em', flexShrink: 0,
        margin: '1.25em 1.5em', background: 'rgba(255,255,255,0.02)',
        borderRadius: '0.875em', border: '1px solid rgba(255,255,255,0.04)'
      }}>
        {/* Donut */}
        <div style={{ position: 'relative', width: '9em', height: '9em', flexShrink: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={donutData} dataKey="value" cx="50%" cy="50%"
                innerRadius="70%" outerRadius="100%"
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
                    <div style={{ background: '#161616', border: '0.0625em solid rgba(255,255,255,0.10)', borderRadius: '0.5em', padding: '0.375em 0.625em', fontSize: '0.6875em' }}>
                      <span style={{ color: '#fff', fontWeight: 700 }}>{p.name}: {p.value}</span>
                    </div>
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          {/* Centre label */}
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <span style={{ fontSize: '1.25em', fontWeight: 800, color: pctColor }}>
              {loading ? '—' : `${stats.pct}%`}
            </span>
          </div>
        </div>

        {/* Visit rate detail */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '0.625em', fontWeight: 700, color: 'rgba(255,255,255,0.40)', textTransform: 'uppercase', letterSpacing: '0.10em', marginBottom: '0.5em' }}>Compliance Score</div>
          <div style={{ fontSize: '3em', fontWeight: 800, lineHeight: 1, color: pctColor, letterSpacing: '-0.03em' }}>
            {loading ? '—' : `${stats.pct}%`}
          </div>
          <div style={{ marginTop: '0.875em', height: '0.375em', borderRadius: '0.1875em', background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${stats.pct}%`, background: pctColor, borderRadius: '0.1875em', transition: 'width 0.6s ease' }} />
          </div>
          <div style={{ fontSize: '0.75em', fontWeight: 500, color: 'rgba(255,255,255,0.35)', marginTop: '0.625em' }}>
            {stats.pct >= 70 ? 'Excellent compliance target met' : stats.pct >= 40 ? 'Compliance needs improvement' : allSns.length === 0 ? 'No devices assigned to zone' : 'Critical low compliance alert'}
          </div>
        </div>
      </div>

      {/* ── Device visit list ── */}
      <div style={{ flex: 1, overflowY: 'auto', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ padding: '1em 1.5em 0.5em', fontSize: '0.625em', fontWeight: 700, color: 'rgba(255,255,255,0.40)', textTransform: 'uppercase', letterSpacing: '0.10em' }}>
          Device Visit Log · {date || 'Today'}
        </div>

        {allSns.length === 0 ? (
          <div style={{ padding: '2em 1.5em', textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: '0.8125em' }}>
            No devices assigned to this zone
          </div>
        ) : allSns.map(sn => {
          const dev     = deviceMap[sn];
          const visited = stats.visitedSns.has(sn);
          return (
            <div
              key={sn}
              style={{ display: 'flex', alignItems: 'center', gap: '0.875em', padding: '0.75em 1.5em', borderBottom: '1px solid rgba(255,255,255,0.03)', transition: 'background 0.12s' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.025)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span style={{ width: '0.5em', height: '0.5em', borderRadius: '50%', background: visited ? '#4ade80' : '#1f2937', flexShrink: 0, border: `1px solid ${visited ? 'rgba(74,222,128,0.5)' : 'rgba(255,255,255,0.12)'}` }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.875em', fontWeight: 600, color: '#FFFFFF', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {dev?.name || sn}
                </div>
                {dev?.assignedUser && (
                  <div style={{ fontSize: '0.6875em', color: 'rgba(255,255,255,0.40)', marginTop: '0.125em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dev.assignedUser}</div>
                )}
              </div>
              <span style={{
                fontSize: '0.6875em', fontWeight: 700, padding: '0.25em 0.75em', borderRadius: '0.375em', flexShrink: 0,
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
            <h1 className="fsd-title">Field Staff Analytics</h1>
            <p className="fsd-subtitle">Zone visit compliance monitoring</p>
          </div>
        </div>

        <div className="fsd-filters-bar" style={{ alignItems: 'flex-end', gap: '0.75em' }}>

          {/* Zone selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3125em' }}>
            <label style={{ fontSize: '0.6875em', fontWeight: 700, color: 'rgba(255,255,255,0.40)', textTransform: 'uppercase', letterSpacing: '0.09em' }}>Zone</label>
            <ZoneDropdown
              value={selectedZoneId}
              onChange={setSelectedZoneId}
              kmlZones={kmlZones}
              userZones={userZones}
            />
          </div>

          {/* Date picker */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3125em' }}>
            <label style={{ fontSize: '0.6875em', fontWeight: 700, color: 'rgba(255,255,255,0.40)', textTransform: 'uppercase', letterSpacing: '0.09em' }}>Date</label>
            <input
              type="date"
              value={selectedDate}
              max={todayStr()}
              onChange={e => setSelectedDate(e.target.value)}
              onClick={e => { try { e.target.showPicker(); } catch {} }}
              style={{
                height: '2.75em', padding: '0 0.875em', borderRadius: '0.5em', fontSize: '0.9375em', fontWeight: 600,
                background: 'rgba(255,255,255,0.05)', border: '0.0625em solid rgba(255,255,255,0.12)',
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
                width: '2.75em', height: '2.75em', borderRadius: '0.5em', alignSelf: 'flex-end',
                background: 'rgba(255,255,255,0.04)', border: '0.0625em solid rgba(255,255,255,0.10)',
                color: '#FFFFFF', cursor: tracksLoading ? 'not-allowed' : 'pointer',
                opacity: tracksLoading ? 0.50 : 0.85, transition: 'all 0.12s', flexShrink: 0,
              }}
            >
              <RefreshCw style={{ width: '1.125em', height: '1.125em', animation: tracksLoading ? 'spin 1s linear infinite' : 'none' }} />
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
            accessToken={accessToken}
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
