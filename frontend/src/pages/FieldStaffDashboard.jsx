import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  MapPin, ChevronDown, ChevronRight, AlertTriangleIcon, LogOut,
  UserX, X, ShieldCheck, Smartphone,
} from 'lucide-react';
import { useZoneCache } from '../context/ZoneCacheContext.jsx';
import { useDeviceCache } from '../context/DeviceCacheContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useAlerts } from '../context/AlertsContext.jsx';
import loadTPLMaps from '../components/loadTPLMaps.js';
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription,
  DrawerBody, DrawerFooter, DrawerClose,
} from '../components/ui/Drawer.jsx';
import ZonePresenceChart from '../components/charts/ZonePresenceChart.jsx';
import { buildDeviceColorMap, pointInPolygon } from '../utils/zonePolygonManager.js';
import { frameBounds } from '../utils/frameBounds.js';
import {
  absenceAlert, sortAlerts, humanDuration,
  ALERT_KIND, MISSING_THRESHOLD_MS, ONLINE_THRESHOLD_MS,
} from '../utils/zoneAlerts.js';
import { useDeviceUpdates, emitDevicesUpdated } from '../utils/deviceEvents.js';
import './FieldStaffDashboard.css';
import './FieldStaffLive.css';

const API_BASE_URL = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_BASE_URL || '');

const REFRESH_MS = 10 * 60 * 1000;   // silent live refresh
const TOAST_EXIT_MS = 200;           // must match the .fsd-toast exit animation
const MISSING_HOURS = Math.round(MISSING_THRESHOLD_MS / 3_600_000);

const pad2 = (n) => String(n).padStart(2, '0');

