import React, { useState, useMemo } from 'react';
import ModalPortal from './common/ModalPortal.jsx';
import { categoriesFor } from '../utils/deviceCategories.js';

const isStickerSN = (sn) => /^\d+$/.test(String(sn ?? ''));

const FIELD_STYLE = {
  width: '100%', background: '#18181b', border: '1px solid #3f3f46',
  borderRadius: 8, padding: '10px 12px', color: '#f4f4f5', fontSize: 13,
  outline: 'none', boxSizing: 'border-box',
};
const SELECT_STYLE = {
  ...FIELD_STYLE, cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 20 20' fill='%2371717a'%3E%3Cpath fill-rule='evenodd' d='M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z' clip-rule='evenodd'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', paddingRight: 36,
};
const SELECT_OPT = { background: '#27272a', color: '#f4f4f5' };
const LABEL_STYLE = { fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.55)', display: 'block', marginBottom: 6 };

/* ── Multi-select device picker (matches Fencepage Assign modal) ─────────────── */
function DeviceMultiSelect({ items, selected, onToggle, onToggleMany, labelOf, keyOf }) {
  const [q, setQ] = useState('');

  const matches = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return items;
    return items.filter((it) => labelOf(it).toLowerCase().includes(term));
  }, [items, q, labelOf]);

  const matchKeys = matches.map(keyOf);
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
          placeholder="Type to search unbound devices…"
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
        maxHeight: 180, overflowY: 'auto',
      }}>
        {matches.length === 0 ? (
          <div style={{ padding: '10px 12px', fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>
            No matching devices
          </div>
        ) : (
          matches.map((it) => {
            const key = keyOf(it);
            const on = selected.has(key);
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
                <span style={{ fontFamily: 'monospace', fontWeight: 600, flexShrink: 0 }}>
                  {it.sn}
                </span>
                {(it.name && it.name !== it.sn) && (
                  <span style={{ color: 'rgba(255,255,255,0.60)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {it.name}
                  </span>
                )}
                {it.client && (
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: 'rgba(255,255,255,0.35)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {it.client}
                  </span>
                )}
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}

/**
 * Add-device-to-user modal — supports selecting multiple devices simultaneously.
 *
 * Props:
 *   user      — { _id, id, name, email } target user (locked)
 *   devices   — array of unbound device objects from DeviceCacheContext
 *   onAssign  — async (sns: string[], { name, client, category }) => void
 *   onClose   — () => void
 */
export default function AddDeviceToUserModal({ user, devices, onAssign, onClose }) {
  const [selectedSns, setSelectedSns] = useState(() => new Set(devices.length > 0 ? [devices[0].sn] : []));
  const [name,        setName]        = useState('');
  const [client,      setClient]      = useState('');
  const [category,    setCategory]    = useState('');
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');

  const userName = user.name || user.email || 'this user';
  const firstSelected = Array.from(selectedSns)[0];
  const cats = categoriesFor(isStickerSN(firstSelected) ? 'sticker' : 'locator');

  const handleToggle = (sn) => {
    setSelectedSns((prev) => {
      const next = new Set(prev);
      if (next.has(sn)) next.delete(sn);
      else next.add(sn);
      return next;
    });
  };

  const handleToggleMany = (sns, selectAll) => {
    setSelectedSns((prev) => {
      const next = new Set(prev);
      sns.forEach((sn) => {
        if (selectAll) next.add(sn);
        else next.delete(sn);
      });
      return next;
    });
  };

  async function handleConfirm() {
    if (selectedSns.size === 0) { setError('Select at least one device'); return; }
    if (!category) { setError('Select a category'); return; }
    setLoading(true);
    setError('');
    try {
      await onAssign(Array.from(selectedSns), { name: name.trim(), client: client.trim(), category });
      onClose();
    } catch (e) {
      setError(e?.message || 'Assignment failed');
    } finally {
      setLoading(false);
    }
  }

  const isDisabled = loading || devices.length === 0 || selectedSns.size === 0 || !category;

  return (
    <ModalPortal>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(5px)', WebkitBackdropFilter: 'blur(5px)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
          zIndex: 9999, padding: 24, overflowY: 'auto',
        }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            background: '#000000', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 16, boxShadow: '0 24px 64px rgba(0,0,0,0.72)',
            width: '100%', maxWidth: 450, padding: 24, marginTop: 40,
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(167,44,50,0.14)', border: '1px solid rgba(167,44,50,0.30)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg style={{ width: 16, height: 16, color: '#C86068' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#FFFFFF' }}>Add Devices</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)', marginTop: 1 }}>
                  Assign to {userName}
                </div>
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.40)', padding: 4, fontSize: 16, lineHeight: 1 }}>✕</button>
          </div>

          {/* Error */}
          {error && (
            <div style={{ padding: '8px 12px', marginBottom: 12, background: 'rgba(127,29,29,0.2)', border: '1px solid rgba(127,29,29,0.4)', borderRadius: 6, color: '#fca5a5', fontSize: 12 }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Devices Multi-select */}
            <div>
              <label style={LABEL_STYLE}>Select Devices <span style={{ color: '#C86068' }}>*</span></label>
              {devices.length === 0 ? (
                <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.32)' }}>No unbound devices available</p>
              ) : (
                <DeviceMultiSelect
                  items={devices}
                  selected={selectedSns}
                  onToggle={handleToggle}
                  onToggleMany={handleToggleMany}
                  labelOf={d => d.sn + (d.name && d.name !== d.sn ? ` ${d.name}` : '') + (d.client ? ` ${d.client}` : '')}
                  keyOf={d => d.sn}
                />
              )}
            </div>

            {/* User — locked */}
            <div>
              <label style={LABEL_STYLE}>Assign to User</label>
              <div style={{ ...FIELD_STYLE, color: 'rgba(255,255,255,0.55)', cursor: 'default' }}>
                {userName}
              </div>
            </div>

            {/* Display Name */}
            <div>
              <label style={LABEL_STYLE}>Display Name <span style={{ color: 'rgba(255,255,255,0.30)', fontWeight: 400 }}>(optional)</span></label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Office Tracker" style={FIELD_STYLE}
                onFocus={e => { e.target.style.borderColor = 'rgba(167,44,50,0.60)' }}
                onBlur={e => { e.target.style.borderColor = '#3f3f46' }} />
            </div>

            {/* Category */}
            <div>
              <label style={LABEL_STYLE}>Category <span style={{ color: '#C86068' }}>*</span></label>
              <select value={category} onChange={e => setCategory(e.target.value)} style={SELECT_STYLE}>
                <option value="" disabled style={SELECT_OPT}>Select a category…</option>
                {cats.map(c => <option key={c} value={c} style={SELECT_OPT}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
            </div>

            {/* Client */}
            <div>
              <label style={LABEL_STYLE}>Client <span style={{ color: 'rgba(255,255,255,0.30)', fontWeight: 400 }}>(optional)</span></label>
              <input value={client} onChange={e => setClient(e.target.value)} placeholder="e.g. Acme Corp" style={FIELD_STYLE}
                onFocus={e => { e.target.style.borderColor = 'rgba(167,44,50,0.60)' }}
                onBlur={e => { e.target.style.borderColor = '#3f3f46' }} />
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
              <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.68)' }}>
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={isDisabled}
                style={{ padding: '9px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: isDisabled ? 'not-allowed' : 'pointer', background: isDisabled ? 'rgba(167,44,50,0.35)' : 'linear-gradient(135deg, #A72C32 0%, #8B2328 100%)', border: '1px solid rgba(167,44,50,0.40)', color: '#fff', opacity: isDisabled ? 0.6 : 1, transition: 'opacity 0.15s' }}
              >
                {loading ? 'Adding…' : `Add ${selectedSns.size} Device${selectedSns.size !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
