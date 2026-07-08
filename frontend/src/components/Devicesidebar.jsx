import React from "react";
import tplLogo from "../assets/tpl.png";
import { useSidebarDevices } from "../hooks/useSidebarDevices.js";
import "./DeviceSidebar.css";

/* ── Detect device type the same way as Locators/Stickers pages ─────────── */
const isSticker = (sn) => /^\d+$/.test(String(sn ?? ""));

/* ── Locator icon (radio/signal) ─────────────────────────────────────────── */
function LocatorIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
    </svg>
  );
}

/* ── Sticker icon (tag/label) ────────────────────────────────────────────── */
function StickerIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58s1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41s-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z"/>
    </svg>
  );
}

function formatDateTime(value) {
  if (!value) return null;
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleString(undefined, {
      month: "short", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    });
  } catch { return null; }
}

function DeviceRow({ device, selectedSn, onSelect }) {
  const sn           = device.sn ?? "unknown";
  const status       = device.status ?? "offline";
  const client       = device.client ?? null;
  const assignedUser = device.assigned_user_name ?? device.assignedUser ?? null;
  const battery      = device.batteryLevel ?? device.battery ?? null;
  const bindTime     = formatDateTime(device.bindTime);
  const isBound      = !!assignedUser;
  const isSelected   = sn === selectedSn;
  const sticker      = isSticker(sn);

  return (
    <button
      key={sn}
      className={`dsb-item ${isSelected ? "selected" : ""}`}
      onClick={() => onSelect(device)}
    >
      <div className={`dsb-icon ${status === "online" ? "icon-online" : "icon-offline"}`}>
        {sticker ? <StickerIcon /> : <LocatorIcon />}
      </div>

      <div className="dsb-info">
        <div className="dsb-sn">{assignedUser || sn}</div>
        {assignedUser && (
          <div className="dsb-client" style={{ fontFamily: "monospace", fontSize: '0.625em', opacity: 0.6 }}>
            {sn}
          </div>
        )}
        {client && <div className="dsb-client">{client}</div>}
        {!isBound && (
          <div style={{ fontSize: '0.5625em', color: "#52525b", marginTop: '0.125em', fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Unbound
          </div>
        )}
        {isBound && bindTime && (
          <div style={{ fontSize: '0.5625em', color: "#52525b", marginTop: '0.1875em', display: "flex", alignItems: "center", gap: '0.1875em' }}>
            <svg viewBox="0 0 20 20" fill="currentColor" width={8} height={8}>
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd"/>
            </svg>
            Bound {bindTime}
          </div>
        )}
      </div>

      <div className="dsb-right">
        <span className={`dsb-dot ${status === "online" ? "dot-online" : "dot-offline"}`} />
        {battery != null && <span className="dsb-battery">{battery}</span>}
      </div>
    </button>
  );
}

/* ── Type filter tabs ─────────────────────────────────────────────────────── */
const TYPE_TABS = [
  { key: null,       label: "All"      },
  { key: "locator",  label: "Locators" },
  { key: "sticker",  label: "Stickers" },
];

export default function DeviceSidebar({ selectedSn, onSelect, scope = "trajectory" }) {
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
    deviceTypeFilter,
    setDeviceTypeFilter,
  } = useSidebarDevices(scope);

  const handleSelect = (device) => {
    recordRecent(device);
    onSelect(device);
  };

  const defaultSnSet    = new Set(defaultDevices.map((d) => d.sn));
  const recentOnly      = recentDevices.filter((d) => !defaultSnSet.has(d.sn));
  const showRecentSection = !isSearching && recentOnly.length > 0;

  /* Labels — title is always "Devices"; search/empty hints adapt to the active filter */
  const searchPlaceholder = deviceTypeFilter === "sticker" ? "Search stickers…" : deviceTypeFilter === "locator" ? "Search locators…" : "Search all devices…";
  const emptyLabel        = deviceTypeFilter === "sticker" ? "stickers" : deviceTypeFilter === "locator" ? "locators" : "devices";

  return (
    <div className="dsb-sidebar">

      <div className="dsb-header">
        {/* Row 1: title + refresh button */}
        <div className="dsb-header-row">
          <div className="dsb-title">
            Devices
            <span className="dsb-count" title={`Total ${emptyLabel} in your account`}>
              {isSearching ? displayDevices.length : total}
            </span>
          </div>
          <button
            className="dsb-refresh-btn"
            onClick={refresh}
            disabled={loading}
            title={`Refresh ${emptyLabel}`}
            onMouseEnter={(e) => { if (!loading) e.currentTarget.style.color = "#fca5a5"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = loading ? "#3f3f46" : "#71717a"; }}
          >
            <svg
              viewBox="0 0 20 20" fill="currentColor" width={14} height={14}
              style={{ animation: loading ? "dsb-spin 0.8s linear infinite" : "none" }}
            >
              <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd"/>
            </svg>
          </button>
        </div>
        {/* Row 2: online / offline stats */}
        <div className="dsb-stats">
          <span className="dsb-stat online">● {online} online</span>
          <span className="dsb-stat offline">● {offline} offline</span>
        </div>
      </div>

      {/* ── Device type filter ───────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: '0.1875em', padding: "0.375em 0.5em", borderBottom: "1px solid #1f1f22" }}>
        {TYPE_TABS.map(({ key, label }) => (
          <button
            key={String(key)}
            onClick={() => setDeviceTypeFilter(key)}
            style={{
              flex: 1, padding: "0.25em 0", borderRadius: '0.375em', border: "none",
              fontSize: '0.625em', fontWeight: 700, cursor: "pointer", transition: "all 0.15s",
              background: deviceTypeFilter === key ? "#A72C32" : "rgba(255,255,255,0.05)",
              color:      deviceTypeFilter === key ? "#FFFFFF"  : "#71717a",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="dsb-search-wrap">
        <svg className="dsb-search-icon" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd"/>
        </svg>
        <input
          className="dsb-search"
          placeholder={searchPlaceholder}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        {searchTerm && <button className="dsb-search-clear" onClick={() => setSearchTerm("")}>✕</button>}
      </div>

      {!isSearching && !loading && (
        <div className="dsb-hint">
          Showing {defaultDevices.length} of {total} · search for more
        </div>
      )}

      <div className="dsb-list">

        {loading && (
          <div className="dsb-state" style={{ flexDirection: "column", gap: '0.625em' }}>
            <style>{`
              @keyframes tpl-pulse {
                0%   { opacity: 0.15; transform: scale(0.95); }
                50%  { opacity: 0.7;  transform: scale(1.02); }
                100% { opacity: 0.15; transform: scale(0.95); }
              }
            `}</style>
            <img
              src={tplLogo}
              alt="Loading"
              style={{
                width: '3em',
                height: "auto",
                filter: "brightness(0) invert(1)",
                animation: "tpl-pulse 1.6s ease-in-out infinite",
              }}
            />
            <span style={{ fontSize: '0.625em', color: "#52525b", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              {isSearching ? "Searching…" : `Loading ${emptyLabel}…`}
            </span>
          </div>
        )}

        {!loading && error && (
          <div className="dsb-state dsb-error">{error}</div>
        )}

        {!loading && !error && displayDevices.length === 0 && (
          <div className="dsb-state">
            {isSearching ? `No ${emptyLabel} match your search` : `No ${emptyLabel} found`}
          </div>
        )}

        {!loading && !error && showRecentSection && (
          <>
            <div className="dsb-section-label">Recent</div>
            {recentOnly.map((d) => (
              <DeviceRow key={`recent-${d.sn}`} device={d} selectedSn={selectedSn} onSelect={handleSelect} />
            ))}
            <div className="dsb-section-label">Devices</div>
          </>
        )}

        {!loading && !error && (isSearching
          ? displayDevices
          : defaultDevices
        ).map((d) => (
          <DeviceRow key={d.sn} device={d} selectedSn={selectedSn} onSelect={handleSelect} />
        ))}
      </div>

    </div>
  );
}
