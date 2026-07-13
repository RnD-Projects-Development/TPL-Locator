import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import MapView from "../components/MapView.jsx";
import DeviceSidebar from "../components/Devicesidebar.jsx";
import TPLLoader from "../components/TPLLoader.jsx";
import { useCityTag } from "../hooks/useCityTag.js";
import { useSidebarDevices } from "../hooks/useSidebarDevices.js";
import { useResizablePanel } from "../hooks/useResizablePanel.js";
import { useZoneCache } from "../context/ZoneCacheContext.jsx";
import { loadSidebarScopeState, saveSidebarScopeState } from "../utils/sidebarPageState.js";
import { peekGeocode, resolveGeocode } from "../utils/geocodeCache.js";
import { getCachedPlayback } from "../utils/playbackCache.js";
import { aggregateByLandmarkAndDay } from "../utils/stopClustering.js";
import "./PlaybackPage.css";
import LocatingOverlay from "../components/LocatingOverlay.jsx";

const PLAYBACK_SCOPE = "playback";

// Playback ranges are capped — beyond this the map/sidebar become unreadable
// and the point volume hurts performance.
const MAX_RANGE_DAYS = 7;

/* ── Small helpers ───────────────────────────────────────────────────────── */

function isDuplicate(p1, p2) {
  if (!p1 || !p2) return false;
  const ts  = (p) => p?.timestamp ?? p?.time ?? p?.locTime;
  const lat = (p) => p?.lat ?? p?.latitude ?? p?.gpsLat ?? p?.wgLat;
  const lng = (p) => p?.lng ?? p?.lon ?? p?.longitude ?? p?.gpsLng ?? p?.wgLng;
  return lat(p1) === lat(p2) && lng(p1) === lng(p2) && ts(p1) === ts(p2);
}