// Stored timestamps are naive Pakistan wall-clock — send the window the same way.
function naiveLocal(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T` +
         `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function tsMs(v) {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
}

function fmtClock(v) {
  const t = tsMs(v);
  if (t === null) return '—';
  return new Date(t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
}

// ─── Zone dropdown ────────────────────────────────────────────────────────────
function ZoneDropdown({ value, onChange, zones }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const selected = zones.find(z => z.zone_id === value);

  const ITEM = (active) => ({
    padding: '0.5625em 0.875em', fontSize: '0.8125em', fontWeight: 600, cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: '0.5625em',
    color: active ? '#FFFFFF' : 'rgba(255,255,255,0.72)',
    background: active ? 'rgba(167,44,50,0.18)' : 'transparent',
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
          background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: '0.5em', zIndex: 9999, boxShadow: '0 0.5em 2em rgba(0,0,0,0.70)',
          maxHeight: '17.5em', overflowY: 'auto',
        }}>
          <div
            onClick={() => { onChange(''); setOpen(false); }}
            style={{ ...ITEM(false), color: 'rgba(255,255,255,0.30)', borderBottom: '1px solid rgba(255,255,255,0.07)', fontSize: '0.75em' }}
          >— Select a zone —</div>
          {zones.map(z => (
            <div key={z.zone_id}
              onClick={() => { onChange(z.zone_id); setOpen(false); }}
              style={ITEM(z.zone_id === value)}
              onMouseEnter={e => { if (z.zone_id !== value) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = z.zone_id === value ? 'rgba(167,44,50,0.18)' : 'transparent'; }}
            >
              <span style={{ width: '0.375em', height: '0.375em', borderRadius: '50%', background: z.color || '#A72C32', flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{z.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Floating alert banner ────────────────────────────────────────────────────
const ALERT_ICON = {
  [ALERT_KIND.MISSING]: UserX,
  [ALERT_KIND.NO_SHOW]: AlertTriangleIcon,
};

/**
 * Floating alert banner — strictly one at a time.
 *
 * The banner never sits in the page flow: it would push the map and panel out
 * of a fit-to-screen layout. It floats over the bottom-right corner instead,
 * above the header's stacking context — when it shared the top strip with the
 * header, the header swallowed the clicks and the topmost banner could not be
 * dismissed at all.
 *
 * Only alerts[0] is rendered. Dismissing it plays the exit animation, hands the
 * alert back to the page (which marks it read so it can't return this session),
 * and the next one in the queue slides in behind it.
 */
function AlertToasts({ alerts, onDismiss, onDismissAll }) {
  const [leavingId, setLeavingId] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const current = alerts[0] || null;

  const close = useCallback(() => {
    if (!current || leavingId) return;
    setLeavingId(current.id);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setLeavingId(null);
      onDismiss(current);
    }, TOAST_EXIT_MS);
  }, [current, leavingId, onDismiss]);

  if (!current) return null;

  const Icon = ALERT_ICON[current.kind] || AlertTriangleIcon;
  const queued = alerts.length - 1;

  return (
    <div className="fsd-toast-layer" aria-live="polite" aria-label="Zone alerts">
      {/* Keyed so the next alert remounts and replays the entry animation. */}
      <div
        key={current.id}
        role="alert"
        className={`fsd-toast fsd-toast-${current.severity}${leavingId === current.id ? ' leaving' : ''}`}
      >
        <Icon className="fsd-toast-icon" />

        <div className="fsd-toast-body">
          <div className="fsd-toast-title">{current.title}</div>
          <div className="fsd-toast-desc">{current.description}</div>
        </div>

        {/* Both controls ride the title row, so a queue never adds a footer and
            the banner keeps the same height whether one alert is showing or
            twenty. The count lives in the button label rather than its own line. */}
        <div className="fsd-toast-actions">
          {queued > 0 && (
            <button
              className="fsd-toast-all"
              onClick={onDismissAll}
              title={`Dismiss all ${alerts.length} alerts`}
            >
              Dismiss all ({alerts.length})
            </button>
          )}
          <button
            className="fsd-toast-x"
            onClick={close}
            title="Dismiss"
            aria-label={`Dismiss alert: ${current.title}`}
          >
            <X className="fsd-toast-x-icon" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Map ──────────────────────────────────────────────────────────────────────
function MapSection({ staff, selectedZone, onSelectStaff }) {
  const mapRef      = useRef(null);
  const containerRef = useRef(null);
  const layersRef   = useRef([]);
  const polygonRef  = useRef(null);
  const readyRef    = useRef(false);
  const framedZoneRef = useRef(null);

  useEffect(() => {
    const cancelLoad = loadTPLMaps(() => {
      if (mapRef.current || !document.getElementById('fsd-map')) return;
      const map = window.TPLMaps.map.initMap({
        divID: 'fsd-map', lat: 31.5204, lng: 74.3587, zoom: 10, showZoomControl: true,
      });
      map.scrollWheelZoom?.enable();
      mapRef.current = map;
      readyRef.current = true;
      requestAnimationFrame(() => map.invalidateSize?.({ animate: false }));
    });
    return () => {
      cancelLoad();
      layersRef.current.forEach(l => { try { mapRef.current?.removeLayer(l); } catch {} });
      layersRef.current = [];
      if (polygonRef.current) { try { mapRef.current?.removeLayer(polygonRef.current); } catch {} }
      polygonRef.current = null;
      mapRef.current?.remove?.();
      mapRef.current = null;
      readyRef.current = false;
    };
  }, []);

  // Leaflet measures its container once, at init, and caches that size. The card
  // is a flex/grid cell whose width settles after the SDK has already loaded (and
  // changes again on window resize or a sidebar toggle), so without re-measuring
  // the map keeps painting at its old width and leaves dead space in the card.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;

    let frame = null;
    const resize = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = null;
        if (readyRef.current) mapRef.current?.invalidateSize?.({ animate: false });
      });
    };

    const ro = new ResizeObserver(resize);
    ro.observe(el);
    window.addEventListener('resize', resize);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      ro.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, []);

  // Zone polygon — only re-frames when the zone actually changes, so the live
  // refresh never yanks the map away from wherever the operator panned it.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    if (polygonRef.current) { try { map.removeLayer(polygonRef.current); } catch {} polygonRef.current = null; }
    if (!selectedZone) { framedZoneRef.current = null; return; }

    const coords = selectedZone.coordinates || selectedZone.polygon || [];
    if (!coords.length) return;

    const poly = window.L.polygon(coords.map(c => [c.lat, c.lng]), {
      color: selectedZone.color || '#A72C32',
      fillColor: selectedZone.color || '#A72C32',
      fillOpacity: 0.12, weight: 2.5, opacity: 0.85,
    });
    poly.addTo(map);
    polygonRef.current = poly;

    if (framedZoneRef.current !== selectedZone.zone_id) {
      framedZoneRef.current = selectedZone.zone_id;
      try {
        const b = poly.getBounds();
        if (b.isValid()) frameBounds(map, b, { padding: [60, 60], maxZoom: 15 });
      } catch {}
    }
  }, [selectedZone]);

  // Live positions only — no trajectory lines. This page answers "who is on
  // site right now"; the historical path belongs to the playback page.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    layersRef.current.forEach(l => { try { map.removeLayer(l); } catch {} });
    layersRef.current = [];

    staff.forEach((s) => {
      s.devices.forEach((d) => {
        if (d.lat == null || d.lng == null) return;

        const ring = d.inZone ? '#22c55e' : d.missing ? '#ef4444' : '#f59e0b';
        const html =
          `<div style="position:relative;display:flex;align-items:center;justify-content:center;width:34px;height:34px;">` +
          `<div style="position:absolute;inset:0;border-radius:50%;border:2px solid ${ring};opacity:0.85;"></div>` +
          `<div style="width:18px;height:18px;border-radius:50%;background:${s.color};box-shadow:0 2px 8px rgba(0,0,0,0.55);border:2px solid #0d0d0d;"></div>` +
          `</div>`;
        const marker = window.L.marker([d.lat, d.lng], {
          icon: window.L.divIcon({ html, className: '', iconSize: [34, 34], iconAnchor: [17, 17] }),
        }).addTo(map);

        // Hover, not click — click is reserved for opening the staff drawer.
        marker.bindTooltip(
          `<div class="fsd-tip">` +
          `<div class="fsd-tip-name">${s.name}</div>` +
          `<div class="fsd-tip-sn">${d.sn}</div>` +
          `<div class="fsd-tip-status" style="color:${ring};">` +
          `${d.missing ? 'MISSING' : d.inZone ? 'IN ZONE' : 'OUT OF ZONE'}</div>` +
          `<div class="fsd-tip-meta">Last report ${fmtClock(d.lastReportAt)}</div>` +
          `</div>`,
          { direction: 'top', offset: [0, -16], opacity: 1, className: 'fsd-tip-wrap', sticky: false },
        );
        marker.on('click', () => onSelectStaff?.(s.key));
        layersRef.current.push(marker);
      });
    });
  }, [staff, onSelectStaff]);

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
          <span style={{ fontSize: '0.8125em', color: 'rgba(255,255,255,0.35)', fontWeight: 600 }}>
            Select a zone to begin live monitoring
          </span>
        </div>
      )}
      <div ref={containerRef} id="fsd-map" className="fsd-map-container" />
    </div>
  );
}

