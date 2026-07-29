import React, { useState, useMemo } from 'react';
import ModalPortal from './common/ModalPortal.jsx';

/* ── Multi-select device picker ───────────────────────────────────────────────
   Search box + checkbox list. Unlike the old single-value SearchSelect, the
   list stays open and selections accumulate, so several devices can go into a
   zone in one pass. */
function DeviceMultiSelect({ items, selected, onToggle, onToggleMany, labelOf, keyOf }) {
  const [q, setQ] = useState('');

  const matches = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return items;
    return items.filter((it) => labelOf(it).toLowerCase().includes(term));
  }, [items, q, labelOf]);

  const matchKeys      = matches.map(keyOf);
  const allShownPicked = matchKeys.length > 0 && matchKeys.every((k) => selected.has(k));

  const inputSt = {
    width: '100%', background: '#18181b', border: '1px solid #3f3f46',
    borderRadius: 8, padding: '10px 12px 10px 34px', color: '#f4f4f5', fontSize: 13,
    outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s',
  };

  return (
    <div>
      <div style={{ position: 'relative' }}>
        <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: 'rgba(255,255,255,0.32)', pointerEvents: 'none' }} viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
        </svg>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Type to search devices…"
          autoComplete="off"
          style={inputSt}
          onFocus={(e) => { e.target.style.borderColor = 'rgba(167,44,50,0.60)'; }}
          onBlur={(e) => { e.target.style.borderColor = '#3f3f46'; }}
        />
      </div>

      {/* Select-all / clear row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, marginBottom: 6 }}>
        <button
          type="button"
          onClick={() => onToggleMany(matchKeys, !allShownPicked)}
          disabled={matchKeys.length === 0}
          style={{
            background: 'none', border: 'none', padding: 0, cursor: matchKeys.length ? 'pointer' : 'not-allowed',
            fontSize: 11, fontWeight: 600, color: matchKeys.length ? '#C86068' : 'rgba(255,255,255,0.25)',
          }}
        >
          {allShownPicked ? 'Clear these' : `Select all ${matchKeys.length}`}
        </button>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
          {selected.size} selected
        </span>
      </div>

      <div style={{
        background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8,
        maxHeight: 240, overflowY: 'auto',
      }}>
        {matches.length === 0 ? (
          <div style={{ padding: '10px 12px', fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>
            No matching devices
          </div>
        ) : (
          matches.map((it) => {
            const key = keyOf(it);
            const on  = selected.has(key);
            return (
              <label
                key={key}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 12px', fontSize: 13, cursor: 'pointer',
                  color: on ? '#fff' : '#d4d4d8',
                  background: on ? 'rgba(167,44,50,0.22)' : 'transparent',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                }}
                onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = on ? 'rgba(167,44,50,0.22)' : 'transparent'; }}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => onToggle(key)}
                  style={{ accentColor: '#A72C32', width: 14, height: 14, flexShrink: 0, cursor: 'pointer' }}
                />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {labelOf(it)}
                </span>
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}

/**
 * Props:
 *   zone        — { zone_id, name } the zone being assigned to
 *   devices     — full device list from DeviceCache
 *   assignments — { zone_id: [{sn}] } — to filter already-assigned devices
 *   onAssign    — async (sns: string[]) => { failures: [{sn, message}] } | void
 *   onClose     — () => void
 */
export default function AssignDeviceModal({ zone, devices, assignments, onAssign, onClose }) {
  const alreadyInZone = useMemo(
    () => new Set((assignments[zone.zone_id] || []).map((e) => e.sn)),
    [assignments, zone.zone_id]
  );
  const available = useMemo(
    () => devices.filter((d) => d.sn && !alreadyInZone.has(d.sn)),
    [devices, alreadyInZone]
  );

  const [selected, setSelected] = useState(() => new Set());
  const [loading,  setLoading]  = useState(false);
  const [progress, setProgress] = useState(null);   // { done, total }
  const [error,    setError]    = useState('');

  function toggle(sn) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(sn)) next.delete(sn); else next.add(sn);
      return next;
    });
  }

  function toggleMany(sns, on) {
    setSelected((prev) => {
      const next = new Set(prev);
      sns.forEach((sn) => { if (on) next.add(sn); else next.delete(sn); });
      return next;
    });
  }

  async function handleConfirm() {
    const sns = [...selected];
    if (sns.length === 0) { setError('Select at least one device'); return; }
    setLoading(true);
    setError('');
    setProgress({ done: 0, total: sns.length });
    try {
      const result = await onAssign(sns, (done) => setProgress({ done, total: sns.length }));
      const failures = result?.failures ?? [];
      if (failures.length === 0) {
        onClose();
        return;
      }
      // Keep the modal open so the user can see exactly what didn't go through.
      setSelected(new Set(failures.map((f) => f.sn)));
      setError(
        `${sns.length - failures.length} of ${sns.length} assigned. Failed: ` +
        failures.map((f) => `${f.sn} (${f.message})`).join('; ')
      );
    } catch (e) {
      setError(e?.message || 'Assignment failed');
    } finally {
      setLoading(false);
      setProgress(null);
    }
  }

  const isDisabled = loading || selected.size === 0;

  return (
    <ModalPortal>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(5px)', WebkitBackdropFilter: 'blur(5px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999, padding: 24,
        }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            background: '#000000', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 16, boxShadow: '0 24px 64px rgba(0,0,0,0.72)',
            width: '100%', maxWidth: 420, padding: 22,
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(167,44,50,0.14)', border: '1px solid rgba(167,44,50,0.30)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg style={{ width: 16, height: 16, color: '#C86068' }} viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                </svg>
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#FFFFFF' }}>Assign Devices to Zone</div>
            </div>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.40)', padding: 4, lineHeight: 1, fontSize: 16 }}
            >✕</button>
          </div>

          {/* Zone name */}
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.40)', marginBottom: 16 }}>
            Zone: <strong style={{ color: '#f4f4f5', fontWeight: 600 }}>{zone.name}</strong>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              padding: '8px 12px', marginBottom: 12,
              background: 'rgba(127,29,29,0.2)', border: '1px solid rgba(127,29,29,0.4)',
              borderRadius: 6, color: '#fca5a5', fontSize: 12,
            }}>
              {error}
            </div>
          )}

          {/* Device select */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.55)', display: 'block', marginBottom: 6 }}>
              Select Devices <span style={{ color: '#C86068' }}>*</span>
            </label>
            {available.length === 0 ? (
              <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.32)' }}>
                All devices are already assigned to this zone
              </p>
            ) : (
              <DeviceMultiSelect
                items={available}
                selected={selected}
                onToggle={toggle}
                onToggleMany={toggleMany}
                labelOf={d =>
                  (d.assigned_user_name || d.assignedUser || d.sn) +
                  (d.name && d.name !== d.sn ? ` — ${d.name}` : '')
                }
                keyOf={d => d.sn}
              />
            )}
          </div>

          {/* Footer */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button
              onClick={onClose}
              disabled={loading}
              style={{ padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.68)' }}
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={isDisabled}
              style={{ padding: '9px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: isDisabled ? 'not-allowed' : 'pointer', background: isDisabled ? 'rgba(167,44,50,0.35)' : 'linear-gradient(135deg, #A72C32 0%, #8B2328 100%)', border: '1px solid rgba(167,44,50,0.40)', color: '#fff', opacity: isDisabled ? 0.6 : 1, transition: 'opacity 0.15s' }}
            >
              {loading
                ? `Assigning ${progress ? `${progress.done}/${progress.total}` : ''}…`
                : `Assign ${selected.size || ''} Device${selected.size === 1 ? '' : 's'}`.replace('  ', ' ')}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
