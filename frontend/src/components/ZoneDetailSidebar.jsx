import React from 'react';
import { deviceColor } from '../utils/zonePolygonManager.js';

function StatusBadge({ status }) {
  const map = {
    INSIDE:  'badge-teal-500',
    OUTSIDE: 'badge-red-500',
    OFFLINE: 'badge-secondary',
  };
  const cls = map[status] || 'badge-secondary';
  return (
    <span className={`badge ${cls}`}>{status}</span>
  );
}

function AssigningSkeleton() {
  return (
    <div className="pb-vl-item">
      <div className="pb-vl-item-body">
        <style>{`
          @keyframes zds-pulse {
            0%, 100% { opacity: 0.4; }
            50%       { opacity: 0.9; }
          }
          .zds-skel {
            background: rgba(255,255,255,0.07);
            border-radius: 4px;
            animation: zds-pulse 1.4s ease-in-out infinite;
          }
        `}</style>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
          <div className="zds-skel" style={{ height: 10, width: '55%' }} />
          <div className="zds-skel" style={{ height: 16, width: 52, borderRadius: 999 }} />
        </div>
        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div className="zds-skel" style={{ height: 8, width: '70%' }} />
          <div className="zds-skel" style={{ height: 8, width: '45%' }} />
        </div>
        <p style={{
          fontSize: 10, color: '#6b7280', margin: '6px 0 0',
          fontStyle: 'italic', textAlign: 'center',
          animation: 'zds-pulse 1.4s ease-in-out infinite',
        }}>
          Fetching device info…
        </p>
      </div>
    </div>
  );
}

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

function DeviceRow({ entry, onUnassign, statusLoading, trackInfo, index }) {
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
    <div className="pb-vl-item">
      <div className="pb-vl-item-num">{index + 1}</div>
      <div className="pb-vl-item-body">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1, overflow: 'hidden' }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: color, flexShrink: 0,
              boxShadow: `0 0 5px ${color}88`,
            }} />
            <span className="pb-vl-item-loc">
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

        <div className="pb-vl-item-area" style={{ marginTop: '0.25em' }}>
          <span style={{ fontFamily: 'var(--font-mono)' }}>{entry.sn}</span>
        </div>

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

        {neverEntered && (
          <p className="pb-vl-muted" style={{ fontSize: 10, margin: '4px 0 0' }}>
            Device hasn't entered this zone yet
          </p>
        )}

        {((insideCount ?? 0) > 0 || (outsideCount ?? 0) > 0) && (firstSeen || lastSeen) && (
          <div style={{ marginTop: 5, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {firstSeen && <span className="pb-vl-item-ts">First seen: {firstSeen}</span>}
            {lastSeen && lastSeen !== firstSeen && <span className="pb-vl-item-ts">Last seen: {lastSeen}</span>}
            {duration && <span style={{ fontSize: 10, color: '#60a5fa', fontWeight: 600, marginTop: '2px' }}>Duration: {duration}</span>}
          </div>
        )}

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
                <div key={i} className="pb-tl-row" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: '0.04em', flexShrink: 0,
                    color: ev.type === 'ENTER' ? '#4ade80' : '#f87171',
                    width: 38,
                  }}>
                    {ev.type === 'ENTER' ? '→ IN' : '← OUT'}
                  </span>
                  <span className="pb-vl-item-ts" style={{ marginTop: 0 }}>
                    {fmtTs(ev.timestamp) || ev.timestamp}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TrackLoadingSkeleton({ count }) {
  return (
    <div style={{ marginTop: 4, marginBottom: 6 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="pb-vl-item">
          <div className="pb-vl-item-body">
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div className="zds-skel" style={{ width: 8, height: 8, borderRadius: '50%' }} />
              <div className="zds-skel" style={{ height: 9, width: '50%' }} />
            </div>
            <div className="zds-skel" style={{ height: 7, width: '35%', marginTop: 5 }} />
          </div>
        </div>
      ))}
      <p style={{
        fontSize: 10, color: '#60a5fa', margin: '4px 0 0',
        fontStyle: 'italic', textAlign: 'center',
        animation: 'zds-pulse 1.4s ease-in-out infinite',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
      }}>
        <span className="pb-spinner" style={{ width: '0.5em', height: '0.5em', borderTopColor: '#60a5fa' }} />
        Fetching GPS tracks…
      </p>
    </div>
  );
}

