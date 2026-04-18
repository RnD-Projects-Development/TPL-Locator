// src/components/ZoneSidebar.jsx
import React from 'react';
import tplLogo from '../assets/tpl.png';

const PULSE_STYLE = `@keyframes tpl-pulse {
  0%   { opacity: 0.15; transform: scale(0.95); }
  50%  { opacity: 0.70; transform: scale(1.02); }
  100% { opacity: 0.15; transform: scale(0.95); }
}`;

// ── Formatters ─────────────────────────────────────────────────────────────────

function formatLastSeen(ts) {
  if (!ts) return '—';
  try {
    const d = new Date(ts);
    if (isNaN(d)) return '—';
    return d.toLocaleString(undefined, {
      month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
  } catch { return '—'; }
}

function formatDuration(ms) {
  if (ms <= 0) return '< 1m';
  const totalMins = Math.floor(ms / 60_000);
  const hrs  = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  const days = Math.floor(hrs / 24);
  const remH = hrs % 24;
  if (days > 0)  return `${days}d ${remH}h`;
  if (hrs > 0)   return `${hrs}h ${mins}m`;
  return `${totalMins}m`;
}

/**
 * Return the time-span between first_seen and last_seen as a formatted string,
 * or null if either timestamp is missing / invalid.
 */
function zoneTimeSpan(zone) {
  if (!zone.first_seen || !zone.last_seen) return null;
  try {
    const first = new Date(zone.first_seen);
    const last  = new Date(zone.last_seen);
    if (isNaN(first) || isNaN(last)) return null;
    const ms = last - first;
    if (ms < 0) return null;
    return formatDuration(ms);
  } catch { return null; }
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Props:
 *   zones          {Array}        — zone objects from the API
 *   selectedZoneId {string|null}  — currently highlighted zone_id
 *   onSelect       {Function}     — called with zone_id when an item is clicked
 *   loading        {boolean}      — shows pulse loader when true
 */
export default function ZoneSidebar({ zones, selectedZoneId, onSelect, loading }) {
  return (
    <aside className="fp-sidebar">

      {/* ── Header ── */}
      <div className="fp-sidebar-header">
        <div className="fp-sidebar-title">
          <svg width="14" height="14" viewBox="0 0 24 24"
               fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/>
            <circle cx="12" cy="10" r="1" fill="currentColor"/>
          </svg>
          Zones
          {!loading && <span className="fp-sidebar-count">{zones.length}</span>}
        </div>
      </div>

      {/* ── Zone list ── */}
      <div className="fp-area-list">
        {loading ? (
          <div className="fp-no-areas">
            <style>{PULSE_STYLE}</style>
            <img
              src={tplLogo}
              alt="Loading"
              style={{
                width: 48, height: 'auto',
                filter: 'brightness(0) invert(1)',
                animation: 'tpl-pulse 1.6s ease-in-out infinite',
              }}
            />
            <span style={{
              fontSize: 10,
              color: 'var(--text-tertiary)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}>
              Loading zones…
            </span>
          </div>

        ) : zones.length === 0 ? (
          <div className="fp-no-areas fp-zone-empty">
            <svg width="36" height="36" viewBox="0 0 24 24"
                 fill="none" stroke="currentColor" strokeWidth={1.2}
                 style={{ opacity: 0.2 }}>
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/>
              <circle cx="12" cy="10" r="1" fill="currentColor"/>
            </svg>
            <p>No activity zones found</p>
          </div>

        ) : (
          zones.map((zone) => {
            const isActive = zone.zone_id === selectedZoneId;
            const span     = zoneTimeSpan(zone);

            return (
              <div
                key={zone.zone_id}
                className={`fp-area-item${isActive ? ' active' : ''}`}
                onClick={() => onSelect(zone.zone_id)}
              >
                <div className="fp-area-name">{zone.name}</div>

                <div className="fp-area-meta">
                  {/* Point count */}
                  <span className="fp-zone-points-badge">
                    {zone.total_points} pts
                  </span>

                  {/* Time spent (first → last fix) */}
                  {span && (
                    <span className="fp-zone-duration" title="Time between first and last recorded fix">
                      <svg width="9" height="9" viewBox="0 0 24 24"
                           fill="none" stroke="currentColor" strokeWidth={2.5}>
                        <circle cx="12" cy="12" r="10"/>
                        <polyline points="12 6 12 12 16 14"/>
                      </svg>
                      {span}
                    </span>
                  )}
                </div>

                {/* Last seen — only when selected to keep list compact */}
                {isActive && zone.last_seen && (
                  <div className="fp-zone-lastseen">
                    Last seen {formatLastSeen(zone.last_seen)}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ── Footer ── */}
      {!loading && zones.length > 0 && (
        <div className="fp-sidebar-footer">
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            {zones.length} zone{zones.length !== 1 ? 's' : ''} loaded
          </span>
        </div>
      )}
    </aside>
  );
}
