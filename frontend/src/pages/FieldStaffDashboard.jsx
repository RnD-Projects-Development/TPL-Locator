import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useKmlAreas } from '../hooks/useKmlAreas.js';
import { RefreshCw } from 'lucide-react';
import FieldStaffPill from '../components/FieldStaffPill.jsx';
import { useFieldStaffCache } from '../context/FieldStaffCacheContext.jsx';
import AreaSelector from '../components/AreaSelector.jsx';
import TPLLoader from '../components/TPLLoader.jsx';
import loadTPLMaps from '../components/loadTPLMaps.js';
import { tplGeocode } from '../utils/tplGeocode.js';
import './FieldStaffDashboard.css';

// ─── SVG Rank Badge ───────────────────────────────────────────────────────────
const RANK_COLORS = ['#f59e0b', '#94a3b8', '#cd7c4a', '#9ca3af', '#9ca3af'];

function RankBadge({ rank }) {
  const color = RANK_COLORS[rank - 1] ?? '#9ca3af';
  return (
    <svg width={26} height={26} viewBox="0 0 26 26" style={{ flexShrink: 0 }}>
      <circle
        cx={13} cy={13} r={11.5}
        fill={`${color}18`}
        stroke={color}
        strokeWidth={1.5}
        strokeOpacity={0.5}
      />
      {rank === 1 && (
        <path d="M8 17 L8 12 L10.5 14.5 L13 10 L15.5 14.5 L18 12 L18 17 Z"
          fill={color} opacity={0.9} />
      )}
      {rank === 2 && (
        <polygon
          points="13,8 14.2,11.5 18,11.5 15,13.7 16.2,17.2 13,15 9.8,17.2 11,13.7 8,11.5 11.8,11.5"
          fill={color} opacity={0.85} />
      )}
      {rank === 3 && (
        <polygon
          points="13,9 13.9,11.7 16.8,11.7 14.5,13.3 15.4,16 13,14.4 10.6,16 11.5,13.3 9.2,11.7 12.1,11.7"
          fill={color} opacity={0.8} />
      )}
      {rank > 3 && (
        <text x={13} y={17.5} textAnchor="middle" fontSize={11} fontWeight="800"
          fill={color} fontFamily="'JetBrains Mono',monospace">
          {rank}
        </text>
      )}
    </svg>
  );
}