export default function ZoneDetailSidebar({
  zone,
  zoneDevices = [],
  statusLoading = false,
  isAssigning = false,
  deviceTracks = [],
  tracksLoading = false,
  onClose
}) {
  if (!zone) {
    return (
      <aside className="pb-visit-log" style={{ width: '100%' }}>
        <div className="pb-vl-empty">
          <svg className="pb-vl-empty-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1}>
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/>
            <circle cx="12" cy="10" r="1" fill="currentColor"/>
          </svg>
          <p>Select a zone to view device activity</p>
        </div>
      </aside>
    );
  }

  const assignedCount = zoneDevices.length;
  const trackBySn = Object.fromEntries(deviceTracks.map((t) => [t.sn, t]));

  return (
    <aside className="pb-visit-log" style={{ width: '100%', height: '100%', borderLeft: 'none' }}>
      <div className="pb-vl-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div className="pb-vl-title">{zone.name}</div>
          <div className="pb-vl-meta pb-vl-muted">
            {zone.uc_name} {zone.uc_name && zone.tehsil ? '·' : ''} {zone.tehsil}
          </div>
        </div>
        
        {/* Collapse Button */}
        <button className="btn-uiverse" onClick={onClose} title="Collapse sidebar">
          <div className="btn-uiverse-box">
            <span className="btn-uiverse-elem">
              <svg viewBox="0 0 46 40" xmlns="http://www.w3.org/2000/svg">
                <path d="M46 20.038c0-.7-.3-1.5-.8-2.1l-16-17c-1.1-1-3.2-1.4-4.4-.3-1.2 1.1-1.2 3.3 0 4.4l11.3 11.9H3c-1.7 0-3 1.3-3 3s1.3 3 3 3h33.1l-11.3 11.9c-1 1-1.2 3.3 0 4.4 1.2 1.1 3.3.8 4.4-.3l16-17c.5-.5.8-1.1.8-1.9z"></path>
              </svg>
            </span>
            <span className="btn-uiverse-elem">
              <svg viewBox="0 0 46 40">
                <path d="M46 20.038c0-.7-.3-1.5-.8-2.1l-16-17c-1.1-1-3.2-1.4-4.4-.3-1.2 1.1-1.2 3.3 0 4.4l11.3 11.9H3c-1.7 0-3 1.3-3 3s1.3 3 3 3h33.1l-11.3 11.9c-1 1-1.2 3.3 0 4.4 1.2 1.1 3.3.8 4.4-.3l16-17c.5-.5.8-1.1.8-1.9z"></path>
              </svg>
            </span>
          </div>
        </button>
      </div>

      <div className="pb-vl-list">
        {isAssigning ? (
          <AssigningSkeleton />
        ) : assignedCount === 0 ? (
          <div className="pb-vl-hint">
            No devices assigned to this zone
          </div>
        ) : (
          <div className="pb-vl-feed">
            {zoneDevices.map((entry, index) => (
              <DeviceRow
                key={entry.sn}
                index={index}
                entry={entry}
                onUnassign={null} 
                statusLoading={statusLoading}
                trackInfo={trackBySn[entry.sn] ?? null}
              />
            ))}

            {tracksLoading && (
              <TrackLoadingSkeleton count={assignedCount} />
            )}

            {!tracksLoading && deviceTracks.length > 0 && (
              <div style={{
                margin: '10px 15px', padding: '10px',
                background: 'rgba(96,165,250,0.06)',
                borderRadius: 5,
                border: '1px solid rgba(96,165,250,0.12)',
              }}>
                <p style={{ fontSize: 9, color: '#6b7280', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Map legend
                </p>
                {deviceTracks.map((t) => (
                  <div key={t.sn} style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    marginBottom: 4,
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
      </div>
    </aside>
  );
}