// ─── KPI chip ─────────────────────────────────────────────────────────────────
// The three chips are segments of one bordered bar (see .fsd-kpi-grid), so the
// chip itself carries no border or radius — only its tint.
function KPIChip({ label, value, color, icon: Icon }) {
  return (
    <div
      className="fsd-kpi"
      style={{ background: `linear-gradient(145deg, ${color}22 0%, ${color}0B 55%, transparent 100%)` }}
    >
      <div className="fsd-kpi-head">
        <span className="fsd-kpi-icon" style={{ background: `${color}1A`, borderColor: `${color}33` }}>
          <Icon style={{ width: '0.875em', height: '0.875em', color }} />
        </span>
        <span className="fsd-kpi-label">{label}</span>
      </div>
      <div className="fsd-kpi-value" style={{ color }}>{value}</div>
    </div>
  );
}

// ─── Staff roster row ─────────────────────────────────────────────────────────
// Three columns: who · what we last heard · current state. The whole row is the
// drawer's trigger, so the row is the <button> and everything inside it is a
// <span> (a button may only contain phrasing content, and nesting buttons is
// invalid). Below 1100px the meta stack drops to its own line — see the CSS.
function StaffRow({ staff, onSelect }) {
  const count = staff.devices.length;

  return (
    <button type="button" className="fsd-staff-row" onClick={() => onSelect(staff.key)}>
      <span className="fsd-staff-id">
        <span className="fsd-staff-dot" style={{ background: staff.color, boxShadow: `0 0 6px ${staff.color}99` }} />
        <span className="fsd-staff-name">
          {staff.name}
          {staff.unassigned && <span className="fsd-staff-tag">unassigned</span>}
        </span>
      </span>

      <span className="fsd-staff-meta">
        <span className="fsd-meta-line">
          <span className="fsd-meta-k">Last report:</span>
          <span className="fsd-meta-v">{fmtClock(staff.lastReportAt)}</span>
        </span>
        <span className="fsd-meta-line">
          <span className="fsd-meta-k">In zone:</span>
          <span className="fsd-meta-v">
            {staff.lastInZoneAt ? `${humanDuration(tsMs(staff.lastInZoneAt))} ago` : 'never'}
          </span>
        </span>
        <span className="fsd-meta-line">
          <Smartphone className="fsd-meta-icon" />
          <span className="fsd-meta-v">{count} device{count === 1 ? '' : 's'}</span>
        </span>
      </span>

      <span className="fsd-staff-status">
        <span className={`fsd-pill ${staff.missing ? 'fsd-pill-missing' : staff.inZone ? 'fsd-pill-in' : 'fsd-pill-out'}`}>
          {staff.missing ? 'MISSING' : staff.inZone ? 'IN ZONE' : 'OUT OF ZONE'}
        </span>
        <span className={`fsd-pill ${staff.online ? 'fsd-pill-online' : 'fsd-pill-offline'}`}>
          {staff.online ? 'ONLINE' : 'OFFLINE'}
        </span>
        <ChevronRight className="fsd-staff-caret" />
      </span>
    </button>
  );
}

