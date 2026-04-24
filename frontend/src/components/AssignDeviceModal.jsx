// src/components/AssignDeviceModal.jsx
// Reuses hp-modal-* CSS from DevicesPage.css (global CSS — safe to import here).
import React, { useState, useMemo } from 'react';
import '../pages/DevicesPage.css';

const SELECT_STYLE = {
  width: '100%',
  padding: '9px 12px',
  background: '#27272a',
  border: '1px solid #3f3f46',
  borderRadius: 8,
  color: '#f4f4f5',
  fontSize: 13,
  outline: 'none',
  cursor: 'pointer',
  appearance: 'none',
  WebkitAppearance: 'none',
};

/**
 * Props:
 *   zone        — { zone_id, name } the zone being assigned to
 *   devices     — full device list from DeviceCache
 *   assignments — { zone_id: [{sn}] } — to filter already-assigned devices
 *   onAssign    — async (sn: string) => void
 *   onClose     — () => void
 */
export default function AssignDeviceModal({ zone, devices, assignments, onAssign, onClose }) {
  // Memoize so this doesn't recompute on every render (fixes sluggishness).
  // A device is available if it has no zone, or its zone is not a beat_ KML zone.
  const available = useMemo(
    () => devices.filter((d) => !d.zone || !d.zone.startsWith('beat_')),
    [devices]
  );

  // BUG FIX: initialize to the sn string (guaranteed) or null.
  // Never fall back to '' — an empty string is falsy and breaks the disabled check.
  const [selectedSn, setSelectedSn] = useState(available[0]?.sn ?? null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');

  async function handleConfirm() {
    if (!selectedSn) { setError('Select a device first'); return; }
    setLoading(true);
    setError('');
    try {
      await onAssign(selectedSn);
      onClose();
    } catch (e) {
      setError(e?.message || 'Assignment failed');
    } finally {
      setLoading(false);
    }
  }

  // BUG FIX: button is disabled only when truly nothing is selected or list is empty.
  // Previously `!selectedSn` was true whenever sn was '' (falsy), locking the button
  // even though a device was visually shown in the dropdown.
  const isDisabled = loading || available.length === 0 || selectedSn == null;

  return (
    <div className="hp-modal-overlay" onClick={onClose}>
      <div className="hp-modal" onClick={(e) => e.stopPropagation()}>

        <div className="hp-modal-header">
          <div className="hp-modal-title-wrap">
            <div className="hp-modal-icon">
              <svg viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd"/>
              </svg>
            </div>
            <h3>Assign Device to Zone</h3>
          </div>
          <button className="hp-modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="hp-modal-body">
          <p style={{ fontSize: 12, color: '#71717a', marginBottom: 16 }}>
            Zone: <strong style={{ color: '#f4f4f5' }}>{zone.name}</strong>
          </p>

          {error && (
            <div style={{
              padding: '8px 12px', marginBottom: 12,
              background: 'rgba(127,29,29,0.2)', border: '1px solid rgba(127,29,29,0.4)',
              borderRadius: 6, color: '#fca5a5', fontSize: 12,
            }}>
              {error}
            </div>
          )}

          <div className="hp-modal-field">
            <label>Select Device <span className="required">*</span></label>
            {available.length === 0 ? (
              <p style={{ color: '#71717a', fontSize: 12, margin: '4px 0 0' }}>
                No unassigned devices available
              </p>
            ) : (
              <select
                value={selectedSn ?? ''}
                onChange={(e) => setSelectedSn(e.target.value || null)}
                style={SELECT_STYLE}
              >
                {available.map((d) => (
                  <option key={d.sn} value={d.sn}>
                    {d.assigned_user_name || d.assignedUser || d.sn}
                    {d.name && d.name !== d.sn ? ` — ${d.name}` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="hp-modal-footer">
          <button className="hp-modal-cancel" onClick={onClose}>Cancel</button>
          <button
            className="hp-modal-confirm"
            onClick={handleConfirm}
            disabled={isDisabled}
          >
            {loading ? 'Assigning…' : 'Assign Device'}
          </button>
        </div>

      </div>
    </div>
  );
}