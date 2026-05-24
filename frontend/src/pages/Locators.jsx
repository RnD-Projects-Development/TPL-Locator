import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  Radio, Search, User, Key, PawPrint, Wallet,
  ChevronRight, Plus, X, Link2, Trash2,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useCityTag } from '../hooks/useCityTag.js'
import { useDeviceCache } from '../context/DeviceCacheContext.jsx'
import { useUserCache } from '../context/Usercachecontext.jsx'
import { usePaginatedDevices } from '../hooks/usePaginatedDevices.js'

// ── Design tokens ─────────────────────────────────────────────────────────────
const panel = {
  background: '#242323',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: '18px',
  boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
}

const SELECT_STYLE = {
  width: '100%',
  background: '#18181b',
  border: '1px solid #3f3f46',
  borderRadius: 8,
  padding: '10px 12px',
  color: '#f4f4f5',
  fontSize: 13,
  outline: 'none',
  cursor: 'pointer',
  appearance: 'none',
  WebkitAppearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 20 20' fill='%2371717a'%3E%3Cpath fill-rule='evenodd' d='M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z' clip-rule='evenodd'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 12px center',
  paddingRight: 36,
}

const SELECT_OPT = { background: '#27272a', color: '#f4f4f5' }

const CATS = ['All', 'Human', 'Wallet', 'Key', 'Pet', 'Bag']
const catIcon = c => ({ Human: User, Wallet, Key, Pet: PawPrint, Bag: Wallet }[c] || Radio)

const BIND_CATS = [
  'wallet','bag','purse','car','motorcycle','bicycle','van','truck','bus',
  'laptop','phone','keys','pet tracker','child tracker','asset','luggage','backpack','other',
]

function BattBar({ v }) {
  const color = v > 40 ? '#10B981' : v > 20 ? '#F59E0B' : '#EF4444'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 52, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.08)' }}>
        <div style={{ height: 5, borderRadius: 3, width: `${v}%`, background: color, transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: 10, fontWeight: 700, color }}>{v}%</span>
    </div>
  )
}

function StatusBadge({ status }) {
  const map = {
    Active:    { bg: 'rgba(16,185,129,0.12)',  border: 'rgba(16,185,129,0.25)',  color: '#6ee7b7' },
    'At Risk': { bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.25)',  color: '#fbbf24' },
    Missing:   { bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.25)',   color: '#fca5a5' },
    Lost:      { bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.25)',   color: '#fca5a5' },
  }
  const s = map[status] || map.Active
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
      background: s.bg, border: `1px solid ${s.border}`, color: s.color,
      letterSpacing: '0.04em', whiteSpace: 'nowrap',
    }}>{status}</span>
  )
}

