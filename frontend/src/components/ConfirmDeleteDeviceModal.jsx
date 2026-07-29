import React, { useState } from 'react';
import ModalPortal from './common/ModalPortal.jsx';

/**
 * Disclaimer + confirmation shown before a device is deleted from a zone.
 *
 * Nothing is written to the database until the user confirms here — the caller
 * only fires DELETE /api/zones/{zone_id}/assign/{sn} once onConfirm resolves.
 *
 * Props:
 *   deviceLabel — display name shown in the prompt
 *   sn          — device serial number
 *   zoneName    — zone the device is being removed from
 *   onConfirm   — async () => void
 *   onClose     — () => void
 */
export default function ConfirmDeleteDeviceModal({ deviceLabel, sn, zoneName, onConfirm, onClose }) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  async function handleConfirm() {
    setLoading(true);
    setError('');
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      setError(e?.message || 'Failed to delete device from zone');
      setLoading(false);
    }
  }

  return (
    <ModalPortal>
      <div
        onClick={loading ? undefined : onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(5px)', WebkitBackdropFilter: 'blur(5px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 10000, padding: 24,
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: '#000000', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 16, boxShadow: '0 24px 64px rgba(0,0,0,0.72)',
            width: '100%', maxWidth: 430, padding: 22,
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 9, flexShrink: 0,
              background: 'rgba(220,38,38,0.14)', border: '1px solid rgba(220,38,38,0.35)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg style={{ width: 17, height: 17, color: '#f87171' }} viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#FFFFFF' }}>Delete device from zone?</div>
          </div>

          {/* Disclaimer */}
          <div style={{
            padding: '12px 14px', marginBottom: 14,
            background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.20)',
            borderRadius: 8,
          }}>
            <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, color: 'rgba(255,255,255,0.72)' }}>
              <strong style={{ color: '#f4f4f5' }}>{deviceLabel}</strong>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'rgba(255,255,255,0.45)' }}> ({sn})</span>
              {' '}will be removed from <strong style={{ color: '#f4f4f5' }}>{zoneName}</strong>.
            </p>
            <ul style={{ margin: '10px 0 0', paddingLeft: 16, fontSize: 12, lineHeight: 1.65, color: 'rgba(255,255,255,0.55)' }}>
              <li>The zone document drops this serial from <code style={{ fontFamily: 'var(--font-mono)', color: '#fca5a5' }}>device_sns</code>.</li>
              <li>The device document drops this zone from <code style={{ fontFamily: 'var(--font-mono)', color: '#fca5a5' }}>fence_zone_ids</code>.</li>
              <li>Its GPS tracks disappear from this map and it stops raising entry/exit alerts for this zone.</li>
            </ul>
            <p style={{ margin: '10px 0 0', fontSize: 12, lineHeight: 1.55, color: 'rgba(255,255,255,0.55)' }}>
              The device itself, its user binding and its location history are <strong style={{ color: '#f4f4f5' }}>not</strong> deleted —
              it stays in your fleet and can be assigned back to this zone at any time.
            </p>
          </div>

          {error && (
            <div style={{
              padding: '8px 12px', marginBottom: 12,
              background: 'rgba(127,29,29,0.2)', border: '1px solid rgba(127,29,29,0.4)',
              borderRadius: 6, color: '#fca5a5', fontSize: 12,
            }}>
              {error}
            </div>
          )}

          {/* Footer */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button
              onClick={onClose}
              disabled={loading}
              style={{
                padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)',
                color: 'rgba(255,255,255,0.68)',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={loading}
              style={{
                padding: '9px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                background: loading ? 'rgba(185,28,28,0.45)' : 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                border: '1px solid rgba(220,38,38,0.45)', color: '#fff',
                opacity: loading ? 0.7 : 1, transition: 'opacity 0.15s',
              }}
            >
              {loading ? 'Deleting…' : 'Delete Device'}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
