import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import MapView from "../components/MapView.jsx";
import DeviceSidebar from "../components/Devicesidebar.jsx";
import TPLLoader from "../components/TPLLoader.jsx";
import { useCityTag } from "../hooks/useCityTag.js";
import { useSidebarDevices } from "../hooks/useSidebarDevices.js";
import { useZoneCache } from "../context/ZoneCacheContext.jsx";
import { loadSidebarScopeState, saveSidebarScopeState } from "../utils/sidebarPageState.js";
import { landmarkDisplayFromPoint, landmarkFromPoint, parseLandmarkDisplay, clientReverseGeocode, mapboxReverseGeocode, mapboxGeoLabelString } from "../utils/landmark.js";
import "./PlaybackPage.css";

const PLAYBACK_SCOPE = "playback";


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

const SPEEDS = [
  { label: "0.5×",  value: 10000 },
  { label: "1×",    value: 5000  },
  { label: "1.5×",  value: 2500  },
  { label: "2×",    value: 1200  },
  { label: "4×",    value: 600   },
  { label: "8×",    value: 300   },
];

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

  const [playbackIndex, setPlaybackIndex]   = useState(0);
  const [playing, setPlaying]               = useState(false);
  const [speed, setSpeed]                   = useState(5000);

  const [histLoading, setHistLoading]       = useState(false);
  const [histError, setHistError]           = useState("");
  const [lastUpdated, setLastUpdated]       = useState(null);
  const [activeShortcut, setActiveShortcut] = useState(null);


  const visitLogRef    = useRef(null);
  const pendingGeoRef  = useRef(new Set());
  const [geocodeCache, setGeocodeCache] = useState({});

  // Stable staticDots ref so MapView only re-renders dots when data actually changes
  const staticDots = useMemo(
    () => dataSource === "historical" ? historicalTraj : [],
    [dataSource, historicalTraj]
  );

  // Visited points for the sidebar log (chronological, up to current playback position)
  const visitedPoints = useMemo(() => {
    if (isLiveMode) return [];
    const traj = dataSource === "historical" ? historicalTraj : sessionTraj;
    return traj.slice(0, playbackIndex + 1);
  }, [isLiveMode, dataSource, historicalTraj, sessionTraj, playbackIndex]);

  // Auto-scroll visit log to the latest entry
  useEffect(() => {
    if (visitLogRef.current) {
      visitLogRef.current.scrollTop = visitLogRef.current.scrollHeight;
    }
  }, [playbackIndex]);

  // Client-side reverse geocode for the current active point when backend landmark is missing
  useEffect(() => {
    if (isLiveMode || visitedPoints.length === 0) return;
    const pt = visitedPoints[visitedPoints.length - 1];
    if (!pt || landmarkFromPoint(pt)) return; // already has backend landmark

    const lat = Number(pt.lat ?? pt.latitude ?? pt.gpsLat ?? pt.wgLat);
    const lng = Number(pt.lng ?? pt.lon ?? pt.longitude ?? pt.gpsLng ?? pt.wgLng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
    if (key in geocodeCache || pendingGeoRef.current.has(key)) return;

    pendingGeoRef.current.add(key);
    // Same fallback chain as the device detail / map view pages:
    // TPLMaps client geocode → backend getGeocode → Mapbox reverse geocode.
    ;(async () => {
      let label = null;
      try { label = await clientReverseGeocode(lat, lng); } catch {}
      if (!label) {
        try { const geo = await getGeocode(lat, lng); if (geo?.landmark) label = geo.landmark; } catch {}
      }
      if (!label) {
        try {
          const mbx = await mapboxReverseGeocode(lat, lng, import.meta.env.VITE_MAPBOX_TOKEN);
          if (mbx) label = mapboxGeoLabelString(mbx);
        } catch {}
      }
      pendingGeoRef.current.delete(key);
      setGeocodeCache(prev => ({ ...prev, [key]: label ? parseLandmarkDisplay(label) : null }));
    })();
  }, [visitedPoints, isLiveMode]); // eslint-disable-line react-hooks/exhaustive-deps

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
    setPlaying(false);
    setPlaybackIndex(0);
    setIsLiveMode(true);
    setDataSource("session");
    setHistError("");
    setActiveShortcut(null);
    setGeocodeCache({});
    pendingGeoRef.current.clear();
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
      const res    = await getPlayback(sn, start, end);
      const points = normalisePlayback(res);
      if (points.length === 0) throw new Error("No data found in that time range");
      setHistoricalTraj(points);
      setDataSource("historical");
      setPlaying(false);
      setPlaybackIndex(0);
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
    if (!playing) return;
    if (playbackIndex >= trajectory.length - 1) {
      setPlaying(false);
      if (dataSource === "session") setIsLiveMode(true);
      return;
    }
    const t = setTimeout(() => setPlaybackIndex((i) => i + 1), speed);
    return () => clearTimeout(t);
  }, [playing, playbackIndex, trajectory.length, speed, dataSource]);

  useEffect(() => { if (playing) setIsLiveMode(false); }, [playing]);

  const playbackPoint = useMemo(() => {
    if (!isLiveMode && playbackIndex < trajectory.length) return trajectory[playbackIndex];
    return null;
  }, [isLiveMode, playbackIndex, trajectory]);

  // ── Trajectory for MapView ────────────────────────────────────────────────
  // For the Playback page, we pass the FULL unsliced trajectory and let
  // MapView's isolated playback renderer control which segments are visible
  // via the playbackIndex prop. This is what enables strict one-segment-at-a-time
  // growth — MapView advances its own committed pointer instead of receiving a
  // pre-sliced array that can jump many points at once on seek/scrub.
  //
  // In live mode, MapView clears all pb layers automatically (isLiveMode guard).
  const trajectoryForMap = trajectory;

  const handlePlay   = () => {
    if (trajectory.length === 0) { setHistError("No data yet. Collect live points or load historical."); return; }
    if (playbackIndex >= trajectory.length - 1) setPlaybackIndex(0);
    setPlaying(true);
    setIsLiveMode(false);
  };
  const handlePause  = () => setPlaying(false);
  const handleReset  = () => { setPlaybackIndex(0); setPlaying(false); if (dataSource === "session") setIsLiveMode(true); };
  const handleSlider = (e) => { setPlaybackIndex(Number(e.target.value)); setPlaying(false); setIsLiveMode(false); };

  const progress  = trajectory.length > 1 ? Math.round((playbackIndex / (trajectory.length - 1)) * 100) : 0;
  const infoPoint = isLiveMode ? latest : (trajectory[playbackIndex] ?? null);

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
          <select className="pb-select" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
            {SPEEDS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {sn && (
            <div className="pb-source-toggle">
              <button className={`pb-source-btn ${dataSource === "session" ? "active" : ""}`}
                onClick={() => { setDataSource("session"); setPlaying(false); setPlaybackIndex(0); setIsLiveMode(true); }}>
                Session
              </button>
              <button
                className={`pb-source-btn ${dataSource === "historical" ? "active" : ""}`}
                onClick={() => { setDataSource("historical"); setPlaying(false); setPlaybackIndex(0); setIsLiveMode(false); }}
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
              playbackIndex={playbackIndex}
              staticDots={staticDots}
              isPlaying={playing}
            />
            {histLoading && <TPLLoader overlay label="Loading playback…" />}
          </div>

          {/* Playback controls */}
          <div className="pb-controls-strip">
            <div className="pb-engine-btns">
              <button className="pb-play-btn" onClick={playing ? handlePause : handlePlay} disabled={trajectory.length === 0}>
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
                  {trajectory.length === 0
                    ? (sn ? "Collecting points…" : "Select a device")
                    : `${playbackIndex + 1} / ${trajectory.length}`}
                </span>
              </div>
              <input type="range" className="pb-slider"
                min={0} max={Math.max(0, trajectory.length - 1)}
                value={playbackIndex} onChange={handleSlider}
                disabled={trajectory.length === 0}
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
                {`Playback · ${SPEEDS.find(o => o.value === speed)?.label}`}
              </div>
            )}

            <button className="pb-clear-btn" onClick={() => {
              setSessionTraj([]); setHistoricalTraj([]);
              setLatest(null); setPlaybackIndex(0);
              setPlaying(false); setIsLiveMode(true); setDataSource("session");
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
                    : <span className="pb-vl-badge-pb">▶ Playback · {visitedPoints.length}/{trajectory.length}</span>
                  }
                </div>
              </div>

              <div className="pb-vl-list" ref={visitLogRef}>
                {visitedPoints.length === 0 ? (
                  <div className="pb-vl-hint">
                    {dataSource === "historical"
                      ? "Press Play or scrub the slider to see visited locations"
                      : isLiveMode
                        ? "Live mode — load a date range to replay history"
                        : "Waiting for points…"}
                  </div>
                ) : (
                  visitedPoints.map((pt, i) => {
                    // Use backend landmark if present, else fall back to client geocode cache
                    const geo = (() => {
                      const backend = landmarkDisplayFromPoint(pt);
                      if (backend) return backend;
                      const lat = Number(pt?.lat ?? pt?.latitude ?? pt?.gpsLat ?? pt?.wgLat);
                      const lng = Number(pt?.lng ?? pt?.lon ?? pt?.longitude ?? pt?.gpsLng ?? pt?.wgLng);
                      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
                      return geocodeCache[`${lat.toFixed(5)},${lng.toFixed(5)}`] ?? null;
                    })();
                    const ts  = formatTs(pt);
                    const isLatest = i === visitedPoints.length - 1;
                    return (
                      <div key={i} className={`pb-vl-item${isLatest ? " pb-vl-item-active" : ""}`}>
                        <div className="pb-vl-item-num">{i + 1}</div>
                        <div className="pb-vl-item-body">
                          <div className="pb-vl-item-loc">
                            {geo?.primary
                              ? (geo.isSpecific ? geo.primary : `Near ${geo.primary}`)
                              : <span className="pb-vl-muted">No landmark</span>}
                          </div>
                          {geo?.secondary && <div className="pb-vl-item-area">{geo.secondary}</div>}
                          <div className="pb-vl-item-ts">{ts}</div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}