export default function Locators() {
  const { isAdmin } = useAuth()
  const navigate = useNavigate()
  const { bindDevice, adminAssignDeviceToUser, unbindDevice, getAvailableDevices } = useCityTag()
  const { devices: cacheDevices, refresh: refreshDeviceCache } = useDeviceCache()
  const { users } = useUserCache()

  // ── Server-side search / filter / pagination ──────────────────────────────
  const [rawQuery, setRawQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [statusF, setStatusF]   = useState('All')
  const debounceRef = useRef(null)

  // Debounce search input → 350 ms
  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedQuery(rawQuery), 350)
    return () => clearTimeout(debounceRef.current)
  }, [rawQuery])

  // Map UI status tabs → backend values
  const serverStatus = statusF === 'All' ? 'all' : statusF === 'Active' ? 'online' : 'offline'

  const {
    devices: locators, page, totalPages, total, loading,
    hasNextPage, hasPreviousPage, goToPage, refresh: refreshList,
  } = usePaginatedDevices(20, {
    search: debouncedQuery,
    status: serverStatus,
    device_type: 'locator',
  })

  // Refresh both the list and DeviceCache (used for bind modal unbound devices)
  const refreshDevices = useCallback(() => {
    refreshList()
    refreshDeviceCache()
  }, [refreshList, refreshDeviceCache])

  // Bind modal
  const [availableDevices, setAvailableDevices] = useState([])
  const [showBindModal, setShowBindModal]       = useState(false)
  const [bindSn, setBindSn]                     = useState('')
  const [bindName, setBindName]                 = useState('')
  const [bindClient, setBindClient]             = useState('')
  const [bindCategory, setBindCategory]         = useState('')
  const [bindUserId, setBindUserId]             = useState('')
  const [bindLoading, setBindLoading]           = useState(false)
  const [bindError, setBindError]               = useState('')

  // Delete confirm modal
  const [deleteTarget, setDeleteTarget]   = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  useEffect(() => {
    if (!isAdmin) {
      getAvailableDevices().then(setAvailableDevices).catch(() => setAvailableDevices([]))
    }
  }, [isAdmin, getAvailableDevices])

  const unboundDevices = (cacheDevices || []).filter(d => !d.assigned_user_name && !d.user_id)

  const openBindModal = (sn = '') => {
    setBindError(''); setBindClient(''); setBindName(''); setBindCategory('')
    if (isAdmin) {
      setBindSn(sn || (unboundDevices.length > 0 ? unboundDevices[0].sn : ''))
      setBindUserId(users?.length > 0 ? users[0].id : '')
    } else {
      setBindSn(sn || '')
    }
    setShowBindModal(true)
  }

  const closeBindModal = () => {
    setShowBindModal(false)
    setBindSn(''); setBindName(''); setBindClient(''); setBindCategory(''); setBindUserId(''); setBindError('')
  }

  const handleBind = async () => {
    if (isAdmin) {
      if (!bindSn || !bindUserId || !bindCategory) {
        setBindError('Please select a device, a user, and a category'); return
      }
      setBindError(''); setBindLoading(true)
      try {
        await adminAssignDeviceToUser(bindUserId, bindSn, { name: bindName.trim(), client: bindClient.trim(), category: bindCategory })
        refreshDevices(); closeBindModal()
      } catch (err) { setBindError(err.message || 'Failed to bind locator') }
      finally { setBindLoading(false) }
    } else {
      if (!bindSn.trim() || !bindCategory) {
        setBindError('Please select a locator and a category'); return
      }
      setBindError(''); setBindLoading(true)
      try {
        await bindDevice({ sn: bindSn.trim(), label: bindName.trim() || undefined, category: bindCategory })
        refreshDevices()
        getAvailableDevices().then(setAvailableDevices).catch(() => {})
        closeBindModal()
      } catch (err) { setBindError(err.message || 'Failed to bind locator') }
      finally { setBindLoading(false) }
    }
  }

  const handleUnbind = async (sn, e) => {
    e.stopPropagation()
    if (isAdmin) {
      const device = [...(cacheDevices || []), ...(locators || [])].find(d => d.sn === sn)
      setDeleteTarget(device || { sn })
    } else {
      if (!window.confirm(`Remove binding for ${sn}?`)) return
      try { await unbindDevice(sn); refreshDevices() } catch {}
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleteLoading(true)
    try { await unbindDevice(deleteTarget.sn); refreshDevices(); setDeleteTarget(null) } catch {}
    finally { setDeleteLoading(false) }
  }

  // Map API device shape → display shape (same fields as deviceToLocator in App.jsx)
  const locatorRows = useMemo(() => (locators || []).map(d => {
    const lastSeen = d.dataRetrievalTime || null
    const hoursAgo = lastSeen ? (Date.now() - new Date(lastSeen).getTime()) / 3600000 : 99
    let status = 'Active'
    if ((d.status || '') === 'offline' && hoursAgo > 24) status = 'Missing'
    else if ((d.status || '') === 'offline' && hoursAgo > 12) status = 'At Risk'
    return {
      id: d.sn || d.local_id,
      userName: d.assigned_user_name || d.name || d.sn || '—',
      category: d.category || '',
      company:  d.client || '',
      status,
      hoursAgo,
      battery:  typeof d.battery === 'number' ? d.battery : null,
      lastLocation: d.lastLocation || '',
      bindTime: d.bindTime,
      fence_zone_ids: d.fence_zone_ids || [],
      detections: d.detections ?? 0,
    }
  }), [locators])

  const inputStyle = {
    width: '100%', padding: '10px 12px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 8, color: '#f4f4f5', fontSize: 13,
    outline: 'none', boxSizing: 'border-box',
  }

  const filterTabActive  = { background: '#A72C32', color: '#fff', border: 'none' }
  const filterTabDefault = { background: 'transparent', color: 'rgba(255,255,255,0.45)', border: 'none' }
  const filterTabWrap    = { display: 'flex', gap: 3, padding: 4, background: 'rgba(255,255,255,0.04)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.07)' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '4px 0' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            padding: 9, background: 'rgba(167,44,50,0.14)', borderRadius: 12,
            border: '1px solid rgba(167,44,50,0.24)', display: 'flex',
          }}>
            <Radio style={{ width: 18, height: 18, color: '#C86068' }} />
          </div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#FFFFFF', margin: 0, letterSpacing: '-0.03em' }}>BLE Locators</h1>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.36)', margin: '3px 0 0' }}>
              Personal &amp; asset tracking devices — click any to view details
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {[
            { k: total,  l: 'Total',  c: 'rgba(255,255,255,0.70)' },
          ].map(s => (
            <div key={s.l} style={{ ...panel, padding: '8px 14px', textAlign: 'center', minWidth: 52 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: s.c, lineHeight: 1 }}>{s.k}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 3 }}>{s.l}</div>
            </div>
          ))}

          <button
            onClick={() => openBindModal()}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '10px 18px', borderRadius: 10, cursor: 'pointer',
              background: 'linear-gradient(135deg, #BF3840 0%, #8B2328 100%)',
              border: '1px solid rgba(167,44,50,0.45)',
              color: '#fff', fontSize: 13, fontWeight: 700,
              boxShadow: '0 4px 14px rgba(167,44,50,0.28)',
              transition: 'box-shadow 0.2s, transform 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 0 44px rgba(167,44,50,0.52), 0 6px 22px rgba(0,0,0,0.40)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 4px 14px rgba(167,44,50,0.28)'; e.currentTarget.style.transform = 'translateY(0)' }}
          >
            <Plus style={{ width: 14, height: 14 }} />
            Bind Device
          </button>
        </div>
      </div>

      {/* ── Filters ────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
        <div style={{ position: 'relative' }}>
          <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: 'rgba(255,255,255,0.32)' }} />
          <input
            value={rawQuery}
            onChange={e => setRawQuery(e.target.value)}
            placeholder="Search devices…"
            style={{
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 10, padding: '8px 12px 8px 32px', fontSize: 12,
              color: 'rgba(255,255,255,0.70)', outline: 'none', width: 176,
            }}
          />
        </div>

        <div style={filterTabWrap}>
          {['All', 'Active', 'Offline'].map(s => (
            <button key={s} onClick={() => setStatusF(s)}
              style={{ padding: '5px 11px', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s', ...(statusF === s ? { background: 'rgba(36,44,61,0.80)', color: '#94A3B8', border: '1px solid #242C3D' } : filterTabDefault) }}>
              {s}
            </button>
          ))}
        </div>

        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'rgba(255,255,255,0.28)' }}>
          {loading ? 'Loading…' : `${total} device${total !== 1 ? 's' : ''}`}
        </span>
      </div>

      {/* ── Device grid ────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
        {loading && locatorRows.length === 0 && (
          <div style={{ gridColumn: '1 / -1', ...panel, padding: '60px 22px', textAlign: 'center', color: 'rgba(255,255,255,0.26)', fontSize: 13 }}>
            Loading locators…
          </div>
        )}
        {locatorRows.map(loc => {
          const CatIcon = catIcon(loc.category)
          const isLost  = loc.status === 'Lost' || loc.status === 'Missing'
          const hAgo    = loc.hoursAgo ?? 0
          const timeStr = hAgo < 1 ? `${Math.round(hAgo * 60)}m ago` : `${hAgo.toFixed(1)}h ago`
          return (
            <div
              key={loc.id}
              onClick={() => navigate(`/locators/${loc.id}`)}
              style={{
                ...panel,
                padding: 16,
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                transition: 'box-shadow 0.22s ease, transform 0.22s ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.boxShadow = '0 0 44px rgba(167,44,50,0.52), 0 12px 40px rgba(0,0,0,0.55)'
                e.currentTarget.style.transform = 'translateY(-2px)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.boxShadow = panel.boxShadow
                e.currentTarget.style.transform = 'translateY(0)'
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#FFFFFF', letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {loc.userName}
                </div>
                <div style={{ fontSize: 10, color: '#57657A', fontFamily: 'monospace', marginTop: 3 }}>
                  {loc.id}
                </div>
              </div>
              <ChevronRight style={{ width: 14, height: 14, color: 'rgba(255,255,255,0.18)', flexShrink: 0 }} />
              {isAdmin && (
                <button
                  onClick={e => handleUnbind(loc.id, e)}
                  style={{
                    flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4,
                    fontSize: 10, color: '#fff',
                    background: '#A72C32', border: '1px solid rgba(167,44,50,0.60)',
                    borderRadius: 6, padding: '3px 8px', cursor: 'pointer', transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#8B2328' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#A72C32' }}
                >
                  <Trash2 style={{ width: 10, height: 10 }} /> Unbind
                </button>
              )}
            </div>
          )
        })}

        {!loading && locatorRows.length === 0 && (
          <div style={{ gridColumn: '1 / -1', ...panel, padding: '60px 22px', textAlign: 'center', color: 'rgba(255,255,255,0.26)', fontSize: 13 }}>
            No locators match your filters
          </div>
        )}
      </div>

      {/* ── Pagination (server-side) ─────────────────────────────────────────── */}
      {total > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, padding: '4px 2px' }}>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)', marginRight: 4 }}>
            {(page - 1) * 20 + 1}–{Math.min(page * 20, total)} of {total} device{total !== 1 ? 's' : ''}
          </span>
          <div style={{ display: 'flex', gap: 4 }}>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              const p = totalPages <= 7 ? i + 1 : (page < 4 ? i + 1 : page - 3 + i)
              if (p > totalPages) return null
              return (
                <button key={p} onClick={() => goToPage(p)}
                  style={{
                    width: 26, height: 26, borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    background: p === page ? '#A72C32' : 'rgba(255,255,255,0.05)',
                    border: p === page ? '1px solid #A72C32' : '1px solid rgba(255,255,255,0.08)',
                    color: p === page ? '#fff' : 'rgba(255,255,255,0.45)',
                    transition: 'all 0.15s',
                  }}>
                  {p}
                </button>
              )
            })}
          </div>

          <button
            onClick={() => goToPage(page - 1)}
            disabled={!hasPreviousPage}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: !hasPreviousPage ? 'not-allowed' : 'pointer',
              background: !hasPreviousPage ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.10)',
              color: !hasPreviousPage ? 'rgba(255,255,255,0.20)' : 'rgba(255,255,255,0.65)',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { if (hasPreviousPage) { e.currentTarget.style.background = 'rgba(167,44,50,0.18)'; e.currentTarget.style.borderColor = 'rgba(167,44,50,0.40)'; e.currentTarget.style.color = '#fca5a5' }}}
            onMouseLeave={e => { e.currentTarget.style.background = !hasPreviousPage ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)'; e.currentTarget.style.color = !hasPreviousPage ? 'rgba(255,255,255,0.20)' : 'rgba(255,255,255,0.65)' }}
          >
            ← Prev
          </button>

          <button
            onClick={() => goToPage(page + 1)}
            disabled={!hasNextPage}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: !hasNextPage ? 'not-allowed' : 'pointer',
              background: !hasNextPage ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.10)',
              color: !hasNextPage ? 'rgba(255,255,255,0.20)' : 'rgba(255,255,255,0.65)',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { if (hasNextPage) { e.currentTarget.style.background = 'rgba(167,44,50,0.18)'; e.currentTarget.style.borderColor = 'rgba(167,44,50,0.40)'; e.currentTarget.style.color = '#fca5a5' }}}
            onMouseLeave={e => { e.currentTarget.style.background = !hasNextPage ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)'; e.currentTarget.style.color = !hasNextPage ? 'rgba(255,255,255,0.20)' : 'rgba(255,255,255,0.65)' }}
          >
            Next →
          </button>
        </div>
      )}

      {/* ── Bind Modal ───────────────────────────────────────────────────────── */}
      {showBindModal && (
        <div
          onClick={closeBindModal}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.74)',
            backdropFilter: 'blur(5px)', WebkitBackdropFilter: 'blur(5px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, padding: 20,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#18181b', border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: 16, width: '100%', maxWidth: 440,
              boxShadow: '0 24px 64px rgba(0,0,0,0.72)',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ padding: 7, background: 'rgba(167,44,50,0.14)', borderRadius: 8, border: '1px solid rgba(167,44,50,0.24)', display: 'flex' }}>
                  <Link2 style={{ width: 14, height: 14, color: '#C86068' }} />
                </div>
                <span style={{ fontSize: 15, fontWeight: 700, color: '#FFFFFF' }}>Bind Locator</span>
              </div>
              <button onClick={closeBindModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.38)', padding: 4, display: 'flex', borderRadius: 6 }}>
                <X style={{ width: 16, height: 16 }} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {bindError && (
                <div style={{ padding: '8px 12px', background: 'rgba(127,29,29,0.20)', border: '1px solid rgba(127,29,29,0.40)', borderRadius: 6, color: '#fca5a5', fontSize: 12 }}>
                  {bindError}
                </div>
              )}

              {isAdmin ? (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.58)' }}>
                      Serial Number <span style={{ color: '#C86068' }}>*</span>
                    </label>
                    {unboundDevices.length === 0
                      ? <p style={{ color: 'rgba(255,255,255,0.32)', fontSize: 12, margin: 0 }}>No unbound locators available</p>
                      : (
                        <select value={bindSn} onChange={e => setBindSn(e.target.value)} style={SELECT_STYLE}>
                          {unboundDevices.map(d => (
                            <option key={d.sn} value={d.sn} style={SELECT_OPT}>
                              {d.sn}{d.client ? ` — ${d.client}` : ' — No client'}
                            </option>
                          ))}
                        </select>
                      )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.58)' }}>
                      Assign to User <span style={{ color: '#C86068' }}>*</span>
                    </label>
                    {(!users || users.length === 0)
                      ? <p style={{ color: 'rgba(255,255,255,0.32)', fontSize: 12, margin: 0 }}>No users available</p>
                      : (
                        <select value={bindUserId} onChange={e => setBindUserId(e.target.value)} style={SELECT_STYLE}>
                          {users.map(u => (
                            <option key={u.id} value={u.id} style={SELECT_OPT}>
                              {u.email}{u.name ? ` (${u.name})` : ''}
                            </option>
                          ))}
                        </select>
                      )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.58)' }}>
                      Locator Name <span style={{ fontWeight: 400, color: 'rgba(255,255,255,0.28)' }}>(optional)</span>
                    </label>
                    <input type="text" placeholder="e.g. My Car, Office Van…" value={bindName} onChange={e => setBindName(e.target.value)} style={inputStyle} />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.58)' }}>
                      Category <span style={{ color: '#C86068' }}>*</span>
                    </label>
                    <select value={bindCategory} onChange={e => setBindCategory(e.target.value)} style={SELECT_STYLE}>
                      <option value="" disabled style={SELECT_OPT}>— Select category —</option>
                      {BIND_CATS.map(c => (
                        <option key={c} value={c} style={SELECT_OPT}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.58)' }}>
                      Client <span style={{ fontWeight: 400, color: 'rgba(255,255,255,0.28)' }}>(optional)</span>
                    </label>
                    <input type="text" placeholder="e.g. TPL Trakker" value={bindClient} onChange={e => setBindClient(e.target.value)} style={inputStyle} />
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.58)' }}>
                      Locator Serial Number <span style={{ color: '#C86068' }}>*</span>
                    </label>
                    <input
                      type="text"
                      list="bind-sn-datalist"
                      placeholder="Type or select a serial number…"
                      value={bindSn}
                      onChange={e => setBindSn(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleBind()}
                      autoFocus
                      autoComplete="off"
                      style={{ ...inputStyle, border: `1px solid ${bindError ? 'rgba(127,29,29,0.60)' : 'rgba(255,255,255,0.08)'}` }}
                    />
                    <datalist id="bind-sn-datalist">
                      {availableDevices.map(d => (
                        <option key={d.sn} value={d.sn}>{d.name || d.client || ''}</option>
                      ))}
                    </datalist>
                    <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.26)' }}>
                      {availableDevices.length > 0
                        ? `${availableDevices.length} locator${availableDevices.length !== 1 ? 's' : ''} available — click to browse or type to search`
                        : 'Enter the serial number printed on your locator.'}
                    </p>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.58)' }}>
                      Locator Name <span style={{ fontWeight: 400, color: 'rgba(255,255,255,0.28)' }}>(optional)</span>
                    </label>
                    <input
                      type="text" placeholder="e.g. My Car, Office Van…"
                      value={bindName} onChange={e => setBindName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleBind()}
                      style={inputStyle}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.58)' }}>
                      Category <span style={{ color: '#C86068' }}>*</span>
                    </label>
                    <select value={bindCategory} onChange={e => setBindCategory(e.target.value)} style={SELECT_STYLE}>
                      <option value="" disabled style={SELECT_OPT}>— Select category —</option>
                      {BIND_CATS.map(c => (
                        <option key={c} value={c} style={SELECT_OPT}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '14px 22px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
              <button
                onClick={closeBindModal}
                style={{ padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.68)' }}
              >Cancel</button>
              <button
                onClick={handleBind}
                disabled={bindLoading || (isAdmin ? (!bindSn || !bindUserId || !bindCategory) : (!bindSn.trim() || !bindCategory))}
                style={{
                  padding: '9px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                  cursor: (bindLoading || (isAdmin ? !bindSn || !bindUserId || !bindCategory : !bindSn.trim() || !bindCategory)) ? 'not-allowed' : 'pointer',
                  background: 'linear-gradient(135deg, #A72C32 0%, #8B2328 100%)',
                  border: '1px solid rgba(167,44,50,0.40)', color: '#fff',
                  opacity: (bindLoading || (isAdmin ? (!bindSn || !bindUserId || !bindCategory) : (!bindSn.trim() || !bindCategory))) ? 0.50 : 1,
                  transition: 'opacity 0.15s',
                }}
              >{bindLoading ? 'Saving…' : 'Bind Locator'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Modal ──────────────────────────────────────────────── */}
      {deleteTarget && (
        <div
          onClick={() => !deleteLoading && setDeleteTarget(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.74)',
            backdropFilter: 'blur(5px)', WebkitBackdropFilter: 'blur(5px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, padding: 20,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#18181b', border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: 16, width: '100%', maxWidth: 380, padding: 22,
              boxShadow: '0 24px 64px rgba(0,0,0,0.72)',
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 700, color: '#FFFFFF', marginBottom: 8 }}>Unbind Locator</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.52)', marginBottom: 20 }}>
              Remove binding for{' '}
              <span style={{ color: '#FFFFFF', fontFamily: 'monospace' }}>{deleteTarget.sn}</span>
              {deleteTarget.assigned_user_name ? ` from ${deleteTarget.assigned_user_name}` : ''}?{' '}
              This cannot be undone.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleteLoading}
                style={{ padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.68)' }}
              >Cancel</button>
              <button
                onClick={confirmDelete}
                disabled={deleteLoading}
                style={{
                  padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                  cursor: deleteLoading ? 'not-allowed' : 'pointer',
                  background: 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%)',
                  border: '1px solid rgba(127,29,29,0.40)', color: '#fca5a5',
                  opacity: deleteLoading ? 0.55 : 1,
                }}
              >{deleteLoading ? 'Removing…' : 'Unbind'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
