import React from "react";
import tplLogo from "../assets/tpl.png";
import { useSidebarDevices } from "../hooks/useSidebarDevices.js";
import "./MultiDeviceSidebar.css";

/* ── Detect device type the same way as Locators/Stickers pages ─────────── */
const isSticker = (sn) => /^\d+$/.test(String(sn ?? ""));

/* ── Locator icon ────────────────────────────────────────────────────────── */
function LocatorIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
    </svg>
  );
}

/* ── Sticker icon ────────────────────────────────────────────────────────── */
function StickerIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58s1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41s-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z"/>
    </svg>
  );
}

const TYPE_TABS = [
  { key: null,       label: "All"      },
  { key: "locator",  label: "Locators" },
  { key: "sticker",  label: "Stickers" },
];

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
    page,
    totalPages,
    hasNextPage,
    hasPreviousPage,
    goToPage,
    online,
    offline,
    refresh,
    recordRecent,
    deviceTypeFilter,
    setDeviceTypeFilter,
  } = useSidebarDevices();

  /* Title is always "Devices"; search/empty hints adapt to the active filter */
  const searchPlaceholder = deviceTypeFilter === "sticker" ? "Search stickers…" : deviceTypeFilter === "locator" ? "Search locators…" : "Search all devices…";
  const emptyLabel        = deviceTypeFilter === "sticker" ? "stickers" : deviceTypeFilter === "locator" ? "locators" : "devices";

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
          {isSticker(sn) ? <StickerIcon /> : <LocatorIcon />}
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
        {/* Row 1: title + refresh button */}
        <div className="mdsb-title">
          Devices
          <span className="mdsb-count" title={`Total ${emptyLabel} in your account`}>
            {isSearching ? displayDevices.length : total}
          </span>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          title={`Refresh ${emptyLabel}`}
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
        {/* Row 2: online/offline stats (wraps via flex-wrap) */}
        <div className="mdsb-stats">
          <span className="mdsb-stat online">● {online} online</span>
          <span className="mdsb-stat offline">● {offline} offline</span>
        </div>
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

      {/* ── Device type filter ─────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 3, padding: "6px 8px", borderBottom: "1px solid #1f1f22" }}>
        {TYPE_TABS.map(({ key, label }) => (
          <button
            key={String(key)}
            onClick={() => setDeviceTypeFilter(key)}
            style={{
              flex: 1, padding: "4px 0", borderRadius: 6, border: "none",
              fontSize: 10, fontWeight: 700, cursor: "pointer", transition: "all 0.15s",
              background: deviceTypeFilter === key ? "#A72C32" : "rgba(255,255,255,0.05)",
              color:      deviceTypeFilter === key ? "#FFFFFF"  : "#71717a",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mdsb-search-wrap">
        <svg className="mdsb-search-icon" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd"/>
        </svg>
        <input
          className="mdsb-search"
          placeholder={searchPlaceholder}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        {searchTerm && (
          <button className="mdsb-search-clear" onClick={() => setSearchTerm("")}>✕</button>
        )}
      </div>

      {!isSearching && !loading && total > 0 && (
        <div className="mdsb-hint">
          {(page - 1) * 20 + 1}–{Math.min(page * 20, total)} of {total}
          {totalPages > 1 && <span style={{ opacity: 0.55 }}> · pg {page}/{totalPages}</span>}
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
              {isSearching ? "Searching…" : `Loading ${emptyLabel}…`}
            </span>
          </div>
        )}

        {!loading && error && (
          <div className="mdsb-state mdsb-error">{error}</div>
        )}

        {!loading && !error && displayDevices.length === 0 && (
          <div className="mdsb-state">
            {isSearching ? `No ${emptyLabel} match your search` : `No ${emptyLabel} found`}
          </div>
        )}

        {!loading && !error && showRecentSection && (
          <>
            <div className="mdsb-section-label">Recent</div>
            {recentOnly.map(renderDevice)}
            <div className="mdsb-section-label">Devices</div>
          </>
        )}

        {!loading && !error && listDevices.map(renderDevice)}
      </div>

      {/* Pagination — only when not searching and there is more than one page */}
      {!isSearching && total > 0 && (
        <div className="mdsb-pagination">
          <button
            className={`mdsb-page-btn${hasPreviousPage ? "" : " disabled"}`}
            disabled={!hasPreviousPage || loading}
            onClick={() => goToPage(page - 1)}
          >
            ← Prev
          </button>

          <span className="mdsb-page-info">
            {page} / {totalPages}
          </span>

          <button
            className={`mdsb-page-btn${hasNextPage ? "" : " disabled"}`}
            disabled={!hasNextPage || loading}
            onClick={() => goToPage(page + 1)}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
