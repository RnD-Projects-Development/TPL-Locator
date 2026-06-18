// src/components/ZoneSidebar.jsx
import React from 'react';
import { deviceColor } from '../utils/zonePolygonManager.js';
import tplLogo from '../assets/tpl.png';

// ── Status badge ──────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  INSIDE:  { color: '#4ade80', dot: '#22c55e', label: 'Inside'  },
  OUTSIDE: { color: '#f87171', dot: '#ef4444', label: 'Outside' },
  OFFLINE: { color: '#6b7280', dot: '#4b5563', label: 'Offline' },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.OFFLINE;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 7px', borderRadius: 999, fontSize: 10, fontWeight: 600,
      letterSpacing: '0.05em', textTransform: 'uppercase',
      background: `${cfg.color}18`, color: cfg.color,
      border: `1px solid ${cfg.color}30`,
    }}>
      <span style={{
        width: 5, height: 5, borderRadius: '50%',
        background: cfg.dot,
        boxShadow: status === 'INSIDE' ? `0 0 4px ${cfg.dot}` : 'none',
      }} />
      {cfg.label}
    </span>
  );
}

// ── Skeleton loader shown while an assign is in-flight ───────────────────────
function AssigningSkeleton() {
  return (
    <div style={{ marginBottom: 8 }}>
      <style>{`
        @keyframes zs-pulse {
          0%, 100% { opacity: 0.4; }
          50%       { opacity: 0.9; }
        }
        @keyframes zs-spin { to { transform: rotate(360deg); } }
        .zs-skel {
          background: rgba(255,255,255,0.07);
          border-radius: 4px;
          animation: zs-pulse 1.4s ease-in-out infinite;
        }
      `}</style>
      <div style={{
        padding: '8px 10px',
        background: 'rgba(255,255,255,0.03)',
        borderRadius: 6,
        border: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
          <div className="zs-skel" style={{ height: 10, width: '55%' }} />
          <div className="zs-skel" style={{ height: 16, width: 52, borderRadius: 999 }} />
        </div>
        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div className="zs-skel" style={{ height: 8, width: '70%' }} />
          <div className="zs-skel" style={{ height: 8, width: '45%' }} />
        </div>
      </div>
      <p style={{
        fontSize: 10, color: '#6b7280', margin: '6px 0 0',
        fontStyle: 'italic', textAlign: 'center',
        animation: 'zs-pulse 1.4s ease-in-out infinite',
      }}>
        Fetching device info…
      </p>
    </div>
  );
}

// ── Formatters ────────────────────────────────────────────────────────────────
function fmtDuration(first, last) {
  if (!first || !last) return null;
  try {
    const ms = new Date(last) - new Date(first);
    if (ms <= 0) return null;
    const totalMins = Math.floor(ms / 60000);
    const days  = Math.floor(totalMins / 1440);
    const hours = Math.floor((totalMins % 1440) / 60);
    const mins  = totalMins % 60;
    if (days > 0)  return `${days}d ${hours}h ${mins}m`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  } catch { return null; }
}

function fmtTs(ts) {
  if (!ts) return null;
  try {
    const d = new Date(ts);
    if (isNaN(d)) return null;
    return d.toLocaleString(undefined, {
      month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
  } catch { return null; }
}

// ── Device row inside an expanded zone ───────────────────────────────────────
function DeviceRow({ entry, onUnassign, statusLoading, trackInfo }) {
  // Prefer track-derived timestamps (always present for MongoDB zones);
  // fall back to status-endpoint data (only present for KML zones).
  const firstSeenRaw  = entry.first_seen  || trackInfo?.firstSeen  || null;
  const lastSeenRaw   = entry.last_seen   || trackInfo?.lastSeen   || null;
  const firstSeen     = fmtTs(firstSeenRaw);
  const lastSeen      = fmtTs(lastSeenRaw);
  const duration      = fmtDuration(firstSeenRaw, lastSeenRaw);
  const color         = deviceColor(entry.sn);
  const insideCount   = trackInfo?.insidePoints?.length  ?? null;
  const outsideCount  = trackInfo?.outsidePoints?.length ?? null;
  const events        = trackInfo?.events ?? [];
  const neverEntered  = entry.status === 'OFFLINE' && !firstSeenRaw && (insideCount === null || insideCount === 0);

  return (
    <div style={{
      padding: '8px 10px',
      background: 'rgba(255,255,255,0.03)',
      borderRadius: 6,
      marginBottom: 4,
      border: `1px solid rgba(255,255,255,0.06)`,
      borderLeft: `3px solid ${color}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        {/* Color swatch + name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1, overflow: 'hidden' }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: color, flexShrink: 0,
            boxShadow: `0 0 5px ${color}88`,
          }} />
          <span style={{
            fontSize: 12, fontWeight: 600, color: '#f1f5f9',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {entry.user_name}
          </span>
        </div>

        {statusLoading
          ? <span style={{ fontSize: 10, color: '#6b7280' }}>…</span>
          : <StatusBadge status={entry.status || 'OFFLINE'} />
        }

        {onUnassign && (
          <button
            title="Unassign"
            onClick={(e) => { e.stopPropagation(); onUnassign(entry.sn); }}
            style={{
              padding: '2px 6px', fontSize: 11, lineHeight: 1,
              background: 'transparent', border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 3, color: '#f87171', cursor: 'pointer',
              flexShrink: 0,
            }}
          >×</button>
        )}
      </div>

      {/* Inside/Outside point counts */}
      {(insideCount !== null || outsideCount !== null) && (
        <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
          {insideCount !== null && (
            <span style={{ fontSize: 10, color: color, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <svg width="8" height="8" viewBox="0 0 8 8" fill={color}><circle cx="4" cy="4" r="3.5"/></svg>
              {insideCount} inside
            </span>
          )}
          {outsideCount !== null && (
            <span style={{ fontSize: 10, color: '#6b7280', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <svg width="8" height="8" viewBox="0 0 8 8" fill="#6b7280"><circle cx="4" cy="4" r="3.5"/></svg>
              {outsideCount} outside
            </span>
          )}
        </div>
      )}

      {/* Never entered — only show when we genuinely have no inside data */}
      {neverEntered && (
        <p style={{ fontSize: 10, color: '#6b7280', margin: '4px 0 0', fontStyle: 'italic' }}>
          Device hasn't entered this zone yet
        </p>
      )}

      {/* First seen / last seen / duration — only when actual GPS points exist */}
      {((insideCount ?? 0) > 0 || (outsideCount ?? 0) > 0) && (firstSeen || lastSeen) && (
        <div style={{ marginTop: 5, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {firstSeen && <span style={{ fontSize: 10, color: '#9ca3af' }}>First seen: {firstSeen}</span>}
          {lastSeen && lastSeen !== firstSeen && <span style={{ fontSize: 10, color: '#9ca3af' }}>Last seen: {lastSeen}</span>}
          {duration && <span style={{ fontSize: 10, color: '#60a5fa', fontWeight: 600 }}>Duration: {duration}</span>}
        </div>
      )}

      {/* Entry / Exit event log */}
      {events.length > 0 && (
        <div style={{ marginTop: 7 }}>
          <p style={{
            fontSize: 9, color: '#6b7280', margin: '0 0 4px',
            textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600,
          }}>
            Zone Activity
          </p>
          <div style={{ maxHeight: 130, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {events.map((ev, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: '0.04em', flexShrink: 0,
                  color: ev.type === 'ENTER' ? '#4ade80' : '#f87171',
                  width: 38,
                }}>
                  {ev.type === 'ENTER' ? '→ IN' : '← OUT'}
                </span>
                <span style={{ fontSize: 9, color: '#9ca3af' }}>
                  {fmtTs(ev.timestamp) || ev.timestamp}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Track loading skeleton (while GPS points are being fetched) ───────────────
function TrackLoadingSkeleton({ count }) {
  return (
    <div style={{ marginTop: 4, marginBottom: 6 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{
          padding: '6px 10px', marginBottom: 4,
          background: 'rgba(255,255,255,0.02)',
          borderRadius: 6,
          border: '1px solid rgba(255,255,255,0.05)',
          borderLeft: '3px solid rgba(96,165,250,0.3)',
          animation: 'zs-pulse 1.4s ease-in-out infinite',
          animationDelay: `${i * 0.15}s`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div className="zs-skel" style={{ width: 8, height: 8, borderRadius: '50%' }} />
            <div className="zs-skel" style={{ height: 9, width: '50%' }} />
          </div>
          <div className="zs-skel" style={{ height: 7, width: '35%', marginTop: 5 }} />
        </div>
      ))}
      <p style={{
        fontSize: 10, color: '#60a5fa', margin: '4px 0 0',
        fontStyle: 'italic', textAlign: 'center',
        animation: 'zs-pulse 1.4s ease-in-out infinite',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
      }}>
        <span style={{
          width: 7, height: 7, borderRadius: '50%',
          border: '1.5px solid #60a5fa', borderTopColor: 'transparent',
          display: 'inline-block',
          animation: 'zs-spin 0.7s linear infinite',
        }} />
        Fetching GPS tracks…
      </p>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function ZoneSidebar({
  zones           = [],
  selectedZoneId,
  onSelect,
  zoneStatuses    = {},
  statusLoading   = false,
  assignments     = {},
  onOpenAssign,
  onUnassign,
  assigningZoneId = null,
  deviceTracks    = [],
  tracksLoading   = false,
  zonesLoading    = false,
  onCreateZone    = null,
  onEditZone      = null,
  onDeleteZone    = null,
}) {
  // Count from zoneStatuses — works for both admin and user roles.
  // assignments comes from DeviceCache which users may not fully see.
  const totalAssigned = Object.values(zoneStatuses).reduce((s, arr) => s + arr.length, 0);

  // Build a quick lookup: sn → track for the DeviceRow
  const trackBySn = Object.fromEntries(deviceTracks.map((t) => [t.sn, t]));

  const sidebarLoading = zonesLoading || tracksLoading;

  return (
    <aside className="fp-sidebar" style={{ position: 'relative' }}>

      {/* ── API loading overlay ── */}
      {sidebarLoading && (
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
            {zonesLoading ? 'Loading zones…' : 'Fetching GPS tracks…'}
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
        {onCreateZone && (
          <button
            onClick={onCreateZone}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
              fontSize: 11, fontWeight: 700, letterSpacing: '0.03em',
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
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div className="fp-area-name">{zone.name}</div>

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
                    {isActive && (
                      <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                        {zone.uc_name} · {zone.tehsil}
                      </span>
                    )}
                  </div>
                </div>

                {/* ── Expanded content ── */}
                {isActive && (
                  <div style={{ marginTop: 8 }}>

                    {/* Assigning loader */}
                    {isAssigning ? (
                      <AssigningSkeleton />
                    ) : assignedCount === 0 ? (
                      <p style={{ fontSize: 11, color: '#6b7280', margin: '0 0 8px', fontStyle: 'italic' }}>
                        No devices assigned to this zone
                      </p>
                    ) : (
                      <div style={{ marginBottom: 8 }}>
                        {zoneDevices.map((entry) => (
                          <DeviceRow
                            key={entry.sn}
                            entry={entry}
                            onUnassign={onUnassign ? (sn) => onUnassign(sn, zone.zone_id) : null}
                            statusLoading={statusLoading}
                            trackInfo={trackBySn[entry.sn] ?? null}
                          />
                        ))}

                        {/* GPS tracks loading state — shown below device rows */}
                        {tracksLoading && (
                          <TrackLoadingSkeleton count={assignedCount} />
                        )}

                        {/* Track legend — shown once tracks have loaded */}
                        {!tracksLoading && deviceTracks.length > 0 && (
                          <div style={{
                            marginTop: 6, padding: '5px 8px',
                            background: 'rgba(96,165,250,0.06)',
                            borderRadius: 5,
                            border: '1px solid rgba(96,165,250,0.12)',
                          }}>
                            <p style={{ fontSize: 9, color: '#6b7280', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                              Map legend
                            </p>
                            {deviceTracks.map((t) => (
                              <div key={t.sn} style={{
                                display: 'flex', alignItems: 'center', gap: 5,
                                marginBottom: 2,
                              }}>
                                <span style={{
                                  width: 8, height: 8, borderRadius: '50%',
                                  background: deviceColor(t.sn), flexShrink: 0,
                                  boxShadow: `0 0 4px ${deviceColor(t.sn)}88`,
                                }} />
                                <span style={{ fontSize: 10, color: '#cbd5e1' }}>
                                  {t.user_name || t.sn}
                                </span>
                                <span style={{ fontSize: 9, color: '#4b5563', marginLeft: 'auto' }}>
                                  {t.insidePoints?.length ?? 0} in / {t.outsidePoints?.length ?? 0} out
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

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

                    {/* Edit / Delete — only for user-created zones */}
                    {(onEditZone || onDeleteZone) && zone.isUserZone && !isAssigning && (
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