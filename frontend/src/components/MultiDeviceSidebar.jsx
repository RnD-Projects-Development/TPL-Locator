import React from "react";
import tplLogo from "../assets/tpl.png";
import { useSidebarDevices } from "../hooks/useSidebarDevices.js";
import "./MultiDeviceSidebar.css";

function fmtTs(point) {
  const ts = point?.timestamp ?? point?.time ?? point?.locTime;
  if (!ts) return null;
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch { return null; }
}

function fmtCoords(point) {
  const lat = point?.lat ?? point?.latitude ?? point?.gpsLat;
  const lng = point?.lng ?? point?.lon ?? point?.longitude ?? point?.gpsLng;
  if (lat == null || lng == null) return null;
  return `${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}`;
}

export default function MultiDeviceSidebar({
  selectedSns,
  onSelectionChange,
  deviceLocations = {},
  fetchingAll = false,
}) {
  const {
    displayDevices,
    recentDevices,
    defaultDevices,
    searchTerm,
    setSearchTerm,
    isSearching,
    loading,
    error,
    total,
    online,
    offline,
    refresh,
    recordRecent,
  } = useSidebarDevices();

  const defaultSnSet = new Set(defaultDevices.map((d) => d.sn));
  const recentOnly = recentDevices.filter((d) => !defaultSnSet.has(d.sn));
  const showRecentSection = !isSearching && recentOnly.length > 0;

  const listDevices = isSearching ? displayDevices : defaultDevices;
  const filteredSns = listDevices.map((d) => d.sn ?? "").filter(Boolean);
  const allFilteredSelected = filteredSns.length > 0 && filteredSns.every((sn) => selectedSns.has(sn));

  function toggleDevice(device) {
    recordRecent(device);
    const sn = device.sn;
    const next = new Set(selectedSns);
    if (next.has(sn)) next.delete(sn);
    else next.add(sn);
    onSelectionChange(next);
  }

  function selectAll() {
    const next = new Set(selectedSns);
    displayDevices.forEach((d) => { if (d.sn) next.add(d.sn); });
    onSelectionChange(next);
  }

  function clearAll() {
    onSelectionChange(new Set());
  }

  function renderDevice(d) {
    const sn           = d.sn ?? "unknown";
    const status       = d.status ?? "offline";
    const client       = d.client ?? null;
    const assignedUser = d.assigned_user_name ?? d.assignedUser ?? null;
    const isSelected   = selectedSns.has(sn);

    const point        = deviceLocations[sn] ?? null;
    const isFetching   = isSelected && !point && fetchingAll;
    const hasLocation  = isSelected && point != null;
    const locTime      = hasLocation ? fmtTs(point) : null;
    const locCoords    = hasLocation ? fmtCoords(point) : null;

    return (
      <label key={sn} className={`mdsb-item ${isSelected ? "selected" : ""}`}>
        <input
          type="checkbox"
          className="mdsb-checkbox"
          checked={isSelected}
          onChange={() => toggleDevice(d)}
        />

        <div className={`mdsb-icon ${status === "online" ? "icon-online" : "icon-offline"}`}>
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/>
          </svg>
        </div>

        <div className="mdsb-info">
          <div className="mdsb-sn">{assignedUser || sn}</div>
          {assignedUser && <div className="mdsb-sub">{sn}</div>}
          {client && <div className="mdsb-client">{client}</div>}

          {isFetching && (
            <div className="mdsb-live-row fetching">
              <svg className="mdsb-spin-icon" viewBox="0 0 20 20" fill="currentColor" width={9} height={9}>
                <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd"/>
              </svg>
              Fetching location…
            </div>
          )}
          {hasLocation && locCoords && (
            <div className="mdsb-live-row live">
              <span className="mdsb-live-dot" />
              <span className="mdsb-live-coords">{locCoords}</span>
              {locTime && <span className="mdsb-live-time">{locTime}</span>}
            </div>
          )}
          {isSelected && !isFetching && !hasLocation && (
            <div className="mdsb-live-row no-signal">No GPS signal</div>
          )}

          {!assignedUser && !isSelected && (
            <div style={{ fontSize: 9, color: "#52525b", marginTop: 2, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Unbound
            </div>
          )}
        </div>

        <div className="mdsb-right">
          <span className={`mdsb-dot ${status === "online" ? "dot-online" : "dot-offline"}`} />
        </div>
      </label>
    );
  }

  return (
    <div className="mdsb-sidebar">

      <div className="mdsb-header">
        <div className="mdsb-title">
          Locators
          <span className="mdsb-count" title="Total locators in your account">
            {isSearching ? displayDevices.length : total}
          </span>
        </div>
        <div className="mdsb-stats">
          <span className="mdsb-stat online">● {online} online</span>
          <span className="mdsb-stat offline">● {offline} offline</span>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          title="Refresh locators"
          className="mdsb-refresh-icon-btn"
          onMouseEnter={(e) => { if (!loading) e.currentTarget.style.color = "#fca5a5"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = loading ? "#3f3f46" : "#71717a"; }}
        >
          <svg
            viewBox="0 0 20 20" fill="currentColor" width={14} height={14}
            style={{ animation: loading ? "mdsbSpin 0.8s linear infinite" : "none" }}
          >
            <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd"/>
          </svg>
        </button>
      </div>

      <div className="mdsb-select-bar">
        <button
          className="mdsb-sel-btn"
          onClick={selectAll}
          disabled={allFilteredSelected || displayDevices.length === 0}
        >
          Select All
        </button>
        <button
          className="mdsb-sel-btn"
          onClick={clearAll}
          disabled={selectedSns.size === 0}
        >
          Clear
        </button>
        {selectedSns.size > 0 && (
          <span className="mdsb-sel-count">
            {selectedSns.size} selected
          </span>
        )}
      </div>

      <div className="mdsb-search-wrap">
        <svg className="mdsb-search-icon" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd"/>
        </svg>
        <input
          className="mdsb-search"
          placeholder="Search all locators…"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        {searchTerm && (
          <button className="mdsb-search-clear" onClick={() => setSearchTerm("")}>✕</button>
        )}
      </div>

      {!isSearching && !loading && (
        <div className="mdsb-hint">
          Showing {defaultDevices.length} of {total} · search for more
        </div>
      )}

      <div className="mdsb-list">

        {loading && (
          <div className="mdsb-state">
            <img
              src={tplLogo}
              alt="Loading"
              style={{
                width: 48, height: "auto",
                filter: "brightness(0) invert(1)",
                animation: "mdsbPulse 1.6s ease-in-out infinite",
              }}
            />
            <span style={{ fontSize: 10, color: "#52525b", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              {isSearching ? "Searching…" : "Loading locators…"}
            </span>
          </div>
        )}

        {!loading && error && (
          <div className="mdsb-state mdsb-error">{error}</div>
        )}

        {!loading && !error && displayDevices.length === 0 && (
          <div className="mdsb-state">
            {isSearching ? "No locators match your search" : "No locators found"}
          </div>
        )}

        {!loading && !error && showRecentSection && (
          <>
            <div className="mdsb-section-label">Recent</div>
            {recentOnly.map(renderDevice)}
            <div className="mdsb-section-label">Locators</div>
          </>
        )}

        {!loading && !error && listDevices.map(renderDevice)}
      </div>
    </div>
  );
}