// ─── Map Section ──────────────────────────────────────────────────────────────
function MapSection({ filteredDevices, mapContainerRef }) {
  const mapRef     = useRef(null);
  const markersRef = useRef([]);
  const mapReadyRef = useRef(false);

  // Initialise TPLMaps once on mount
  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Capture the container ID now — mapContainerRef.current may be null when callback fires
    const containerId = mapContainerRef.current.id;

    const cancelLoad = loadTPLMaps(() => {
      if (mapRef.current) return; // already init

      // Guard: element may have been removed from DOM if component unmounted
      const container = document.getElementById(containerId);
      if (!container) return;

      const map = window.TPLMaps.map.initMap({
        divID:           containerId,
        lat:             31.5204,
        lng:             74.3587,
        zoom:            10,
        showZoomControl: true,
      });

      map.scrollWheelZoom?.enable();
      mapRef.current   = map;
      mapReadyRef.current = true;

      requestAnimationFrame(() => map.invalidateSize?.());
    });

    return () => {
      cancelLoad();
      markersRef.current.forEach(m => { try { mapRef.current?.removeLayer(m); } catch {} });
      markersRef.current = [];
      mapRef.current?.remove?.();
      mapRef.current    = null;
      mapReadyRef.current = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-render markers whenever filteredDevices changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;

    // Clear previous markers
    markersRef.current.forEach(m => { try { map.removeLayer(m); } catch {} });
    markersRef.current = [];

    const withCoords = filteredDevices.filter(
      d => d.latitude != null && d.longitude != null
    );
    if (!withCoords.length) return;

    withCoords.forEach(device => {
      const isOnline  = device.isOnline;
      const pinColor  = isOnline ? '#22c55e' : '#ef4444';
      const iconHtml  = `<div style="width:32px;height:32px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));"><svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="${pinColor}" width="32" height="32"><path d="M14,10a2,2,0,1,1-2-2A2.006,2.006,0,0,1,14,10Zm5.5,0c0,6.08-4.67,9.89-6.67,11.24a1.407,1.407,0,0,1-.83.26,1.459,1.459,0,0,1-.84-.26C9.16,19.89,4.5,16.09,4.5,10A7.33,7.33,0,0,1,12,2.5,7.336,7.336,0,0,1,19.5,10ZM16,10a4,4,0,1,0-4,4A4,4,0,0,0,16,10Z"/></svg></div>`;
      const icon      = window.L.divIcon({
        html:       iconHtml,
        className:  '',
        iconSize:   [32, 32],
        iconAnchor: [16, 29],
        popupAnchor:[0, -28],
      });
      const marker = window.L.marker(
        [device.latitude, device.longitude],
        { icon }
      ).addTo(map);

      marker.bindPopup(`
        <div style="font-family:'Nunito',sans-serif;padding:4px 2px;min-width:160px;">
          <div style="font-weight:700;font-size:13px;color:#f9fafb;margin-bottom:4px;">
            ${device.name || device.sn}
          </div>
          <div style="font-size:12px;color:#d1d5db;margin-bottom:2px;">
            ${device.assignedUser || 'Unassigned'}
          </div>
          <div style="font-size:11px;color:#9ca3af;">
            ${device.region || 'No region'}
            ${device.location ? ' › ' + device.location : ''}
            ${device.zone    ? ' › ' + device.zone    : ''}
          </div>
        </div>
      `);

      markersRef.current.push(marker);
    });

    // Fit map to all visible markers
    try {
      const latlngs = withCoords.map(d => [d.latitude, d.longitude]);
      const bounds  = window.L.latLngBounds(latlngs);
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 });
      }
    } catch {}
  }, [filteredDevices]);

  return (
    <div style={{ flex: '1 1 0', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {/* id required for TPLMaps initMap({ divID }) */}
      <div ref={mapContainerRef} id="fsd-map" className="fsd-map-container" />
    </div>
  );
}

// ─── Top 5 Active Staff ───────────────────────────────────────────────────────
function TopStaffPanel({ devices }) {
  const topStaff = useMemo(() => {
    const userMap = new Map();
    devices.forEach(d => {
      if (!d.assignedUser) return;
      if (!userMap.has(d.assignedUser)) {
        userMap.set(d.assignedUser, { name: d.assignedUser, onlineCount: 0, totalCount: 0 });
      }
      const entry = userMap.get(d.assignedUser);
      entry.totalCount++;
      if (d.isOnline) entry.onlineCount++;
    });
    return [...userMap.values()]
      .sort((a, b) =>
        b.onlineCount !== a.onlineCount
          ? b.onlineCount - a.onlineCount
          : b.totalCount - a.totalCount
      )
      .slice(0, 5);
  }, [devices]);

  return (
    <div className="fsd-top-staff">
      <div className="fsd-card-header">
        <span className="fsd-card-title">Top 5 Active Staff</span>
        <span className="fsd-record-count">{topStaff.length} staff</span>
      </div>
      <div className="fsd-staff-list">
        {topStaff.length === 0 ? (
          <p className="fsd-empty-msg">No staff data available</p>
        ) : (
          topStaff.map((staff, index) => (
            <div key={staff.name} className="fsd-staff-item">
              <RankBadge rank={index + 1} />
              <div className="fsd-staff-info">
                <div className="fsd-staff-name">{staff.name}</div>
                <div className="fsd-staff-time">
                  {staff.onlineCount > 0
                    ? <span style={{ color: '#4ade80', fontWeight: 600 }}>● {staff.onlineCount} online</span>
                    : <span style={{ color: '#6b7280' }}>Offline</span>
                  }
                </div>
              </div>
              <div className="fsd-staff-total">
                {staff.totalCount} device{staff.totalCount !== 1 ? 's' : ''}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Zone Table ───────────────────────────────────────────────────────────────
function ZoneTable({ devices, locationCache, rowOffset = 0 }) {
  return (
    <div className="fsd-zone-table-container">
      <div className="fsd-card-header">
        <span className="fsd-card-title">Staff Zone Activity</span>
        <span className="fsd-record-count">{devices.length} on this page</span>
      </div>
      <div className="fsd-table-wrapper">
        <table className="fsd-zone-table">
          <thead>
            <tr>
              <th style={{ width: 36 }}>#</th>
              <th>User Name</th>
              <th>Locator</th>
              <th>Area / Location</th>
              <th>Status</th>
              <th>Last Seen</th>
            </tr>
          </thead>
          <tbody>
            {devices.length === 0 ? (
              <tr>
                <td colSpan="6" className="fsd-empty-row">No data available</td>
              </tr>
            ) : (
              devices.map((device, index) => {
                const geocoded  = locationCache[device.sn];
                const fallback  =
                  device.location ||
                  [device.region, device.zone].filter(Boolean).join(' › ') ||
                  null;
                const hasCoords = device.latitude != null && device.longitude != null;

                let locationCell;
                if (geocoded) {
                  locationCell = geocoded;
                } else if (hasCoords) {
                  locationCell = (
                    <span style={{ color: '#6b7280', fontStyle: 'italic', fontSize: 11 }}>
                      Locating…
                    </span>
                  );
                } else {
                  locationCell = fallback || '—';
                }

                return (
                  <tr key={`${device.sn}-${index}`}>
                    <td className="fsd-col-index">{rowOffset + index + 1}.</td>
                    <td style={{ fontWeight: 700, color: '#f9fafb' }}>
                      {device.assignedUser || 'Unassigned'}
                    </td>
                    <td>{device.name || device.sn}</td>
                    <td>{locationCell}</td>
                    <td>
                      <span className={device.isOnline ? 'fsd-badge-online' : 'fsd-badge-offline'}>
                        {device.isOnline ? 'Online' : 'Offline'}
                      </span>
                    </td>
                    <td className="fsd-col-lastseen">
                      {device.lastSeen ? new Date(device.lastSeen).toLocaleString() : '—'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function FieldStaffDashboard() {
  const mapContainerRef = useRef(null);
  const navigate        = useNavigate();
  const { areas, kmlLoading } = useKmlAreas();
  const {
    devices,
    loading,
    error,
    locationCache,
    refresh,
    updateLocationCache,
    page,
    limit,
    total,
    totalPages,
    onlineCount,
    hasNextPage,
    hasPreviousPage,
    search,
    setSearch,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    zoneId,
    setZoneId,
    goToPage,
  } = useFieldStaffCache();

  const geocodingInFlight = useRef(new Set());

  const handleAreaChange = (areaId) => {
    setZoneId(areaId || null);
  };

  const displayDevices = devices;

  // ── Reverse-geocode visible devices using TPLMaps (shared cache) ──────────
  const _runGeocode = useRef(null);
  useEffect(() => {
    let cancelled = false;

    function runBatch() {
      if (cancelled) return;
      const pending = displayDevices.filter(
        d =>
          d.latitude  != null &&
          d.longitude != null &&
          !locationCache[d.sn] &&
          !geocodingInFlight.current.has(d.sn)
      );
      if (!pending.length) return;

      // If SDK not ready yet, retry after 1 s
      if (!window.TPLMaps?.api?.reverseGeoCode) {
        _runGeocode.current = setTimeout(runBatch, 1000);
        return;
      }

      pending.forEach(device => {
        geocodingInFlight.current.add(device.sn);
        tplGeocode(device.latitude, device.longitude)
          .then(result => {
            if (cancelled || !result) return;
            // tplGeocode returns { primary, secondary, isSpecific }
            const label = result.primary || result.secondary || '';
            if (label) updateLocationCache(device.sn, label);
          })
          .catch(() => {})
          .finally(() => { geocodingInFlight.current.delete(device.sn); });
      });
    }

    runBatch();
    return () => {
      cancelled = true;
      clearTimeout(_runGeocode.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayDevices]);

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="fsd-loading">
        <TPLLoader label="Loading Field Staff Dashboard…" />
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="fsd-loading">
        <p style={{ color: '#f87171', fontSize: 14 }}>{error}</p>
        <button className="fsd-refresh-btn" onClick={refresh} style={{ marginTop: 12 }}>
          Retry
        </button>
      </div>
    );
  }

  const rowOffset = (page - 1) * limit;

  return (
    <div className="fsd-dashboard">

      {/* ── Header ── */}
      <div className="fsd-header">
        <div className="fsd-header-left">
          {/* Back button styled like header pill */}
          <div style={{ marginRight: 8 }}>
            <FieldStaffPill onClick={() => navigate('/dashboard')} children={'Back'} arrowDirection="left" />
          </div>
          {/* Low-key refresh: small icon-only button */}
          <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
          <button
            onClick={refresh}
            disabled={loading}
            title="Refresh"
            aria-label="Refresh Field Staff"
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 36, height: 36, padding: 6, borderRadius: 8,
              background: 'transparent', border: 'none', color: '#FFFFFF',
              cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 0.85, transition: 'all 0.12s',
              marginRight: 6,
            }}
          >
            <RefreshCw style={{ width: 14, height: 14, animation: loading ? 'spin 1s linear infinite' : 'none', color: '#FFFFFF' }} />
          </button>
          <div className="fsd-header-text">
            <h1 className="fsd-title">Field Staff Dashboard</h1>
            <p className="fsd-subtitle">
              <span className="fsd-online-dot" />
              {onlineCount} of {devices.length} locators online
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="fsd-filters-bar">
          <div className="fsd-search-wrap">
            <svg className="fsd-search-icon" viewBox="0 0 20 20" fill="currentColor" width={14} height={14}>
              <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd"/>
            </svg>
            <input
              type="text"
              className="fsd-search-input"
              placeholder="Search SN, user, region…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button type="button" className="fsd-search-clear" onClick={() => setSearch('')}>✕</button>
            )}
          </div>

          <div className="fsd-area-selector-wrapper">
            <AreaSelector
              value={zoneId}
              onChange={handleAreaChange}
              areas={areas}
              loading={kmlLoading}
            />
          </div>

          <div className="fsd-filter-group">
            <label className="fsd-filter-label">
              Date From {dateFrom && <span className="fsd-filter-hist-badge">Historical</span>}
            </label>
            <input
              type="date"
              className="fsd-filter-select fsd-filter-date"
              value={dateFrom}
              max={dateTo || undefined}
              onClick={e => { try { e.target.showPicker(); } catch {} }}
              onChange={e => setDateFrom(e.target.value)}
            />
          </div>

          <div className="fsd-filter-group">
            <label className="fsd-filter-label">
              Date To {dateTo && <span className="fsd-filter-hist-badge">Historical</span>}
            </label>
            <input
              type="date"
              className="fsd-filter-select fsd-filter-date"
              value={dateTo}
              min={dateFrom || undefined}
              onClick={e => { try { e.target.showPicker(); } catch {} }}
              onChange={e => setDateTo(e.target.value)}
            />
          </div>

          {(dateFrom || dateTo) && (
            <button
              className="fsd-filter-live-btn"
              onClick={() => { setDateFrom(''); setDateTo(''); }}
            >
              ✕ Clear Dates
            </button>
          )}
        </div>
      </div>

      {/* ── Top Layout: Map (55%) | Side Column (45%) ── */}
      <div className="fsd-top-layout">

        {/* Left — Map */}
        <div className="fsd-map-card">
          <MapSection
            filteredDevices={displayDevices}
            mapContainerRef={mapContainerRef}
          />
        </div>

        {/* Right — Top Staff + Zone Table stacked at equal height */}
        <div className="fsd-side-cards">
          <div className="fsd-side-card">
            <TopStaffPanel devices={displayDevices} />
          </div>
          <div className="fsd-table-card">
            <ZoneTable
              devices={displayDevices}
              locationCache={locationCache}
              rowOffset={rowOffset}
            />
            <div className="fsd-pagination">
              <button
                type="button"
                className="fsd-page-btn"
                disabled={!hasPreviousPage || loading}
                onClick={() => goToPage(page - 1)}
              >
                Previous
              </button>
              <span className="fsd-page-info">
                Page {page} of {totalPages} · {total} locator{total === 1 ? '' : 's'}
                {(search || dateFrom || dateTo || zoneId) ? ' matching filters' : ' total'}
              </span>
              <button
                type="button"
                className="fsd-page-btn"
                disabled={!hasNextPage || loading}
                onClick={() => goToPage(page + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}