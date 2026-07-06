import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import MapView from "../components/MapView.jsx";
import DeviceSidebar from "../components/Devicesidebar.jsx";
import TPLLoader from "../components/TPLLoader.jsx";
import { useCityTag } from "../hooks/useCityTag.js";
import { useSidebarDevices } from "../hooks/useSidebarDevices.js";
import { useZoneCache } from "../context/ZoneCacheContext.jsx";
import { loadSidebarScopeState, saveSidebarScopeState } from "../utils/sidebarPageState.js";
import { peekGeocode, resolveGeocode } from "../utils/geocodeCache.js";
import { usePlaybackStore, SPEEDS } from "../store/usePlaybackStore.js";
import { getCachedPlayback } from "../utils/playbackCache.js";
import { clusterStops, stopDurationMs, formatStopDuration } from "../utils/stopClustering.js";
import "./PlaybackPage.css";

const PLAYBACK_SCOPE = "playback";

const VisitLogItem = React.memo(({ group, nextGroup, index, isLatest, getGeocode }) => {
  // Points near the same landmark and close together in time are grouped
  // into one row (see clusterStops) instead of each ping getting its own —
  // the representative point (the group's first) drives the landmark
  // lookup; a multi-point group additionally shows a silently-computed
  // stop duration instead of a single timestamp.
  const pt = group.points[0];
  const isStop = group.points.length > 1;
  const geoPoint = useMemo(() => ({ ...pt, landmark: group.landmark ?? pt?.landmark }), [pt, group.landmark]);

  const [geo, setGeo] = useState(() => peekGeocode(geoPoint));

  useEffect(() => {
    if (geo) return;
    let isMounted = true;
    resolveGeocode(geoPoint, getGeocode).then((result) => {
      if (isMounted) setGeo(result);
    });
    return () => { isMounted = false; };
  }, [geoPoint, geo, getGeocode]);

  return (
    <div className={`pb-vl-item${isStop ? " pb-vl-item-stop" : ""}${isLatest ? " pb-vl-item-active pb-vl-item-new" : ""}`}>
      <div className="pb-vl-item-num">{index + 1}</div>
      <div className="pb-vl-item-body">
        <div className="pb-vl-item-loc">
          {geo?.primary
            ? (geo.isSpecific ? geo.primary : `Near ${geo.primary}`)
            : <span className="pb-vl-muted">No landmark</span>}
        </div>
        {geo?.secondary && <div className="pb-vl-item-area">{geo.secondary}</div>}
        {isStop ? (
          <div className="pb-vl-item-stop-duration">
            <span className="pb-vl-stop-badge">STOP</span>
            {nextGroup ? formatStopDuration(stopDurationMs(group, nextGroup)) : 'Ongoing'}
          </div>
        ) : (
          <div className="pb-vl-item-ts">{formatTs(pt)}</div>
        )}
      </div>
    </div>
  );
});


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
    return loadSidebarScopeState(PLAYBACK_SCOPE).selectedSn || "";
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

  const {
    geoJson,
    rawPoints,
    totalDistance,
    cumulativeDistances,
    currentDistance,
    isPlaying: playing,
    speedMultiplier: speed,
    loadTrajectory,
    play: handlePlay,
    pause: handlePause,
    setSpeedMultiplier,
    seek,
    reset,
    clear
  } = usePlaybackStore();

  const [histLoading, setHistLoading]       = useState(false);
  const [histError, setHistError]           = useState("");
  const [lastUpdated, setLastUpdated]       = useState(null);
  const [activeShortcut, setActiveShortcut] = useState(null);

  const visitLogRef      = useRef(null);
  // Whether the log should keep auto-following the newest entry. Starts true
  // (bottom-anchored); flips false if the user scrolls away to inspect
  // earlier history, and flips back true once they scroll near the bottom
  // again themselves.
  const followBottomRef  = useRef(true);

  // Stable staticDots ref so MapView only re-renders dots when data actually changes
  const staticDots = useMemo(
    () => dataSource === "historical" ? historicalTraj : [],
    [dataSource, historicalTraj]
  );

  // How many points have been "visited" so far. Computed separately from
  // the sliced array below: currentDistance changes every animation frame
  // during playback, but this index (a primitive) only actually changes
  // value when playback crosses the next waypoint — so useMemo correctly
  // skips recomputing `visitedPoints` on frames where nothing really
  // changed, instead of slicing a brand-new array 60x/sec regardless. That
  // churn was forcing the entire visible log window to re-render every
  // frame, which was fighting the scroll-to-bottom effect below.
  const visitedIdx = useMemo(() => {
    if (isLiveMode) return 0;
    const arr = cumulativeDistances;
    // Binary search instead of a linear scan-from-zero — arr is
    // monotonically non-decreasing (cumulative sums), so this is safe and
    // handles both forward progress and backward seeks in O(log n) instead
    // of O(n) per frame, which matters once there are thousands of points.
    let lo = 0, hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (arr[mid] <= currentDistance) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }, [isLiveMode, currentDistance, cumulativeDistances]);

  // Visited points for the sidebar log (chronological, up to current playback position)
  const visitedPoints = useMemo(() => {
    if (isLiveMode) return [];
    if (visitedIdx === 0) return [rawPoints[0]].filter(Boolean);
    return rawPoints.slice(0, visitedIdx);
  }, [isLiveMode, visitedIdx, rawPoints]);

  // Points near the same landmark (or close together) within a short time
  // gap collapse into a single "stop" row instead of each ping getting its
  // own — same grouping MapView uses for the dots/lines, so the sidebar and
  // map always agree on what counts as one visit.
  const visitedGroups = useMemo(() => clusterStops(visitedPoints), [visitedPoints]);

  // Cap rendered DOM nodes to the most recent N entries for performance on
  // long playback ranges — numbering still reflects true position in the
  // full visited list (not renumbered from 1 within the visible slice).
  const VISIT_LOG_CAP = 300;
  const visibleLogItems = useMemo(() => {
    const start = Math.max(0, visitedGroups.length - VISIT_LOG_CAP);
    const items = [];
    for (let i = start; i < visitedGroups.length; i++) {
      items.push({ index: i, group: visitedGroups[i], nextGroup: visitedGroups[i + 1] });
    }
    return items;
  }, [visitedGroups]);

  // Auto-scroll: keep the newest entry pinned at the bottom while playing,
  // but only while the user is actually following along — if they've
  // scrolled up to inspect earlier history, don't yank them back down.
  // Depends on visitedGroups (rendered rows), not visitedPoints (raw pings)
  // — several new points can land inside the currently-open stop group
  // without adding a new visible row, and that shouldn't force a scroll.
  useLayoutEffect(() => {
    if (visitedGroups.length <= 1) followBottomRef.current = true; // fresh session/range — start following again
    const el = visitLogRef.current;
    if (!el || !playing || !followBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [visitedGroups.length, playing]);

  const handleLogScroll = useCallback((e) => {
    const el = e.currentTarget;
    followBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
  }, []);


  const refreshLive = useCallback(async (target) => {
    const dev = target ?? sn;
    if (!dev || !isLiveMode) return;
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
    } catch { /* silent */ }
  }, [sn, isLiveMode, getLatestLocation]);


  useEffect(() => {
    if (sn) saveSidebarScopeState(PLAYBACK_SCOPE, { selectedSn: sn });
  }, [sn]);

  useEffect(() => {
    const param = searchParams.get("device");
    if (param) void ensureDevice(param);
  }, [searchParams, ensureDevice]);

  const handleSelectDevice = (device) => {
    const newSn    = typeof device === "string" ? device : (device?.sn ?? "");
    const newLabel = typeof device === "string" ? "" : (device?.assignedUser ?? "");
    setSn(newSn);
    setLabel(newLabel);
    setSessionTraj([]);
    setHistoricalTraj([]);
    setLatest(null);
    clear();
    setIsLiveMode(true);
    setDataSource("session");
    setHistError("");
    setActiveShortcut(null);
    followBottomRef.current = true;
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
      const points = await getCachedPlayback(sn, start, end, async (deviceSn, rangeStart, rangeEnd) => {
        const res = await getPlayback(deviceSn, rangeStart, rangeEnd);
        return normalisePlayback(res);
      });
      if (points.length === 0) throw new Error("No data found in that time range");
      setHistoricalTraj(points);
      setDataSource("historical");
      setIsLiveMode(false);
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

  /* ── Playback engine ──────────────────────────── */
  const trajectory = dataSource === "historical" ? historicalTraj : sessionTraj;

  useEffect(() => {
    loadTrajectory(trajectory);
  }, [trajectory, loadTrajectory]);

  useEffect(() => { if (playing) setIsLiveMode(false); }, [playing]);

  const playbackPoint = useMemo(() => {
    if (!isLiveMode && geoJson) {
      return { lat: 0, lng: 0 }; // dummy point to keep playback active in MapView props
    }
    return null;
  }, [isLiveMode, geoJson]);

  const trajectoryForMap = trajectory;

  const handlePlayAction = () => {
    if (rawPoints.length === 0) { setHistError("No data yet. Collect live points or load historical."); return; }
    handlePlay();
    setIsLiveMode(false);
  };
  const handlePauseAction  = () => handlePause();
  const handleReset  = () => { reset(); if (dataSource === "session") setIsLiveMode(true); };
  const handleSlider = (e) => { seek(Number(e.target.value)); handlePause(); setIsLiveMode(false); };

  const progress  = totalDistance > 0 ? (currentDistance / totalDistance) * 100 : 0;
  const infoPoint = isLiveMode ? latest : (visitedPoints[visitedPoints.length - 1] ?? null);

  return (
    <div className="pb-page">

      {/* ── Top bar ────────────────────────────────── */}
      <div className="pb-topbar">
        <div className="pb-topbar-left">
          <span className="pb-topbar-label">Playback</span>
          {sn && <span className="pb-topbar-sn">{sn}</span>}
          {sn && (
            <span className={`pb-pill ${!isLiveMode ? "pill-playback" : latest ? "pill-live" : "pill-dim"}`}>
              <span className="pb-pill-dot" />
              {!isLiveMode ? "Playback" : latest ? "Live" : "Searching"}
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
              <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setActiveShortcut(null); }} />
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
              <input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setActiveShortcut(null); }} />
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
          <select className="pb-select" value={speed} onChange={(e) => setSpeedMultiplier(Number(e.target.value))}>
            {SPEEDS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {sn && (
            <div className="pb-source-toggle">
              <button className={`pb-source-btn ${dataSource === "session" ? "active" : ""}`}
                onClick={() => { setDataSource("session"); clear(); setIsLiveMode(true); }}>
                Session
              </button>
              <button
                className={`pb-source-btn ${dataSource === "historical" ? "active" : ""}`}
                onClick={() => { setDataSource("historical"); clear(); setIsLiveMode(false); }}
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
        <DeviceSidebar scope={PLAYBACK_SCOPE} selectedSn={sn} onSelect={handleSelectDevice} />

        <div className="pb-main">
          <div className="pb-map-wrap">
            <MapView
              sn={sn}
              label={label}
              latest={latest}
              trajectory={trajectoryForMap}
              playbackPoint={playbackPoint}
              showLine={false}
              showFences={showFences}
              zones={zones}
              playbackSpeed={speed}
              isPlaybackPage={true}
              staticDots={staticDots}
              isPlaying={playing}
              getGeocode={getGeocode}
            />
            {histLoading && <TPLLoader overlay label="Loading playback…" />}
          </div>

          {/* Playback controls */}
          <div className="pb-controls-strip">
            <div className="pb-engine-btns">
              <button className="pb-play-btn" onClick={playing ? handlePauseAction : handlePlayAction} disabled={rawPoints.length === 0}>
                {playing
                  ? <><svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>Pause</>
                  : <><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>Play</>
                }
              </button>
              <button className="pb-ctrl-btn" onClick={handleReset}>
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>
                Reset
              </button>
            </div>

            <div className="pb-timeline">
              <div className="pb-timeline-header">
                <span className="pb-tl-label">
                  {rawPoints.length === 0
                    ? (sn ? "Collecting points…" : "Select a device")
                    : `${visitedPoints.length} / ${rawPoints.length}`}
                </span>
              </div>
              <input type="range" className="pb-slider"
                min={0} max={totalDistance || 1} step={(totalDistance || 1) / 1000}
                value={currentDistance} onChange={handleSlider}
                disabled={rawPoints.length === 0}
              />
              <div className="pb-progress-bar">
                <div className="pb-progress-fill" style={{ width: `${progress}%` }} />
              </div>
            </div>

            <div className="pb-point-info">
              <span className="pb-point-label">Time</span>
              <span className="pb-point-val">{formatTs(infoPoint)}</span>
            </div>

            {!isLiveMode && (
              <div className="pb-mode-badge badge-playback">
                <span className="badge-dot" />
                {`Playback · ${SPEEDS.find(o => o.value === speed)?.label || '1x'}`}
              </div>
            )}

            <button className="pb-clear-btn" onClick={() => {
              setSessionTraj([]); setHistoricalTraj([]);
              setLatest(null); clear();
              setIsLiveMode(true); setDataSource("session");
              setActiveShortcut(null);
            }}>Clear</button>
          </div>
        </div>

        {/* Visit log sidebar */}
        <aside className="pb-visit-log">
          {!sn ? (
            <div className="pb-vl-empty">
              <div className="pb-vl-empty-icon">▶</div>
              <div>Select a device to begin playback</div>
            </div>
          ) : (
            <>
              <div className="pb-vl-header">
                <div className="pb-vl-title">{label || sn}</div>
                {label && <div className="pb-vl-sn">{sn}</div>}
                <div className="pb-vl-meta">
                  {isLiveMode
                    ? <span className="pb-vl-badge-live">● Live</span>
                    : <span className="pb-vl-badge-pb">▶ Playback · {visitedPoints.length}/{rawPoints.length}</span>
                  }
                </div>
              </div>

              <div className="pb-vl-list" ref={visitLogRef} onScroll={handleLogScroll}>
                {visitedPoints.length === 0 ? (
                  <div className="pb-vl-hint">
                    {dataSource === "historical"
                      ? "Press Play or scrub the slider to see visited locations"
                      : isLiveMode
                        ? "Live mode — load a date range to replay history"
                        : "Waiting for points…"}
                  </div>
                ) : (
                  <div className="pb-vl-feed">
                    {visibleLogItems.map(({ index, group, nextGroup }) => (
                      <VisitLogItem
                        key={index}
                        index={index}
                        group={group}
                        nextGroup={nextGroup}
                        isLatest={index === visitedGroups.length - 1}
                        getGeocode={getGeocode}
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