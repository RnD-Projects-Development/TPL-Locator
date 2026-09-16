import React, { useState, useEffect } from 'react';
import { X, Tag, Check, AlertCircle, RefreshCw, DollarSign } from 'lucide-react';
import ModalPortal from '../common/ModalPortal.jsx';
import { useCityTag } from '../../hooks/useCityTag.js';
import { invalidateFleetCache } from '../../utils/fleetCache.js';

const CURRENCIES = ['PKR', 'USD', 'EUR', 'GBP', 'AED', 'SAR'];

export default function PricingModal({ isOpen, onClose, pageTheme }) {
  const isLight = pageTheme === 'light';
  const { getPricing, updatePricing } = useCityTag();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Universal pricing state
  const [currentPrice, setCurrentPrice] = useState(0);
  const [priceInput, setPriceInput] = useState('');
  const [currency, setCurrency] = useState('PKR');
  const [updatedAt, setUpdatedAt] = useState(null);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getPricing();
      if (res) {
        const p = res.price ?? 0;
        const c = res.currency || 'PKR';
        setCurrentPrice(p);
        setPriceInput(String(p));
        setCurrency(c);
        setUpdatedAt(res.updated_at || null);
      }
    } catch (err) {
      setError(err?.message || 'Failed to load pricing information');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
      setError('');
      setSuccessMsg('');
    }
  }, [isOpen]);

  const handleSave = async (e) => {
    e.preventDefault();
    const num = parseFloat(priceInput);
    if (isNaN(num) || num < 0) {
      setError('Please enter a valid non-negative price.');
      return;
    }
    setSaving(true);
    setError('');
    setSuccessMsg('');
    try {
      const res = await updatePricing({
        price: num,
        currency: currency,
        apply_to_all: true,
      });
      setSuccessMsg(res?.message || `Successfully updated device price to ${num.toLocaleString()} ${currency} for all devices.`);
      setCurrentPrice(num);
      setUpdatedAt(new Date().toISOString());
      invalidateFleetCache(true);
    } catch (err) {
      setError(err?.message || 'Failed to update pricing');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const bgModal = isLight ? '#ffffff' : '#14171f';
  const borderModal = isLight ? '#e2e8f0' : 'rgba(255,255,255,0.08)';
  const textPrimary = isLight ? '#0f172a' : '#f8fafc';
  const textSecondary = isLight ? '#64748b' : 'rgba(255,255,255,0.6)';
  const inputBg = isLight ? '#f8fafc' : 'rgba(255,255,255,0.04)';
  const inputBorder = isLight ? '#cbd5e1' : 'rgba(255,255,255,0.12)';

  return (
    <ModalPortal>
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 99999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(0, 0, 0, 0.65)',
          backdropFilter: 'blur(5px)',
          padding: '16px',
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget && !saving) onClose();
        }}
      >
        <div
          style={{
            background: bgModal,
            border: `1px solid ${borderModal}`,
            borderRadius: '16px',
            width: '100%',
            maxWidth: '520px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.45)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '18px 24px',
              borderBottom: `1px solid ${borderModal}`,
              background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: 'rgba(167, 44, 50, 0.12)',
                  color: '#A72C32',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Tag size={18} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.08rem', fontWeight: 700, color: textPrimary }}>
                  Device Pricing
                </h3>
                <p style={{ margin: 0, fontSize: '0.78rem', color: textSecondary }}>
                  Configure uniform price for all deployment devices
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              disabled={saving}
              style={{
                background: 'transparent',
                border: 'none',
                color: textSecondary,
                cursor: 'pointer',
                padding: '6px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 0.15s, color 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = textPrimary;
                e.currentTarget.style.background = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = textSecondary;
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <X size={20} />
            </button>
          </div>

          {/* Body Content */}
          <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {/* Status Messages */}
            {error && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  color: '#ef4444',
                  fontSize: '0.84rem',
                }}
              >
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}

            {successMsg && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  background: 'rgba(34, 197, 94, 0.12)',
                  border: '1px solid rgba(34, 197, 94, 0.25)',
                  color: '#22c55e',
                  fontSize: '0.84rem',
                }}
              >
                <Check size={16} style={{ flexShrink: 0 }} />
                <span>{successMsg}</span>
              </div>
            )}

            {/* Current Active Pricing Badge */}
            <div
              style={{
                padding: '16px',
                borderRadius: '12px',
                background: isLight ? '#f1f5f9' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${borderModal}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: textSecondary, marginBottom: '4px' }}>
                  Current Active Price
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                  <span style={{ fontSize: '1.45rem', fontWeight: 700, color: textPrimary }}>
                    {loading ? '…' : currentPrice.toLocaleString()}
                  </span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#A72C32' }}>
                    {currency}
                  </span>
                  <span style={{ fontSize: '0.78rem', color: textSecondary }}>
                    / device
                  </span>
                </div>
              </div>
            </div>

            {/* Edit Form */}
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr', gap: '12px' }}>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      color: textPrimary,
                      marginBottom: '6px',
                    }}
                  >
                    Price Amount <span style={{ color: '#A72C32' }}>*</span>
                  </label>
                  <div style={{ position: 'relative' }}>
                    <DollarSign
                      size={15}
                      style={{
                        position: 'absolute',
                        left: '12px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: textSecondary,
                      }}
                    />
                    <input
                      type="number"
                      step="any"
                      min="0"
                      required
                      value={priceInput}
                      onChange={(e) => setPriceInput(e.target.value)}
                      placeholder="e.g. 5000"
                      disabled={loading || saving}
                      style={{
                        width: '100%',
                        padding: '9px 12px 9px 34px',
                        borderRadius: '8px',
                        border: `1px solid ${inputBorder}`,
                        background: inputBg,
                        color: textPrimary,
                        fontSize: '0.90rem',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      color: textPrimary,
                      marginBottom: '6px',
                    }}
                  >
                    Currency <span style={{ color: '#A72C32' }}>*</span>
                  </label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    disabled={loading || saving}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: `1px solid ${inputBorder}`,
                      background: inputBg,
                      color: textPrimary,
                      fontSize: '0.90rem',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c} style={{ background: bgModal, color: textPrimary }}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Action Buttons */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: '10px',
                  marginTop: '10px',
                  paddingTop: '16px',
                  borderTop: `1px solid ${borderModal}`,
                }}
              >
                <button
                  type="button"
                  onClick={onClose}
                  disabled={saving}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: `1px solid ${borderModal}`,
                    background: 'transparent',
                    color: textSecondary,
                    fontSize: '0.84rem',
                    fontWeight: 600,
                    cursor: saving ? 'not-allowed' : 'pointer',
                    transition: 'background 0.15s, color 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    if (!saving) {
                      e.currentTarget.style.color = textPrimary;
                      e.currentTarget.style.background = isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = textSecondary;
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  Close
                </button>

                <button
                  type="submit"
                  disabled={saving || loading}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 20px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#A72C32',
                    color: '#ffffff',
                    fontSize: '0.84rem',
                    fontWeight: 600,
                    cursor: saving || loading ? 'not-allowed' : 'pointer',
                    opacity: saving || loading ? 0.75 : 1,
                    transition: 'opacity 0.15s, transform 0.1s',
                  }}
                  onMouseEnter={(e) => {
                    if (!saving && !loading) e.currentTarget.style.opacity = '0.9';
                  }}
                  onMouseLeave={(e) => {
                    if (!saving && !loading) e.currentTarget.style.opacity = '1';
                  }}
                >
                  {saving ? (
                    <>
                      <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} />
                      <span>Saving…</span>
                    </>
                  ) : (
                    <span>Save Pricing</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
