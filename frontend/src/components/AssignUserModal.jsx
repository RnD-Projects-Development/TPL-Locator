import React, { useState } from 'react';
import ModalPortal from './common/ModalPortal.jsx';
import { categoriesFor } from '../utils/deviceCategories.js';

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

function SearchSelect({ items, selectedValue, onSelect, labelOf, keyOf, placeholder, emptyMsg }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const found = items.find(it => keyOf(it) === selectedValue);
  const inputVal = open ? q : (found ? labelOf(found) : '');
  const matches = q.trim()
    ? items.filter(it => labelOf(it).toLowerCase().includes(q.toLowerCase())).slice(0, 20)
    : items.slice(0, 20);

  const toggleOpen = () => {
    if (open) { setOpen(false); setQ(''); }
    else { setQ(''); setOpen(true); }
  };

  const inputSt = {
    width: '100%', background: '#18181b',
    border: open ? '1px solid rgba(167,44,50,0.60)' : '1px solid #3f3f46',
    borderRadius: 8, padding: '10px 12px', color: '#f4f4f5', fontSize: 13,
    outline: 'none', cursor: 'text', boxSizing: 'border-box',
    paddingLeft: 34, paddingRight: 34, transition: 'border-color 0.15s',
  };

  return (
    <div>
      <div style={{ position: 'relative' }}>
        <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: open ? 'rgba(255,255,255,0.60)' : 'rgba(255,255,255,0.32)', pointerEvents: 'none', transition: 'color 0.15s' }} viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
        </svg>
        <input
          value={inputVal}
          onChange={e => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => { setQ(''); setOpen(true); }}
          onBlur={() => setTimeout(() => { setOpen(false); setQ(''); }, 160)}
          placeholder={placeholder}
          autoComplete="off"
          style={inputSt}
        />
        <svg
          onMouseDown={e => { e.preventDefault(); toggleOpen(); }}
          style={{ position: 'absolute', right: 10, top: '50%', transform: open ? 'translateY(-50%) rotate(180deg)' : 'translateY(-50%)', width: 13, height: 13, color: open ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.28)', cursor: 'pointer', transition: 'transform 0.2s, color 0.15s' }}
          viewBox="0 0 20 20" fill="currentColor"
        >
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </div>
      {open && (
        <div style={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, maxHeight: 200, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.55)', marginTop: 4 }}>
          {matches.length === 0
            ? <div style={{ padding: '10px 12px', fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>{emptyMsg || 'No matches'}</div>
            : matches.map(it => (
              <div key={keyOf(it)}
                onMouseDown={e => { e.preventDefault(); onSelect(keyOf(it)); setOpen(false); setQ(''); }}
                style={{ padding: '9px 12px', fontSize: 13, cursor: 'pointer', color: keyOf(it) === selectedValue ? '#fff' : '#d4d4d8', background: keyOf(it) === selectedValue ? 'rgba(167,44,50,0.22)' : 'transparent', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                onMouseLeave={e => e.currentTarget.style.background = keyOf(it) === selectedValue ? 'rgba(167,44,50,0.22)' : 'transparent'}
              >
                {labelOf(it)}
              </div>
            ))
          }
          {items.length > 20 && q.trim() === '' && (
            <div style={{ padding: '6px 12px', fontSize: 11, color: 'rgba(255,255,255,0.28)', fontStyle: 'italic', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              Showing top 20 — type to filter {items.length} total
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Assign-user modal for a device detail page. Same fields as the Bind modal,
 * but the device SN is pre-selected and locked (we're already on that device).
 *
 * Props:
 *   sn              — device serial number (locked)
 *   deviceType      — 'locator' | 'sticker' (drives the category list)
 *   currentUserName — name currently assigned (shown as subtitle), or null
 *   users           — array from UserCacheContext
 *   onSubmit        — async ({ userId, name, client, category }) => void
 *   onClose         — () => void
 */
export default function AssignUserModal({ sn, deviceType = 'locator', currentUserName, users, onSubmit, onClose }) {
  const [selectedId, setSelectedId] = useState('');
  const [name,       setName]       = useState('');
  const [client,     setClient]     = useState('');
  const [category,   setCategory]   = useState('');
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');

  const cats = categoriesFor(deviceType);

  async function handleConfirm() {
    if (!selectedId) { setError('Select a user first'); return; }
    if (!category)   { setError('Select a category'); return; }
    setLoading(true);
    setError('');
    try {
      await onSubmit({ userId: selectedId, name: name.trim(), client: client.trim(), category });
      onClose();
    } catch (e) {
      setError(e?.message || 'Assignment failed');
    } finally {
      setLoading(false);
    }
  }

  const isDisabled = loading || users.length === 0 || !selectedId || !category;

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
            width: '100%', maxWidth: 420, padding: 24, marginTop: 40,
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(167,44,50,0.14)', border: '1px solid rgba(167,44,50,0.30)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg style={{ width: 16, height: 16, color: '#C86068' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#FFFFFF' }}>Assign User</div>
                {currentUserName && (
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)', marginTop: 1 }}>
                    Currently: {currentUserName}
                  </div>
                )}
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.40)', padding: 4, fontSize: 16, lineHeight: 1 }}>✕</button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Device SN — locked */}
            <div>
              <label style={LABEL_STYLE}>Device SN</label>
              <div style={{ ...FIELD_STYLE, color: 'rgba(255,255,255,0.45)', fontFamily: 'monospace', cursor: 'default' }}>
                {sn}
              </div>
            </div>

            {/* Assign to User */}
            <div>
              <label style={LABEL_STYLE}>Assign to User <span style={{ color: '#C86068' }}>*</span></label>
              {users.length === 0 ? (
                <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.32)' }}>No users available</p>
              ) : (
                <SearchSelect
                  items={users}
                  selectedValue={selectedId}
                  onSelect={setSelectedId}
                  labelOf={u => (u.email || u.name || 'Unknown') + (u.email && u.name ? ` (${u.name})` : '')}
                  keyOf={u => u._id ?? u.id}
                  placeholder="Type to search or select a user…"
                  emptyMsg="No matching users"
                />
              )}
            </div>

            {/* Display Name */}
            <div>
              <label style={LABEL_STYLE}>Display Name <span style={{ color: 'rgba(255,255,255,0.30)', fontWeight: 400 }}>(optional)</span></label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Office Locator" style={FIELD_STYLE} />
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
              <input value={client} onChange={e => setClient(e.target.value)} placeholder="e.g. Acme Corp" style={FIELD_STYLE} />
            </div>

            {error && (
              <div style={{ padding: '8px 12px', background: 'rgba(127,29,29,0.2)', border: '1px solid rgba(127,29,29,0.4)', borderRadius: 6, color: '#fca5a5', fontSize: 12 }}>
                {error}
              </div>
            )}

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
                {loading ? 'Assigning…' : 'Assign User'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
