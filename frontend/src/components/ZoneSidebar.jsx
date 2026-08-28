// src/components/ZoneSidebar.jsx
import React from 'react';
import tplLogo from '../assets/tpl.png';

export default function ZoneSidebar({
  zones           = [],
  selectedZoneId,
  onSelect,
  zoneStatuses    = {},
  statusLoading   = false,
  assignments     = {},
  onOpenAssign,
  assigningZoneId = null,
  deviceTracks    = [],
  tracksLoading   = false,
  zonesLoading    = false,
  onCreateZone    = null,
  onEditZone      = null,
  onDeleteZone    = null,
  onUploadKML     = null,
  isUploadingKML  = false,
  isAdmin         = false,
  currentUserId   = '',
}) {
  const totalAssigned = Object.values(zoneStatuses).reduce((s, arr) => s + arr.length, 0);
  const initialLoading = zonesLoading && zones.length === 0;

  return (
    <aside className="fp-sidebar" style={{ position: 'relative' }}>

      {/* ── Initial loading overlay only when no zones exist yet ── */}
      {initialLoading && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 50,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(3px)',
          WebkitBackdropFilter: 'blur(3px)',
          pointerEvents: 'none',
          gap: 10,
        }}>
          <style>{`@keyframes zs-tpl-pulse{0%,100%{opacity:.15;transform:scale(.95)}50%{opacity:.70;transform:scale(1.02)}}`}</style>
          <img
            src={tplLogo} alt="Loading"
            style={{ width: 90, height: 'auto', filter: 'brightness(0) invert(1)', animation: 'zs-tpl-pulse 1.6s ease-in-out infinite' }}
          />
          <span style={{ fontSize: 11, color: '#9ca3af', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>
            Loading zones…
          </span>
        </div>
      )}

      {/* ── Header ── */}
      <div className="fp-sidebar-header">
        <div className="fp-sidebar-title">
          <svg width="14" height="14" viewBox="0 0 24 24"
               fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/>
            <circle cx="12" cy="10" r="1" fill="currentColor"/>
          </svg>
          Zones
          <span className="fp-sidebar-count">{zones.length}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {onUploadKML && (
            <button
              onClick={onUploadKML}
              disabled={isUploadingKML}
              title="Upload KML file to map zones"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                padding: '4px 7px', borderRadius: 6, cursor: isUploadingKML ? 'wait' : 'pointer',
                fontSize: 11, fontWeight: 700, letterSpacing: '0.02em',
                background: 'rgba(37,99,235,0.12)', border: '1px solid rgba(37,99,235,0.35)',
                color: '#93c5fd', transition: 'all 0.15s', flexShrink: 0,
                opacity: isUploadingKML ? 0.6 : 1,
              }}
              onMouseEnter={e => { if (!isUploadingKML) { e.currentTarget.style.background = 'rgba(37,99,235,0.22)'; e.currentTarget.style.color = '#fff'; } }}
              onMouseLeave={e => { if (!isUploadingKML) { e.currentTarget.style.background = 'rgba(37,99,235,0.12)'; e.currentTarget.style.color = '#93c5fd'; } }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              {isUploadingKML ? 'Importing…' : 'Upload KML'}
            </button>
          )}
          {onCreateZone && (
            <button
              onClick={onCreateZone}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                padding: '4px 8px', borderRadius: 6, cursor: 'pointer',
                fontSize: 11, fontWeight: 700, letterSpacing: '0.02em',
                background: 'rgba(193,18,31,0.12)', border: '1px solid rgba(193,18,31,0.35)',
                color: '#ef9fa2', transition: 'all 0.15s', flexShrink: 0,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(193,18,31,0.22)'; e.currentTarget.style.color = '#fff'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(193,18,31,0.12)'; e.currentTarget.style.color = '#ef9fa2'; }}
            >
              + New Zone
            </button>
          )}
        </div>
      </div>

      {/* ── Zone list ── */}
      <div className="fp-area-list">
        {zones.length === 0 ? (
          <div className="fp-no-areas fp-zone-empty">
            <svg width="36" height="36" viewBox="0 0 24 24"
                 fill="none" stroke="currentColor" strokeWidth={1.2}
                 style={{ opacity: 0.2 }}>
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/>
              <circle cx="12" cy="10" r="1" fill="currentColor"/>
            </svg>
            <p>No zones found</p>
          </div>
        ) : (
          zones.map((zone) => {
            const isActive      = zone.zone_id === selectedZoneId;
            const zoneDevices   = zoneStatuses[zone.zone_id] || [];
            const assignedCount = zoneDevices.length;
            const isAssigning   = assigningZoneId === zone.zone_id;

            return (
              <div
                key={zone.zone_id}
                className={`fp-area-item${isActive ? ' active' : ''}`}
              >
                {/* ── Zone header row ── */}
                <div
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => onSelect(zone.zone_id)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <span style={{
                        width: 7, height: 7, borderRadius: '50%',
                        background: zone.color || '#C1121F',
                        flexShrink: 0,
                        boxShadow: `0 0 5px ${zone.color || '#C1121F'}80`,
                      }} />
                      <div className="fp-area-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{zone.name}</div>
                    </div>

                    {isAssigning ? (
                      <span style={{
                        fontSize: 10, fontWeight: 600,
                        color: '#60a5fa', flexShrink: 0, marginLeft: 6,
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                      }}>
                        <span style={{
                          width: 6, height: 6, borderRadius: '50%',
                          border: '1.5px solid #60a5fa', borderTopColor: 'transparent',
                          display: 'inline-block',
                          animation: 'zs-spin 0.7s linear infinite',
                        }} />
                        Assigning…
                      </span>
                    ) : assignedCount > 0 ? (
                      <span style={{
                        fontSize: 10, fontWeight: 600,
                        color: isActive ? '#c1121f' : '#6b7280',
                        flexShrink: 0, marginLeft: 6,
                      }}>
                        {assignedCount} device{assignedCount !== 1 ? 's' : ''}
                      </span>
                    ) : null}
                  </div>
                  <div className="fp-area-meta">
                  </div>
                </div>

                {/* ── Action buttons for active zone ── */}
                {isActive && (
                  <div style={{ marginTop: 8 }}>
                    {/* Assign Device button — hidden while assigning */}
                    {onOpenAssign && !isAssigning && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onOpenAssign(zone); }}
                        style={{
                          width: '100%', padding: '6px 0',
                          background: 'transparent',
                          border: '1px dashed rgba(255,255,255,0.15)',
                          borderRadius: 6, color: '#9ca3af',
                          fontSize: 11, fontWeight: 600,
                          letterSpacing: '0.04em', cursor: 'pointer',
                          textTransform: 'uppercase',
                          transition: 'border-color 0.15s, color 0.15s',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'; e.currentTarget.style.color = '#e2e8f0'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; e.currentTarget.style.color = '#9ca3af'; }}
                      >
                        + Assign Device
                      </button>
                    )}

                    {/* Edit / Delete — allowed for Admin or zone creator */}
                    {(onEditZone || onDeleteZone) && (isAdmin || (Boolean(zone.user_id) && String(zone.user_id) === String(currentUserId))) && !isAssigning && (
                      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                        {onEditZone && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onEditZone(zone); }}
                            style={{
                              flex: 1, padding: '5px 0', borderRadius: 6, cursor: 'pointer',
                              background: 'transparent', border: '1px solid rgba(255,255,255,0.10)',
                              color: '#9ca3af', fontSize: 11, fontWeight: 600,
                              transition: 'all 0.15s',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.28)'; e.currentTarget.style.color = '#e2e8f0'; }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)'; e.currentTarget.style.color = '#9ca3af'; }}
                          >
                            ✎ Edit
                          </button>
                        )}
                        {onDeleteZone && (
                          <button
                            onClick={(e) => { e.stopPropagation(); if (window.confirm(`Delete zone "${zone.name}"?`)) onDeleteZone(zone.zone_id); }}
                            style={{
                              flex: 1, padding: '5px 0', borderRadius: 6, cursor: 'pointer',
                              background: 'transparent', border: '1px solid rgba(220,38,38,0.20)',
                              color: '#f87171', fontSize: 11, fontWeight: 600,
                              transition: 'all 0.15s',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(220,38,38,0.10)'; e.currentTarget.style.borderColor = 'rgba(220,38,38,0.45)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(220,38,38,0.20)'; }}
                          >
                            ✕ Delete
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ── Footer ── */}
      {zones.length > 0 && (
        <div className="fp-sidebar-footer">
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            {totalAssigned} of {zones.length} zones have devices
          </span>
        </div>
      )}
    </aside>
  );
}