const pad2 = (n) => String(n).padStart(2, "0");
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// Shift a YYYY-MM-DD string by n days (local calendar).
function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00`);
  if (isNaN(d.getTime())) return undefined;
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// Stored timestamps are naive Pakistan local time (the vendor sync applies the
// offset on ingest). Queries therefore send the picker's wall-clock as a NAIVE
// datetime string (no 'Z', no offset) so the window matches stored values exactly
// — starting at the selected day's min with no bleed into the previous day.
function naiveLocal(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function formatTs(point) {
  const ts = point?.timestamp ?? point?.time ?? point?.locTime;
  if (!ts) return "—";
  try { const d = new Date(ts); return isNaN(d.getTime()) ? String(ts) : d.toLocaleString(); }
  catch { return "—"; }
}

function formatTime(point) {
  const ts = point?.timestamp ?? point?.time ?? point?.locTime;
  if (!ts) return "—";
  try { const d = new Date(ts); return isNaN(d.getTime()) ? "—" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
  catch { return "—"; }
}

function formatDay(ts) {
  if (ts == null) return "—";
  try { return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "2-digit", year: "numeric" }); }
  catch { return "—"; }
}

function normalisePlayback(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.points)) return data.points;
  if (data.geometry?.coordinates) {
    const ts = data.properties?.timestamps ?? [];
    return data.geometry.coordinates.map(([lng, lat], i) => ({ lng, lat, timestamp: ts[i] ?? null }));
  }
  return [];
}

const TIME_SHORTCUTS = [
  { label: "1H",  hours: 1   },
  { label: "3H",  hours: 3   },
  { label: "6H",  hours: 6   },
  { label: "1D",  hours: 24  },
  { label: "7D",  hours: 168 },
];

/* ── Geocode display hook (shared by list rows + detail header) ──────────── */

function useStopGeo(group, getGeocode) {
  const geoPoint = useMemo(
    () => ({ ...group.firstPoint, landmark: group.landmark ?? group.firstPoint?.landmark }),
    [group]
  );
  const [geo, setGeo] = useState(() => peekGeocode(geoPoint));

  // Re-resolve whenever the point changes — e.g. clicking a different pin on the
  // map swaps StopDetail's `group` without remounting, so this instance's geo
  // must refresh. Peek the synchronous cache first (shows a known landmark
  // immediately); otherwise clear the stale value and fetch. Guarding on `geo`
  // here would wrongly keep the previous stop's landmark.
  useEffect(() => {
    let isMounted = true;
    const cached = peekGeocode(geoPoint);
    setGeo(cached);
    if (cached) return;
    resolveGeocode(geoPoint, getGeocode).then((result) => {
      if (isMounted) setGeo(result);
    });
    return () => { isMounted = false; };
  }, [geoPoint, getGeocode]);

  return geo;
}

function StopName({ geo }) {
  return geo?.primary
    ? (geo.isSpecific ? geo.primary : `Near ${geo.primary}`)
    : <span className="pb-vl-muted">No landmark</span>;
}

/* ── Sidebar: per-stop summary (list state) ──────────────────────────────── */

function StopSummary({ group, index, getGeocode, onClick }) {
  const geo = useStopGeo(group, getGeocode);
  return (
    <div
      className="pb-vl-item pb-vl-item-clickable"
      onClick={() => onClick(group)}
      title="View stop details"
    >
      <div className="pb-vl-item-num">{index + 1}</div>
      <div className="pb-vl-item-body">
        <div className="pb-vl-item-loc"><StopName geo={geo} /></div>
        {geo?.secondary && <div className="pb-vl-item-area">{geo.secondary}</div>}
        <div className="pb-vl-item-ts pb-tl-time">
          {formatDay(group.startTs)} &middot; {formatTime(group.firstPoint)} - {formatTime(group.lastPoint)}
        </div>
      </div>
    </div>
  );
}

/* ── Sidebar: per-stop timeline (detail state) ───────────────────────────── */

function StopDetail({ group, getGeocode, onBack, onFocusPoint }) {
  const geo = useStopGeo(group, getGeocode);
  const lastIdx = group.points.length - 1;

  return (
    <>
      <button className="pb-vl-back" onClick={onBack}>← All stops</button>

      <div className="pb-vl-detail-header">
        <div className="pb-vl-item-loc"><StopName geo={geo} /></div>
        {geo?.secondary && <div className="pb-vl-item-area">{geo.secondary}</div>}
        <div className="pb-vl-item-ts">{formatDay(group.startTs)}</div>
        <div className="pb-vl-detail-summary">
          <div className="pb-vl-summary-item"><span>First</span><b>{formatTime(group.firstPoint)}</b></div>
          <div className="pb-vl-summary-item"><span>Last</span><b>{formatTime(group.lastPoint)}</b></div>
          <div className="pb-vl-summary-item"><span>Total Samples</span><b>{group.totalSamples}</b></div>
        </div>
      </div>

      <div className="pb-vl-list">
        <div className="pb-vl-feed">
          {group.points.map((pt, i) => (
            <div
              key={i}
              className="pb-vl-item pb-vl-item-clickable pb-tl-row"
              onClick={() => onFocusPoint(pt)}
              title="Show on map"
            >
              <div className="pb-vl-item-num">{i + 1}</div>
              <div className="pb-vl-item-body">
                <div className="pb-vl-item-ts pb-tl-time">{formatTs(pt)}</div>
                {i === 0 && <span className="pb-tl-badge pb-tl-badge-arrival">First</span>}
                {i === lastIdx && lastIdx > 0 && <span className="pb-tl-badge pb-tl-badge-departure">Last</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */

export default function PlaybackPage() {
  const [searchParams] = useSearchParams();
  const { getLatestLocation, getPlayback, getGeocode } = useCityTag();
  const { ensureDevice } = useSidebarDevices(PLAYBACK_SCOPE);
  const [label, setLabel] = useState("");
  const { zones } = useZoneCache();
  const [showFences, setShowFences] = useState(false);

  const [sn, setSn] = useState(() => {
    const param = searchParams.get("device");
    if (param) return param;
    return "";
  });
  const [sessionTraj, setSessionTraj]       = useState([]);
  const [historicalTraj, setHistoricalTraj] = useState([]);
  const [latest, setLatest]                 = useState(null);
  const [dataSource, setDataSource]         = useState("session");
  const [isLiveMode, setIsLiveMode]         = useState(true);

  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate]     = useState(todayStr());
  const [startTime, setStartTime] = useState("00:00");
  const [endTime, setEndTime]     = useState("23:59");

  const [histLoading, setHistLoading]       = useState(false);
  const [histError, setHistError]           = useState("");
  const [liveLoading, setLiveLoading]       = useState(false);
  const [liveError, setLiveError]           = useState("");
  const [lastUpdated, setLastUpdated]       = useState(null);
  const [activeShortcut, setActiveShortcut] = useState(null);

  // Dual-state right sidebar: null → list of aggregated stops for the loaded
  // range; a group → detailed timeline of every ping at that (landmark, day).
  const [selectedGroup, setSelectedGroup] = useState(null);

  // User-adjustable sidebar widths — drag the divider next to each sidebar,
  // double-click it to reset. Persisted per panel across sessions.
  const leftPanel  = useResizablePanel("pb_sidebar_left_w",  { defaultWidth: 260, min: 200, max: 480, edge: "right" });
  const rightPanel = useResizablePanel("pb_sidebar_right_w", { defaultWidth: 260, min: 200, max: 520, edge: "left" });

  // Map focus target — MapView pans/zooms to it when it changes.
  const [focusTarget, setFocusTarget] = useState(null);
  const handleFocusPoint = useCallback((pt) => {
    if (!pt) return;
    // Fresh object every click so re-clicking the same reading re-pans.
    setFocusTarget({ ...pt, __focusKey: Date.now() });
  }, []);

  // The lower bound is free — pick any start date. The end picker is then
  // limited to at most MAX_RANGE_DAYS above it.
  const endDateMax = startDate ? addDays(startDate, MAX_RANGE_DAYS) : undefined;

  // Moving the start date drags the end date along if it falls outside the
  // allowed [start, start + 7d] window.
  const handleStartDateChange = (value) => {
    setStartDate(value);
    setActiveShortcut(null);
    if (!value) return;
    const maxEnd = addDays(value, MAX_RANGE_DAYS);
    if (endDate < value) setEndDate(value);
    else if (maxEnd && endDate > maxEnd) setEndDate(maxEnd);
  };

  // Static pins: the loaded historical range (aggregation happens in MapView).
  const staticDots = useMemo(
    () => (dataSource === "historical" ? historicalTraj : []),
    [dataSource, historicalTraj]
  );

  // Aggregated stops for the sidebar list — same input + same function as
  // MapView's pins, so list rows and map markers are always 1:1 (matched by
  // group.key when a marker is clicked).
  const stops = useMemo(
    () => (dataSource === "historical" ? aggregateByLandmarkAndDay(historicalTraj) : []),
    [dataSource, historicalTraj]
  );

  // A map marker was clicked — open that stop's timeline. Match by key into
  // our own list so both surfaces share the same object.
  const handleFocusGroup = useCallback((group) => {
    if (!group) return;
    setSelectedGroup((prev) => {
      const match = stops.find((s) => s.key === group.key) ?? group;
      return prev?.key === match.key ? prev : match;
    });
  }, [stops]);

  const refreshLive = useCallback(async (target, isBackground = false) => {
    const dev = target ?? sn;
    if (!dev || !isLiveMode) return;
    if (!isBackground) {
      setLiveLoading(true);
      setLiveError("");
    }
    try {
      const res   = await getLatestLocation(dev);
      const point = res?.latest ?? res ?? null;
      setLatest(point);
      setLastUpdated(new Date());
      if (point) {
        setSessionTraj((prev) => {
          if (isDuplicate(prev[prev.length - 1], point)) return prev;
          const next = [...prev, point];
          return next.length > 500 ? next.slice(-500) : next;
        });
      }
      if (!isBackground) setLiveLoading(false);
    } catch (err) {
      if (!isBackground) {
        setLiveError(err?.message || "Unable to retrieve location");
        setLiveLoading(false);
      }
    }
  }, [sn, isLiveMode, getLatestLocation]);

  useEffect(() => {
    saveSidebarScopeState(PLAYBACK_SCOPE, { selectedSn: sn || null });
  }, [sn]);

  // Live mode polls the latest position every 30s — without this, "Live"
  // showed a single snapshot from device-select time and never updated.
  useEffect(() => {
    if (!sn || !isLiveMode) return;
    const id = setInterval(() => { refreshLive(undefined, true); }, 30_000);
    return () => clearInterval(id);
  }, [sn, isLiveMode, refreshLive]);

  const initialRangeConsumed = React.useRef(false);

  useEffect(() => {
    const param = searchParams.get("device");
    if (param) void ensureDevice(param);

    if (sn && searchParams.get("range") === "1D" && !initialRangeConsumed.current) {
      initialRangeConsumed.current = true;
      const now = new Date();
      const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const toDateStr = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
      const toTimeStr = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
      setStartDate(toDateStr(start));
      setStartTime(toTimeStr(start));
      setEndDate(toDateStr(now));
      setEndTime(toTimeStr(now));
      setActiveShortcut("1D");
      loadHistorical(naiveLocal(start), naiveLocal(now));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, ensureDevice, sn]);

  const handleSelectDevice = (device) => {
    const newSn    = typeof device === "string" ? device : (device?.sn ?? "");
    const newLabel = typeof device === "string" ? "" : (device?.assignedUser ?? "");
    setSn(newSn);
    setLabel(newLabel);
    setSessionTraj([]);
    setHistoricalTraj([]);
    setLatest(null);
    setSelectedGroup(null);
    setIsLiveMode(true);
    setDataSource("session");
    setHistError("");
    setActiveShortcut(null);
    refreshLive(newSn);
  };

  const loadHistorical = async (overrideStart, overrideEnd) => {
    if (!sn) return;
    setHistError("");
    setHistLoading(true);
    try {
      // Naive PKT wall-clock strings — match the naive-local stored timestamps
      const start = overrideStart ?? `${startDate}T${startTime}:00`;
      const end   = overrideEnd   ?? `${endDate}T${endTime}:59`;
      if (start >= end) throw new Error("Start must be before end");
      // Calendar-day check matching the pickers: the end DATE may be at most
      // 7 days above the start DATE (time of day within those days is free).
      const dayDiff = (new Date(end.slice(0, 10)).getTime() - new Date(start.slice(0, 10)).getTime()) / 86_400_000;
      if (dayDiff > MAX_RANGE_DAYS) {
        throw new Error(`Playback is limited to a maximum ${MAX_RANGE_DAYS}-day window. Please select a shorter date range.`);
      }
      const points = await getCachedPlayback(sn, start, end, async (deviceSn, rangeStart, rangeEnd) => {
        try {
          const res = await getPlayback(deviceSn, rangeStart, rangeEnd);
          return normalisePlayback(res);
        } catch (err) {
          // The backend 404s when a range holds zero points. When the cache
          // re-fetches only the small uncovered gap of an overlapping range
          // (e.g. clicking 1D again minutes later), an empty gap is normal —
          // treat it as "no new points" so the cached rest of the range still
          // loads instead of failing the whole request.
          if (err?.status === 404) return [];
          throw err;
        }
      });
      if (points.length === 0) throw new Error("No data found in that time range");
      console.log(`[playback] loaded ${points.length} points for ${sn} (${start} → ${end})`);
      setHistoricalTraj(points);
      setDataSource("historical");
      setIsLiveMode(false);
      setSelectedGroup(null);
    } catch (err) {
      setHistError(err.message || "Failed to load playback data");
    } finally {
      setHistLoading(false);
    }
  };

  const handleShortcut = (shortcut) => {
    if (!sn) { setHistError("Select a device first"); return; }
    const now   = new Date();
    const start = new Date(now.getTime() - shortcut.hours * 60 * 60 * 1000);
    const toDateStr = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    const toTimeStr = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    setStartDate(toDateStr(start));
    setStartTime(toTimeStr(start));
    setEndDate(toDateStr(now));
    setEndTime(toTimeStr(now));
    setActiveShortcut(shortcut.label);
    // Send naive local (PKT wall-clock) strings to match stored timestamps
    loadHistorical(naiveLocal(start), naiveLocal(now));
  };

  return (
    <div className="pb-page">

      {/* ── Top bar ────────────────────────────────── */}
      <div className="pb-topbar">
        <div className="pb-topbar-left">
          <span className="pb-topbar-label">Playback</span>
          {sn && <span className="pb-topbar-sn">{sn}</span>}
          {sn && (
            <span className={`pb-pill ${!isLiveMode ? "pill-playback" : "pill-live"}`}>
              <span className="pb-pill-dot" />
              {!isLiveMode ? "Playback" : "Live"}
            </span>
          )}
          {lastUpdated && <span className="pb-pill pill-dim">{lastUpdated.toLocaleTimeString()}</span>}
        </div>

        <div className="pb-topbar-right">
          <div className="pb-shortcuts">
            {TIME_SHORTCUTS.map((shortcut) => (
              <button key={shortcut.label}
                className={`pb-shortcut-btn${activeShortcut === shortcut.label ? " active" : ""}`}
                onClick={() => handleShortcut(shortcut)} disabled={histLoading}>
                {activeShortcut === shortcut.label && histLoading ? <span className="pb-spinner" /> : shortcut.label}
              </button>
            ))}
          </div>
          <div className="pb-date-group">
            <label>Start</label>
            <div className="pb-date-btn" onClick={(e) => e.currentTarget.querySelector("input").showPicker()}>
              <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd"/></svg>
              <span>{startDate}</span>
              <input type="date" value={startDate}
                onChange={(e) => handleStartDateChange(e.target.value)} />
            </div>
            <div className="pb-date-btn" onClick={(e) => e.currentTarget.querySelector("input").showPicker()}>
              <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd"/></svg>
              <span>{startTime}</span>
              <input type="time" value={startTime} onChange={(e) => { setStartTime(e.target.value); setActiveShortcut(null); }} />
            </div>
          </div>
          <div className="pb-date-group">
            <label>End</label>
            <div className="pb-date-btn" onClick={(e) => e.currentTarget.querySelector("input").showPicker()}>
              <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd"/></svg>
              <span>{endDate}</span>
              <input type="date" value={endDate} min={startDate} max={endDateMax}
                onChange={(e) => { setEndDate(e.target.value); setActiveShortcut(null); }} />
            </div>
            <div className="pb-date-btn" onClick={(e) => e.currentTarget.querySelector("input").showPicker()}>
              <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd"/></svg>
              <span>{endTime}</span>
              <input type="time" value={endTime} onChange={(e) => { setEndTime(e.target.value); setActiveShortcut(null); }} />
            </div>
          </div>
          <button className="pb-btn-load" onClick={() => loadHistorical()} disabled={!sn || histLoading}>
            {histLoading ? <><span className="pb-spinner" /> Loading…</> : <>Load Playback</>}
          </button>

          {sn && (
            <div className="pb-source-toggle">
              <button className={`pb-source-btn ${dataSource === "session" ? "active" : ""}`}
                onClick={() => { setDataSource("session"); setSelectedGroup(null); setIsLiveMode(true); }}>
                Session
              </button>
              <button
                className={`pb-source-btn ${dataSource === "historical" ? "active" : ""}`}
                onClick={() => { setDataSource("historical"); setSelectedGroup(null); setIsLiveMode(false); }}
                disabled={historicalTraj.length === 0}
                title={historicalTraj.length === 0 ? "Load a date range first" : ""}
              >Historical</button>
            </div>
          )}
          <button
            className={`pb-fence-btn${showFences ? " active" : ""}`}
            onClick={() => setShowFences(v => !v)}
            title={showFences ? "Hide fences" : "Show fences"}
          >
            <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
              <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd"/>
            </svg>
            Fences
          </button>
        </div>
      </div>

      {/* Error */}
      {histError && (
        <div className="pb-error">
          <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
          {histError}
          <button className="pb-error-close" onClick={() => setHistError("")}>✕</button>
        </div>
      )}

      {/* ── Body ─────────────────────────────────── */}
      <div className="pb-body">
        <div className="pb-panel-resizable" style={{ width: leftPanel.width }}>
          <DeviceSidebar scope={PLAYBACK_SCOPE} selectedSn={sn} onSelect={handleSelectDevice} />
        </div>
        <div className="pb-resizer" {...leftPanel.handleProps} />

        <div className="pb-main">
          <div className="pb-map-wrap" style={{ cursor: liveLoading ? "progress" : undefined }}>
            <MapView
              sn={sn}
              label={label}
              latest={isLiveMode ? latest : null}
              trajectory={dataSource === "historical" ? historicalTraj : sessionTraj}
              showLine={false}
              showFences={showFences}
              zones={zones}
              isPlaybackPage={true}
              staticDots={staticDots}
              focusPoint={focusTarget}
              onFocusGroup={handleFocusGroup}
              getGeocode={getGeocode}
            />
            <LocatingOverlay 
              isVisible={liveLoading} 
              error={liveError} 
              onRetry={() => refreshLive(sn, false)} 
            />
            {histLoading && <TPLLoader overlay label="Loading playback…" />}
          </div>

        </div>

        {/* Stops sidebar — aggregation details for the clicked stop */}
        <div className="pb-resizer" {...rightPanel.handleProps} />
        <aside className="pb-visit-log" style={{ width: rightPanel.width }}>
          {!sn ? (
            <div className="pb-vl-empty">
              
            </div>
          ) : selectedGroup ? (
            <StopDetail
              group={selectedGroup}
              getGeocode={getGeocode}
              onBack={() => setSelectedGroup(null)}
              onFocusPoint={handleFocusPoint}
            />
          ) : (
            <>
              <div className="pb-vl-header">
                <div className="pb-vl-title">{label || sn}</div>
                {label && <div className="pb-vl-sn">{sn}</div>}
                <div className="pb-vl-meta">
                  {isLiveMode
                    ? <span className="pb-vl-badge-live">● Live</span>
                    : <span className="pb-vl-badge-pb">{stops.length} stop{stops.length !== 1 ? "s" : ""} in range</span>
                  }
                </div>
              </div>

              <div className="pb-vl-list">
                {isLiveMode ? (
                  <div className="pb-vl-hint">
                    Live mode — load a date range to see visited stops
                  </div>
                ) : stops.length === 0 ? (
                  <div className="pb-vl-hint">
                    No stops in this range
                  </div>
                ) : (
                  <div className="pb-vl-feed">
                    {stops.map((group, i) => (
                      <StopSummary
                        key={group.key}
                        group={group}
                        index={i}
                        getGeocode={getGeocode}
                        onClick={setSelectedGroup}
                      />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