// ─── Staff detail drawer ──────────────────────────────────────────────────────
function DrawerStat({ label, value, tone }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
      <div className="text-[0.6875rem] font-bold uppercase tracking-wider text-white/40">{label}</div>
      <div className="mt-1 text-xl font-extrabold leading-none" style={tone ? { color: tone } : undefined}>
        {value}
      </div>
    </div>
  );
}

function StaffDrawer({ staff, zone, dayKey, open, onOpenChange }) {
  if (!staff) return null;

  const statusTone = staff.missing ? '#f87171' : staff.inZone ? '#2dd4bf' : '#fb923c';
  const statusText = staff.missing ? 'Missing' : staff.inZone ? 'In zone' : 'Outside zone';

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <DrawerTitle>
                <span className="inline-flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: staff.color, boxShadow: `0 0 8px ${staff.color}99` }}
                  />
                  {staff.name}
                </span>
              </DrawerTitle>
              <DrawerDescription>
                {zone?.name} · {dayKey} · {staff.devices.length} device{staff.devices.length === 1 ? '' : 's'}
              </DrawerDescription>
            </div>
            <span
              className="shrink-0 rounded-full border px-2.5 py-1 text-xs font-bold"
              style={{ color: statusTone, borderColor: `${statusTone}55`, background: `${statusTone}1A` }}
            >
              {statusText}
            </span>
          </div>
        </DrawerHeader>

        <DrawerBody className="space-y-5">
          {/* In zone / out of zone, and nothing else — crossings were noise on a
              live monitor and the fence page already keeps the event log. */}
          <div className="grid grid-cols-3 gap-2.5">
            <DrawerStat label="In zone" value={staff.insideCount} tone="#2dd4bf" />
            <DrawerStat label="Outside" value={staff.outsideCount} tone="#fb923c" />
            <DrawerStat label="Status" value={staff.online ? 'Online' : 'Offline'} tone={staff.online ? '#4ade80' : '#9ca3af'} />
          </div>

          <div>
            <div className="mb-2 text-xs font-bold uppercase tracking-wider text-white/40">
              Zone presence by hour
            </div>
            <ZonePresenceChart data={staff.series} height={200} />
          </div>

          <div>
            <div className="mb-2 text-xs font-bold uppercase tracking-wider text-white/40">Devices</div>
            <div className="space-y-1.5">
              {staff.devices.map(d => (
                <div
                  key={d.sn}
                  className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-white/[0.03] px-3 py-2 text-sm"
                >
                  <span className="font-mono font-semibold text-white/80">{d.sn}</span>
                  <span
                    className="rounded-full px-2 text-xs font-bold"
                    style={{
                      color: d.missing ? '#f87171' : d.inZone ? '#2dd4bf' : '#fb923c',
                      background: `${d.missing ? '#f87171' : d.inZone ? '#2dd4bf' : '#fb923c'}22`,
                    }}
                  >
                    {d.missing ? 'missing' : d.inZone ? 'in zone' : 'outside'}
                  </span>
                  <span className="ml-auto text-xs text-white/45">
                    {d.insideCount} in / {d.outsideCount} out · {fmtClock(d.lastReportAt)}
                  </span>
                </div>
              ))}
            </div>
          </div>

        </DrawerBody>

        <DrawerFooter className="justify-end">
          <DrawerClose />
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

// ─── Live panel ───────────────────────────────────────────────────────────────
function LivePanel({ zone, staff, stats, dayKey, lastUpdated, dataReady, statusFailed, onSelectStaff }) {
  if (!zone) {
    return (
      <div className="fsd-panel fsd-panel-empty">
        <MapPin style={{ width: '2.5em', height: '2.5em', color: 'rgba(255,255,255,0.10)' }} />
        <p>Select a zone to start monitoring its field staff</p>
      </div>
    );
  }

  const pct = stats.total > 0 ? Math.round((stats.onSite / stats.total) * 100) : 0;
  const pctColor = pct >= 70 ? '#4ade80' : pct >= 40 ? '#FBBF24' : '#f87171';

  // The note only earns a warning triangle when there's something to act on.
  const note = !dataReady
    ? { text: statusFailed ? 'Live zone status unavailable — retrying' : 'Waiting for live zone status…', warn: statusFailed }
    : stats.total === 0 ? { text: 'No devices assigned to this zone', warn: false }
    : stats.missing > 0 ? { text: `${stats.missing} staff out of zone for over ${MISSING_HOURS}h`, warn: true }
    : stats.outside > 0 ? { text: `${stats.outside} staff currently outside the perimeter`, warn: true }
    : { text: 'All staff on site', warn: false };

  return (
    <div className="fsd-panel">
      <div className="fsd-panel-head">
        <div style={{ minWidth: 0 }}>
          <div className="fsd-panel-title">{zone.name}</div>
          <div className="fsd-panel-sub">
            <span className="fsd-zone-dot" style={{ background: zone.color || '#A72C32' }} />
            <span style={{ fontWeight: 600 }}>{zone.company || 'TPL TRAKKER'}</span>
            <span className="fsd-sep">·</span>
            <span>{stats.total} staff</span>
            <span className="fsd-sep">·</span>
            <span>{dayKey}</span>
          </div>
        </div>
        <div className={`fsd-live-badge${dataReady ? '' : ' paused'}`}>
          <span className="fsd-live-dot" />
          {dataReady ? 'LIVE' : 'SYNCING'}
        </div>
      </div>

      <div className="fsd-kpi-grid">
        <KPIChip label="On-site"     value={dataReady ? stats.onSite  : '—'} color="#4ade80" icon={ShieldCheck} />
        <KPIChip label="Out-of-zone" value={dataReady ? stats.outside : '—'} color="#FBBF24" icon={LogOut} />
        <KPIChip label="Missing"     value={dataReady ? stats.missing : '—'} color="#f87171" icon={UserX} />
      </div>

      <div className="fsd-compliance">
        <div className="fsd-compliance-bar-label">
          <span>On-site rate</span>
          <span style={{ color: pctColor, fontWeight: 800 }}>{dataReady ? `${pct}%` : '—'}</span>
        </div>
        <div className="fsd-compliance-track">
          <div className="fsd-compliance-fill" style={{ width: dataReady ? `${pct}%` : 0, background: pctColor }} />
        </div>
        <div className="fsd-compliance-note">
          {note.warn && <AlertTriangleIcon className="fsd-compliance-note-icon" />}
          <span>{note.text}</span>
        </div>
      </div>

      <div className="fsd-roster">
        <div className="fsd-roster-head">
          <span>Staff roster</span>
          {lastUpdated && (
            <span className="fsd-roster-ts">updated {fmtClock(lastUpdated)}</span>
          )}
        </div>
        {!dataReady ? (
          <div className="fsd-roster-empty">
            {statusFailed
              ? 'Could not reach live zone status. Retrying in a few minutes.'
              : 'Loading live zone status…'}
          </div>
        ) : staff.length === 0 ? (
          <div className="fsd-roster-empty">No devices assigned to this zone</div>
        ) : staff.map(s => <StaffRow key={s.key} staff={s} onSelect={onSelectStaff} />)}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function FieldStaffDashboard() {
  const { zones } = useZoneCache();
  const { devices } = useDeviceCache();
  const { accessToken } = useAuth();
  const { markReadThisSession, isAlertReadThisSession } = useAlerts();

  const [selectedZoneId, setSelectedZoneId] = useState('');
  const [dayKey, setDayKey] = useState(todayStr);       // always today — this page is live-only
  const [statusRows, setStatusRows] = useState([]);     // from /api/geofence/status
  const [trackRows, setTrackRows] = useState([]);       // from /api/geofence/tracks
  const [dataReady, setDataReady] = useState(false);    // live status has actually landed
  const [statusFailed, setStatusFailed] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [dismissed, setDismissed] = useState(() => new Set());
  const [selectedStaffKey, setSelectedStaffKey] = useState(null);

  const fetchTagRef = useRef(null);
  const seenAlertIdsRef = useRef(new Set());   // notified this visit; reset per zone

  const selectedZone = useMemo(
    () => zones.find(z => z.zone_id === selectedZoneId) || null,
    [zones, selectedZoneId],
  );

  // ── Fetch: status (live in/out) + tracks (today's points) ──────────────────
  const load = useCallback(async () => {
    if (!selectedZoneId || !accessToken) return;

    const tag = `${selectedZoneId}:${dayKey}`;
    fetchTagRef.current = tag;

    const headers = { Authorization: `Bearer ${accessToken}` };
    const dayStart = new Date(`${dayKey}T00:00:00`);
    const dayEnd = new Date();

    const statusUrl = `${API_BASE_URL}/api/geofence/status?zone_id=${encodeURIComponent(selectedZoneId)}`;
    const tracksUrl = `${API_BASE_URL}/api/geofence/tracks/${encodeURIComponent(selectedZoneId)}` +
                      `?start=${encodeURIComponent(naiveLocal(dayStart))}&end=${encodeURIComponent(naiveLocal(dayEnd))}`;

    const [statusRes, tracksRes] = await Promise.allSettled([
      fetch(statusUrl, { headers }).then(r => (r.ok ? r.json() : null)),
      fetch(tracksUrl, { headers }).then(r => (r.ok ? r.json() : null)),
    ]);

    if (fetchTagRef.current !== tag) return;   // a newer zone won the race

    const statusOk = statusRes.status === 'fulfilled' && statusRes.value;
    if (statusOk) setStatusRows(statusRes.value.zones?.[selectedZoneId] || []);
    if (tracksRes.status === 'fulfilled' && tracksRes.value) {
      setTrackRows(tracksRes.value.devices || []);
    }
    setLastUpdated(Date.now());

    // Nothing derives an alert until live status is in hand. With an empty
    // status payload every device reads as "never seen inside the zone", which
    // is how opening the page used to fire a screenful of false alarms.
    setStatusFailed(!statusOk);
    if (statusOk) setDataReady(true);
  }, [selectedZoneId, dayKey, accessToken]);

  // Zone change → reload from scratch. Clear the notified-set so the new zone
  // doesn't inherit the previous one's notification history.
  useEffect(() => {
    setStatusRows([]);
    setTrackRows([]);
    setLastUpdated(null);
    setDataReady(false);
    setStatusFailed(false);
    setSelectedStaffKey(null);
    seenAlertIdsRef.current = new Set();
    if (selectedZoneId) load();
  }, [selectedZoneId, dayKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Silent refresh on REFRESH_MS — no loaders, the view stays put. Also rolls
  // the day over for a tab that's been left open past midnight.
  useDeviceUpdates(() => {
    if (!selectedZoneId) return;
    const today = todayStr();
    if (today !== dayKey) setDayKey(today);
    else load();
  });

  useEffect(() => {
    if (!selectedZoneId) return;
    const iv = setInterval(() => emitDevicesUpdated(), REFRESH_MS);
    return () => clearInterval(iv);
  }, [selectedZoneId, dayKey, load]);

  // ── Derive staff rows ──────────────────────────────────────────────────────
  const isInZone = useCallback((lat, lng) => {
    const coords = selectedZone?.coordinates || selectedZone?.polygon || [];
    return coords.length ? pointInPolygon(lat, lng, coords) : false;
  }, [selectedZone]);

  const { staff, stats, alerts } = useMemo(() => {
    if (!selectedZone) return { staff: [], stats: { total: 0, onSite: 0, outside: 0, missing: 0 }, alerts: [] };

    const zoneSns = selectedZone.device_sns || [];
    const colorBySn = buildDeviceColorMap(zoneSns);
    const statusBySn = Object.fromEntries(statusRows.map(r => [r.sn, r]));
    const trackBySn = Object.fromEntries(trackRows.map(r => [r.sn, r]));
    const deviceBySn = Object.fromEntries(devices.map(d => [d.sn, d]));

    const dayStartMs = new Date(`${dayKey}T00:00:00`).getTime();
    const nowMs = Date.now();
    const zoneName = selectedZone.name;
    const rawAlerts = [];

    // One entry per device, then folded into staff members below.
    const deviceRows = zoneSns.map((sn) => {
      const dev = deviceBySn[sn];
      const st = statusBySn[sn];
      const points = (trackBySn[sn]?.points || [])
        .filter(p => Number.isFinite(p?.lat) && Number.isFinite(p?.lng))
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

      const inside = points.map(p => isInZone(p.lat, p.lng));
      const insideCount = inside.filter(Boolean).length;

      // Hourly in/out counts — the drawer charts these per staff member.
      const hourly = {};
      points.forEach((p, i) => {
        const t = tsMs(p.timestamp);
        if (t === null) return;
        const label = `${pad2(new Date(t).getHours())}:00`;
        const bucket = hourly[label] || (hourly[label] = { inZone: 0, outside: 0 });
        if (inside[i]) bucket.inZone += 1;
        else bucket.outside += 1;
      });

      // The whole rule, in one line: in zone, or out of zone — and out of zone
      // for longer than MISSING_THRESHOLD_MS (16h) means missing. The backend
      // computes last_seen over the device's whole history, so this isn't
      // limited to today's window.
      const lastInZoneAt = st?.last_seen || null;
      const lastInZoneMs = tsMs(lastInZoneAt);
      const missing = lastInZoneMs === null || nowMs - lastInZoneMs > MISSING_THRESHOLD_MS;

      const lastReportAt = st?.latest?.timestamp || points.at(-1)?.timestamp || dev?.dataRetrievalTime || null;
      const lastReportMs = tsMs(lastReportAt);

      // Who is carrying this tracker? `assigned_user_id` is the only stable
      // identity to fold on: two people can share a display name, and on some
      // backend paths `assigned_user_name` falls back to the *device* label —
      // so grouping on either string turns the roster into one row per device.
      // A tracker with no user bound to it stays its own row, by serial.
      const userId = dev?.assigned_user_id || null;
      const userName = dev?.assigned_user_name || dev?.assignedUser || null;
      // For an unbound tracker its own nickname beats a bare serial number.
      const deviceLabel = dev?.name || dev?.assigned_name || null;

      const staffKey = userId || `sn:${sn}`;
      const staffName = userName || deviceLabel || sn;

      const row = {
        sn,
        staffKey,
        staffName,
        unassigned: !userId,
        color: colorBySn[sn],
        inZone: st?.status === 'INSIDE',
        missing,
        online: lastReportMs !== null && nowMs - lastReportMs < ONLINE_THRESHOLD_MS,
        lat: st?.latest?.lat ?? points.at(-1)?.lat ?? null,
        lng: st?.latest?.lng ?? points.at(-1)?.lng ?? null,
        lastReportAt,
        lastInZoneAt,
        insideCount,
        outsideCount: points.length - insideCount,
        hourly,
      };

      // Only once real status is in hand — see the note in `load`.
      if (dataReady) {
        const absence = absenceAlert({
          sn, staffName, zoneId: selectedZone.zone_id, zoneName,
          lastInZoneAt, dayKey, dayStartMs, nowMs,
        });
        // Carry the identity so the banner groups by person, not by name text.
        if (absence) rawAlerts.push({ ...absence, staffKey });
      }

      return row;
    });

    // Fold devices into staff members.
    const byStaff = new Map();
    for (const r of deviceRows) {
      if (!byStaff.has(r.staffKey)) {
        byStaff.set(r.staffKey, { key: r.staffKey, name: r.staffName, color: r.color, devices: [] });
      }
      byStaff.get(r.staffKey).devices.push(r);
    }

    const staffList = [...byStaff.values()].map((s) => {
      // A person counts as in-zone / online if any of their devices is.
      const inZone = s.devices.some(d => d.inZone);
      const online = s.devices.some(d => d.online);
      const missing = s.devices.every(d => d.missing);
      const lastReportAt = s.devices
        .map(d => d.lastReportAt).filter(Boolean)
        .sort((a, b) => tsMs(b) - tsMs(a))[0] || null;
      const lastInZoneAt = s.devices
        .map(d => d.lastInZoneAt).filter(Boolean)
        .sort((a, b) => tsMs(b) - tsMs(a))[0] || null;

      // One presence series for the person, not per tracker.
      const merged = new Map();
      for (const d of s.devices) {
        for (const [label, b] of Object.entries(d.hourly)) {
          const cur = merged.get(label) || { inZone: 0, outside: 0 };
          cur.inZone += b.inZone;
          cur.outside += b.outside;
          merged.set(label, cur);
        }
      }
      const series = [...merged.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([label, v]) => ({ label, ...v }));

      return {
        ...s,
        inZone, online, missing, lastReportAt, lastInZoneAt, series,
        unassigned: s.devices.every(d => d.unassigned),
        insideCount: s.devices.reduce((n, d) => n + d.insideCount, 0),
        outsideCount: s.devices.reduce((n, d) => n + d.outsideCount, 0),
      };
    });

    // Trouble first: missing, then outside, then on site.
    staffList.sort((a, b) => {
      const rank = (s) => (s.missing ? 0 : s.inZone ? 2 : 1);
      return rank(a) - rank(b) || a.name.localeCompare(b.name);
    });

    return {
      staff: staffList,
      stats: {
        total: staffList.length,
        onSite: staffList.filter(s => s.inZone && !s.missing).length,
        outside: staffList.filter(s => !s.inZone && !s.missing).length,
        missing: staffList.filter(s => s.missing).length,
      },
      alerts: sortAlerts(rawAlerts),
    };
    // `devices` belongs in the deps: the fleet cache often resolves *after* this
    // first runs, and without it every row stayed stuck on its serial number.
  }, [selectedZone, dayKey, statusRows, trackRows, isInZone, dataReady, devices]);

  // Live object, so the drawer keeps updating while it's open.
  const selectedStaff = useMemo(
    () => staff.find(s => s.key === selectedStaffKey) || null,
    [staff, selectedStaffKey],
  );

  // Absence is a property of the person, not the tracker: someone carrying two
  // devices was raising two identical "flagged as missing" alerts. Collapse them
  // into one toast that carries every member id, so dismissing clears the lot.
  const queuedAlerts = useMemo(() => {
    const byKey = new Map();
    for (const a of alerts) {
      const key = `${a.kind}::${a.staffKey ?? a.sn}`;
      const group = byKey.get(key);
      if (!group) {
        byKey.set(key, { ...a, ids: [a.id], deviceCount: 1 });
        continue;
      }
      group.ids.push(a.id);
      group.deviceCount += 1;
      // Keep the most recent sighting as the one worth reporting.
      if ((tsMs(a.timestamp) ?? 0) > (tsMs(group.timestamp) ?? 0)) {
        group.timestamp = a.timestamp;
        group.description = a.description;
      }
    }
    return [...byKey.values()].map(g => (
      g.deviceCount > 1
        ? { ...g, description: `${g.description} Across ${g.deviceCount} devices.` }
        : g
    ));
  }, [alerts]);

  // Suppression is session-scoped on purpose. Dismissing here, or marking read
  // on the Alerts page, keeps a banner down for the rest of this session — but
  // a reload starts clean, so a condition that is still true announces itself
  // again. (Filtering on the *persisted* read set instead is what silenced
  // these banners permanently: the ids are stable and shared with the bell, so
  // one "Mark all read" there killed them for good.)
  const visibleAlerts = useMemo(
    () => queuedAlerts.filter(a => !a.ids.some(id => dismissed.has(id) || isAlertReadThisSession(id))),
    [queuedAlerts, dismissed, isAlertReadThisSession],
  );

  // ── Browser notifications ─────────────────────────────────────────────────
  // These fire on every reload, first poll included — but only for conditions
  // that are true *now*. MISSING/NO_SHOW are re-derived from live status each
  // poll, so a condition that has resolved simply stops appearing here; what's
  // left is current by construction. Read/dismissed alerts are excluded, and
  // `dataReady` keeps anything from firing off a half-loaded page.
  useEffect(() => {
    if (!dataReady || !selectedZoneId) return;

    const fresh = queuedAlerts.filter(
      a => !seenAlertIdsRef.current.has(a.id) && !a.ids.some(isAlertReadThisSession),
    );
    queuedAlerts.forEach(a => seenAlertIdsRef.current.add(a.id));
    if (fresh.length === 0) return;

    if (typeof window === 'undefined' || !('Notification' in window)) return;
    const fire = () => {
      fresh.slice(0, 3).forEach(a => {
        try { new Notification('TPL Trakker — Field Staff', { body: a.title, tag: a.id }); } catch {}
      });
      if (fresh.length > 3) {
        try { new Notification('TPL Trakker — Field Staff', { body: `${fresh.length} new zone alerts` }); } catch {}
      }
    };
    if (Notification.permission === 'granted') fire();
    else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then(p => { if (p === 'granted') fire(); }).catch(() => {});
    }
  }, [queuedAlerts, dataReady, selectedZoneId, isAlertReadThisSession]);

  // Dismissal is remembered for the session — in the context, so it survives
  // navigating away and back, and in local state so the banner clears on the
  // same tick rather than waiting on a context round-trip.
  const dismiss = useCallback((alert) => {
    setDismissed(prev => {
      const next = new Set(prev);
      alert.ids.forEach(id => next.add(id));
      return next;
    });
    alert.ids.forEach(markReadThisSession);
  }, [markReadThisSession]);

  const dismissAll = useCallback(() => {
    const ids = visibleAlerts.flatMap(a => a.ids);
    setDismissed(prev => new Set([...prev, ...ids]));
    ids.forEach(markReadThisSession);
  }, [visibleAlerts, markReadThisSession]);

  return (
    <div className="fsd-dashboard">

      {/* ── Header ── */}
      <div className="fsd-header">
        <div className="fsd-header-left">
          <div className="fsd-header-text">
            <h1 className="fsd-title">Field Staff Monitor</h1>
            <p className="fsd-subtitle">
              Live zone presence · refreshes every 10 minutes
            </p>
          </div>
        </div>

        {/* ── Alert banner — one at a time, immediately left of the zone picker,
            in the header's empty middle. It shares the header row so it can
            never cover the roster or the map. ── */}
        {selectedZone && dataReady && (
          <AlertToasts alerts={visibleAlerts} onDismiss={dismiss} onDismissAll={dismissAll} />
        )}

        {/* Zone is the only filter — this page is always "right now", so a date
            range had nothing to select. History lives on the playback page. */}
        <div className="fsd-filters-bar" style={{ alignItems: 'flex-end', gap: '0.75em' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3125em' }}>
            <label className="fsd-field-label">Zone</label>
            <ZoneDropdown
              value={selectedZoneId}
              onChange={setSelectedZoneId}
              zones={zones}
            />
          </div>
        </div>
      </div>

      {/* ── Split layout ── */}
      <div className="fsd-top-layout">
        <div className="fsd-map-card">
          <MapSection staff={staff} selectedZone={selectedZone} onSelectStaff={setSelectedStaffKey} />
        </div>

        <div className="fsd-side-cards">
          <LivePanel
            zone={selectedZone}
            staff={staff}
            stats={stats}
            dayKey={dayKey}
            lastUpdated={lastUpdated}
            dataReady={dataReady}
            statusFailed={statusFailed}
            onSelectStaff={setSelectedStaffKey}
          />
        </div>
      </div>

      <StaffDrawer
        staff={selectedStaff}
        zone={selectedZone}
        dayKey={dayKey}
        open={Boolean(selectedStaff)}
        onOpenChange={(next) => { if (!next) setSelectedStaffKey(null); }}
      />
    </div>
  );
}
