import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import MapView from "../components/MapView.jsx";
import MultiDeviceSidebar from "../components/MultiDeviceSidebar.jsx";
import TPLLoader from "../components/TPLLoader.jsx";
import { useCityTag } from "../hooks/useCityTag.js";
import { useSidebarDevices } from "../hooks/useSidebarDevices.js";
import { useZoneCache } from "../context/ZoneCacheContext.jsx";
import { deviceColor } from "../utils/zonePolygonManager.js";
import "./MapViewPage.css";

export default function MapViewPage() {
  const [searchParams] = useSearchParams();
  const { getLatestLocationsBatch } = useCityTag();
  const { getDevice, ensureDevice } = useSidebarDevices();
  const { zones } = useZoneCache();

  const [selectedSns, setSelectedSns] = useState(() => {
    const param = searchParams.get("device");
    return param ? new Set([param]) : new Set();
  });
  const [deviceLocations, setDeviceLocations] = useState({});
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [intervalSec, setIntervalSec] = useState(15);
  const [showFences, setShowFences]   = useState(false);

  const intervalRef = useRef(null);

  useEffect(() => {
    const param = searchParams.get("device");
    if (param) void ensureDevice(param);
  }, [searchParams, ensureDevice]);

  const refresh = useCallback(async () => {
    if (selectedSns.size === 0) return;
    setLoading(true);
    setError("");
    try {
      // Single batch request instead of N individual calls
      const sns = [...selectedSns];
      const res = await getLatestLocationsBatch(sns);
      // Response shape: { locations: { [sn]: { lat, lng, timestamp, batteryStatus, ... } } }
      //               OR { results: [{ sn, latest: {...} }] }
      const locMap = res?.locations ?? {};
      const resultList = res?.results ?? [];
      setDeviceLocations(prev => {
        const next = { ...prev };
        // Handle { locations: { sn: point } } format
        Object.entries(locMap).forEach(([sn, point]) => {
          if (point) next[sn] = point;
        });
        // Handle { results: [{ sn, latest }] } format
        resultList.forEach(r => {
          if (r?.sn && r?.latest) next[r.sn] = r.latest;
        });
        return next;
      });
      setLastUpdated(new Date());
    } catch (err) {
      setError(err.message || "Failed to fetch locations");
    } finally {
      setLoading(false);
    }
  }, [selectedSns, getLatestLocationsBatch]);

  // Fetch immediately when selection changes
  useEffect(() => {
    if (selectedSns.size === 0) return;
    refresh();
  }, [selectedSns]); // intentionally omitting refresh — selection change is the trigger

  // Auto-refresh interval
  useEffect(() => {
    clearInterval(intervalRef.current);
    if (autoRefresh && selectedSns.size > 0) {
      intervalRef.current = setInterval(refresh, intervalSec * 1000);
    }
    return () => clearInterval(intervalRef.current);
  }, [autoRefresh, intervalSec, selectedSns.size, refresh]);

  // When selection changes, clean up locations for deselected devices
  function handleSelectionChange(newSns) {
    setSelectedSns(newSns);
    setDeviceLocations(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(sn => { if (!newSns.has(sn)) delete next[sn]; });
      return next;
    });
  }

  // Build the multiDevices array that MapView renders
  const multiDevices = useMemo(() => {
    return [...selectedSns].map(sn => {
      const device = getDevice(sn);
      const label  = device?.assigned_user_name ?? device?.assignedUser ?? sn;
      return {
        sn,
        label,
        latest: deviceLocations[sn] ?? null,
        color:  deviceColor(sn),
      };
    });
  }, [selectedSns, deviceLocations, getDevice]);

  const onlineCount = multiDevices.filter(d => d.latest != null).length;

  // Most recent actual location timestamp across the selected devices
  // (the device's last online time — NOT the wall-clock fetch time).
  const lastSeenTime = useMemo(() => {
    let latestMs = null;
    multiDevices.forEach(d => {
      const p = d.latest;
      const ts = p?.timestamp ?? p?.time ?? p?.locTime;
      if (ts == null) return;
      const ms = new Date(ts).getTime();
      if (!isNaN(ms) && (latestMs == null || ms > latestMs)) latestMs = ms;
    });
    return latestMs != null ? new Date(latestMs) : null;
  }, [multiDevices]);

  return (
    <div className="mv-page">

      <div className="mv-topbar">
        <div className="mv-topbar-left">
          <span className="mv-topbar-label">Map View</span>
          {selectedSns.size > 0 && (
            <span className="mv-topbar-sn">
              {selectedSns.size} device{selectedSns.size !== 1 ? "s" : ""}
            </span>
          )}
          {selectedSns.size > 0 && (
            <span className={`mv-pill ${onlineCount > 0 ? "pill-online" : "pill-searching"}`}>
              <span className="mv-pill-dot" />
              {loading ? "Fetching…" : `${onlineCount} / ${selectedSns.size} live`}
            </span>
          )}
          {lastUpdated && (
            <span className="mv-pill pill-time">Updated {lastUpdated.toLocaleTimeString()}</span>
          )}
          {selectedSns.size > 0 && (
            <button className="mv-refresh-btn" onClick={() => refresh()} disabled={loading}>
              <svg viewBox="0 0 20 20" fill="currentColor" className={loading ? "mv-spin" : ""}>
                <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd"/>
              </svg>
              Refresh
            </button>
          )}
        </div>

        <div className="mv-topbar-right">
          <label className="mv-toggle-label">
            <button className={`mv-toggle ${autoRefresh ? "on" : "off"}`} onClick={() => setAutoRefresh(v => !v)}>
              <span className="mv-toggle-knob" />
            </button>
            Auto-refresh
          </label>
          <input
            type="number" className="mv-interval-input"
            value={intervalSec} min={5} max={300}
            disabled={!autoRefresh}
            onChange={(e) => setIntervalSec(Number(e.target.value))}
          />
          <span className="mv-unit">sec</span>
          <button
            className={`mv-fence-btn${showFences ? " active" : ""}`}
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

      {error && (
        <div className="mv-error">
          <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
          {error}
          <button className="mv-error-close" onClick={() => setError("")}>✕</button>
        </div>
      )}

      <div className="mv-body">
        <MultiDeviceSidebar
          selectedSns={selectedSns}
          onSelectionChange={handleSelectionChange}
          deviceLocations={deviceLocations}
          fetchingAll={loading}
        />

        <div className="mv-map-area">
          <div className="mv-map-wrap">
            <MapView
              sn=""
              label=""
              latest={null}
              trajectory={[]}
              playbackPoint={null}
              multiDevices={multiDevices}
              showFences={showFences}
              zones={zones}
            />
            {/* Branded loader only on the FIRST fetch (nothing on the map yet) —
                not on every auto-refresh tick. */}
            {loading && onlineCount === 0 && selectedSns.size > 0 && (
              <TPLLoader overlay label="Fetching live locations…" />
            )}
          </div>

          {selectedSns.size > 0 && (
            <div className="mv-info-strip">
              <div className="mv-info-item">
                <span className="mv-info-label">Selected</span>
                <span className="mv-info-val">{selectedSns.size} device{selectedSns.size !== 1 ? "s" : ""}</span>
              </div>
              <div className="mv-info-sep" />
              <div className="mv-info-item">
                <span className="mv-info-label">Live location</span>
                <span className="mv-info-val mono">{onlineCount} / {selectedSns.size}</span>
              </div>
              {lastSeenTime && (
                <>
                  <div className="mv-info-sep" />
                  <div className="mv-info-item">
                    <span className="mv-info-label">Last updated</span>
                    <span className="mv-info-val">{lastSeenTime.toLocaleTimeString()}</span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
