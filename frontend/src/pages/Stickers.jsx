import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import {
  Tag, Search, Package, ChevronRight,
  Plus, X, Link2, Trash2,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useCityTag } from '../hooks/useCityTag.js'
import { useDeviceCache } from '../context/DeviceCacheContext.jsx'
import { useUserCache } from '../context/Usercachecontext.jsx'
import { usePaginatedDevices } from '../hooks/usePaginatedDevices.js'
import { deviceDisplayName } from '../utils/deviceDisplayName.js'
import { ThemeContext } from '../components/layout/Layout.jsx'
import ModalPortal from '../components/common/ModalPortal.jsx'
import TPLLoader from '../components/TPLLoader.jsx'

/* ── Modal keeps dark styling ALWAYS (overlay UI) ────────────────────── */
const modalPanel = {
  background: '#000000',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 16,
  boxShadow: '0 24px 64px rgba(0,0,0,0.72)',
}

// Full-viewport overlay: scrollable so tall modals are never clipped at the top.
const modalOverlay = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
  backdropFilter: 'blur(5px)', WebkitBackdropFilter: 'blur(5px)',
  display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
  zIndex: 9999, padding: 24, overflowY: 'auto',
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

const PAGE_SIZE = 20

const STATUSES = ['All', 'Active', 'At Risk', 'Missing']
const CATS     = ['All', 'Pallet', 'Carton', 'Container', 'Asset', 'Other']

const BIND_CATS = [
  'pallet', 'carton', 'container', 'asset', 'luggage', 'bag',
  'parcel', 'equipment', 'vehicle', 'other',
]

function BattBar({ v, isLight }) {
  if (v == null || v === 0) return null
  const color = v > 40 ? '#059669' : v > 20 ? '#D97706' : '#DC2626'
  const trackBg = isLight ? '#CACACA' : 'rgba(255,255,255,0.08)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 44, height: 4, borderRadius: 3, background: trackBg }}>
        <div style={{ height: 4, borderRadius: 3, width: `${v}%`, background: color, transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: 10, fontWeight: 700, color }}>{v}%</span>
    </div>
  )
}

function StatusBadge({ status, isLight }) {
  const mapLight = {
    Active:    { bg: '#ECFDF5', border: '#A7F3D0', color: '#059669' },
    'At Risk': { bg: '#FFFBEB', border: '#FDE68A', color: '#D97706' },
    Missing:   { bg: '#FEF2F2', border: '#FECACA', color: '#DC2626' },
    Lost:      { bg: '#FEF2F2', border: '#FECACA', color: '#DC2626' },
  }
  const mapDark = {
    Active:    { bg: 'rgba(16,185,129,0.12)',  border: 'rgba(16,185,129,0.25)',  color: '#6ee7b7' },
    'At Risk': { bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.25)',  color: '#fbbf24' },
    Missing:   { bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.25)',   color: '#fca5a5' },
    Lost:      { bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.25)',   color: '#fca5a5' },
  }
  const map = isLight ? mapLight : mapDark
  const s = map[status] || (isLight ? mapLight.Active : mapDark.Active)
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
      background: s.bg, border: `1px solid ${s.border}`, color: s.color,
      letterSpacing: '0.04em', whiteSpace: 'nowrap',
    }}>{status}</span>
  )
}

export default function Stickers() {
  const { isAdmin } = useAuth()
  const navigate  = useNavigate()
  const { bindDevice, adminAssignDeviceToUser, unbindDevice, getAvailableDevices } = useCityTag()
  const { devices: cacheDevices, refresh: refreshDeviceCache } = useDeviceCache()
  const { users } = useUserCache()

  const pageTheme = React.useContext(ThemeContext)
  const isLight   = pageTheme === 'light'

  // ── Theme tokens ──────────────────────────────────────────────────────────
  const panel = isLight
    ? { background: 'linear-gradient(145deg, #FFFFFF 0%, #F0F0F0 50%, #DCDCDC 100%)', border: '1px solid #C9C9C9', borderRadius: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.06)' }
    : { background: '#242323', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '18px', boxShadow: '0 8px 32px rgba(0,0,0,0.45)' }

  const T = {
    txt1:        isLight ? '#111827' : '#f4f4f5',
    txt2:        isLight ? '#6B7280' : 'rgba(255,255,255,0.50)',
    txt3:        isLight ? '#9CA3AF' : 'rgba(255,255,255,0.32)',
    inputBg:     isLight ? '#FFFFFF' : 'rgba(255,255,255,0.05)',
    inputBorder: isLight ? '#C9C9C9' : 'rgba(255,255,255,0.10)',
    tabBg:       isLight ? '#DCDCDC' : 'rgba(255,255,255,0.05)',
    tabBorder:   isLight ? '#C9C9C9' : 'rgba(255,255,255,0.08)',
    redBg:       isLight ? '#FEF2F2' : 'rgba(220,38,38,0.12)',
    redBorder:   isLight ? '#FECACA' : 'rgba(220,38,38,0.22)',
    unbindBg:    isLight ? '#FEF2F2' : 'rgba(220,38,38,0.10)',
    unbindBorder: isLight ? '#FECACA' : 'rgba(220,38,38,0.20)',
    paginBg:     isLight ? '#ECECEC' : 'rgba(255,255,255,0.05)',
    paginBorder: isLight ? '#C9C9C9' : 'rgba(255,255,255,0.08)',
    paginColor:  isLight ? '#374151' : 'rgba(255,255,255,0.68)',
    paginDisabled: isLight ? '#D1D5DB' : 'rgba(255,255,255,0.20)',
  }

  const [rawQuery,  setRawQuery]  = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [statusF,   setStatusF]   = useState('All')
  const debounceRef = useRef(null)

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedQuery(rawQuery), 350)
    return () => clearTimeout(debounceRef.current)
  }, [rawQuery])

  const serverStatus = statusF === 'All' ? 'all' : statusF === 'Active' ? 'online' : 'offline'

  const {
    devices: stickers, page, totalPages, total, loading,
    hasNextPage, hasPreviousPage, goToPage, refresh: refreshList,
  } = usePaginatedDevices(20, {
    search: debouncedQuery,
    status: serverStatus,
    device_type: 'sticker',
    search_scope: 'sn_name',
  })

  const refreshDevices = useCallback(() => {
    refreshList()
    refreshDeviceCache()
  }, [refreshList, refreshDeviceCache])

  /* ── Bind modal state ──────────────────────────────────────────────── */
  const [availableDevices, setAvailableDevices] = useState([])
  const [showBindModal,    setShowBindModal]     = useState(false)
  const [bindSn,           setBindSn]            = useState('')
  const [bindName,         setBindName]          = useState('')
  const [bindClient,       setBindClient]        = useState('')
  const [bindCategory,     setBindCategory]      = useState('')
  const [bindUserId,       setBindUserId]        = useState('')
  const [bindLoading,      setBindLoading]       = useState(false)
  const [bindError,        setBindError]         = useState('')

  /* ── Delete confirm state ──────────────────────────────────────────── */
  const [deleteTarget,  setDeleteTarget]  = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  useEffect(() => {
    if (!isAdmin) {
      getAvailableDevices()
        .then(list => setAvailableDevices((list || []).filter(d => /^\d+$/.test(String(d.sn ?? '')))))
        .catch(() => setAvailableDevices([]))
    }
  }, [isAdmin, getAvailableDevices])

  const unboundStickers = (cacheDevices || []).filter(d =>
    /^\d+$/.test(String(d.sn ?? '')) && !d.assigned_user_name && !d.user_id
  )

  const openBindModal = (sn = '') => {
    setBindError(''); setBindClient(''); setBindName(''); setBindCategory('')
    if (isAdmin) {
      setBindSn(sn || (unboundStickers.length > 0 ? unboundStickers[0].sn : ''))
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
    // 5.1 — best-effort client guard against duplicate names among loaded devices.
    const trimmedName = bindName.trim()
    if (trimmedName) {
      const dup = [...(cacheDevices || []), ...(stickers || [])].find(
        d => d.sn !== bindSn && (d.name || '').trim().toLowerCase() === trimmedName.toLowerCase()
      )
      if (dup) { setBindError(`A device named "${trimmedName}" already exists. Names must be unique.`); return }
    }
    if (isAdmin) {
      if (!bindSn || !bindUserId || !bindCategory) {
        setBindError('Please select a sticker, a user, and a category'); return
      }
      setBindError(''); setBindLoading(true)
      try {
        await adminAssignDeviceToUser(bindUserId, bindSn, { name: bindName.trim(), client: bindClient.trim(), category: bindCategory })
        refreshDevices(); closeBindModal()
      } catch (err) { setBindError(err.message || 'Failed to bind sticker') }
      finally { setBindLoading(false) }
    } else {
      if (!bindSn.trim() || !bindCategory) {
        setBindError('Please select a sticker and a category'); return
      }
      setBindError(''); setBindLoading(true)
      try {
        await bindDevice({ sn: bindSn.trim(), label: bindName.trim() || undefined, category: bindCategory })
        refreshDevices()
        getAvailableDevices()
          .then(list => setAvailableDevices((list || []).filter(d => /^\d+$/.test(String(d.sn ?? '')))))
          .catch(() => {})
        closeBindModal()
      } catch (err) { setBindError(err.message || 'Failed to bind sticker') }
      finally { setBindLoading(false) }
    }
  }

  const handleUnbind = async (sn, e) => {
    e.stopPropagation()
    if (isAdmin) {
      const device = [...(cacheDevices || []), ...(stickers || [])].find(d => d.sn === sn)
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

  /* ── Map API shape → display rows ─────────────────────────────── */
  const stickerRows = useMemo(() => (stickers || []).map(d => {
    const lastSeen = d.dataRetrievalTime || null
    const hoursAgo = lastSeen ? (Date.now() - new Date(lastSeen).getTime()) / 3600000 : 99
    let status = 'Active'
    if ((d.status || '') === 'offline' && hoursAgo > 24) status = 'Missing'
    else if ((d.status || '') === 'offline' && hoursAgo > 12) status = 'At Risk'
    return {
      id: d.sn || d.local_id,
      displayName: deviceDisplayName(d),
      category: d.category || '',
      company:  d.client || '',
      status,
      hoursAgo,
      battery: typeof d.battery === 'number' ? d.battery : null,
      lastLocation: d.lastLocation || '',
      bindTime: d.bindTime,
      fence_zone_ids: d.fence_zone_ids || [],
      detections: d.detections ?? 0,
    }
  }), [stickers])

  // Dark modal input style
  const inputStyle = {
    width: '100%', padding: '10px 12px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 8, color: '#f4f4f5', fontSize: 13,
    outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '4px 0' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: isLight ? 12 : 10 }}>
          {isLight ? (
            <div style={{ width: 44, height: 44, borderRadius: 12, background: '#A72C32', border: '1px solid #8B2328', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Tag style={{ width: 20, height: 20, color: '#000000' }} />
            </div>
          ) : (
            <div style={{ padding: 9, background: 'rgba(167,44,50,0.14)', borderRadius: 12, border: '1px solid rgba(167,44,50,0.24)', display: 'flex' }}>
              <Tag style={{ width: 18, height: 18, color: '#C86068' }} />
            </div>
          )}
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: T.txt1, margin: 0, letterSpacing: isLight ? '-0.02em' : '-0.03em' }}>Smart Stickers</h1>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {isLight ? (
            <button
              onClick={() => openBindModal()}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '10px 18px', borderRadius: 10, cursor: 'pointer',
                background: '#A72C32', border: '1px solid #8B2328',
                color: '#fff', fontSize: 13, fontWeight: 700,
                boxShadow: '0 2px 8px rgba(167,44,50,0.25)',
                transition: 'background 0.15s, box-shadow 0.15s, transform 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#8B2328'; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(167,44,50,0.35)' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#A72C32'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(167,44,50,0.25)' }}
            >
              <Plus style={{ width: 15, height: 15 }} />
              Bind Sticker
            </button>
          ) : (
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
              Bind Sticker
            </button>
          )}
        </div>
      </div>

      {/* ── Filters ────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
        <div style={{ position: 'relative' }}>
          <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: T.txt3 }} />
          <input
            value={rawQuery}
            onChange={e => setRawQuery(e.target.value)}
            placeholder="Search by SN or sticker name…"
            style={{
              background: T.inputBg, border: `1px solid ${T.inputBorder}`,
              borderRadius: 10, padding: '8px 12px 8px 32px', fontSize: 12,
              color: isLight ? '#111827' : 'rgba(255,255,255,0.70)', outline: 'none', width: 200,
              boxShadow: isLight ? '0 1px 2px rgba(0,0,0,0.04)' : 'none',
            }}
            onFocus={e => { if (isLight) { e.target.style.borderColor = '#DC2626'; e.target.style.boxShadow = '0 0 0 3px rgba(220,38,38,0.08)' } }}
            onBlur={e  => { if (isLight) { e.target.style.borderColor = T.inputBorder; e.target.style.boxShadow = '0 1px 2px rgba(0,0,0,0.04)' } }}
          />
        </div>

        <div style={{ display: 'flex', gap: 3, padding: 4, background: T.tabBg, border: `1px solid ${T.tabBorder}`, borderRadius: 10 }}>
          {['All', 'Active', 'Offline'].map(s => {
            const active = statusF === s
            const activeStyle = { background: '#A72C32', color: '#fff', border: 'none' }
            const defaultStyle = { background: 'transparent', color: T.txt2, border: 'none' }
            return (
              <button key={s} onClick={() => setStatusF(s)}
                style={{ padding: isLight ? '5px 12px' : '5px 11px', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
                  ...(active ? activeStyle : defaultStyle) }}>
                {s}
              </button>
            )
          })}
        </div>

        <span style={{ marginLeft: 'auto', fontSize: 11, color: isLight ? '#333333' : T.txt3, fontWeight: isLight ? 500 : 400 }}>
          {loading ? 'Loading…' : `${total} sticker${total !== 1 ? 's' : ''}`}
        </span>
      </div>

      {/* ── Card grid ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: isLight ? 12 : 14 }}>
        {loading && stickerRows.length === 0 && (
          <div style={{ gridColumn: '1 / -1' }}>
            <TPLLoader label="Loading stickers…" />
          </div>
        )}

        {/* LIGHT — same single-row structure as dark, light colors */}
        {isLight && stickerRows.map(s => (
          <div
            key={s.id}
            onClick={() => navigate(`/stickers/${s.id}`)}
            style={{
              ...panel, borderLeft: '3px solid #A72C32', padding: 16, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              transition: 'box-shadow 0.2s ease, transform 0.2s ease, border-color 0.2s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.boxShadow = '0 4px 16px rgba(167,44,50,0.14), 0 12px 32px rgba(0,0,0,0.08)'
              e.currentTarget.style.transform = 'translateY(-2px)'
              e.currentTarget.style.borderColor = '#A72C32'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.boxShadow = panel.boxShadow
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.borderColor = '#C9C9C9'
              e.currentTarget.style.borderLeftColor = '#A72C32'
            }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', fontFamily: 'monospace', letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.id}
              </div>
              <div style={{ fontSize: 11, color: '#6B7280', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.displayName}
              </div>
            </div>
            <ChevronRight style={{ width: 14, height: 14, color: '#9CA3AF', flexShrink: 0 }} />
            {isAdmin && (
              <button
                onClick={e => handleUnbind(s.id, e)}
                style={{
                  flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4,
                  fontSize: 10, color: '#FFFFFF',
                  background: '#A72C32', border: '1px solid #8B2328',
                  borderRadius: 6, padding: '3px 8px', cursor: 'pointer', transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#8B2328' }}
                onMouseLeave={e => { e.currentTarget.style.background = '#A72C32' }}
              >
                <Trash2 style={{ width: 10, height: 10 }} /> Unbind
              </button>
            )}
          </div>
        ))}

        {/* DARK — original simple row card */}
        {!isLight && stickerRows.map(s => (
          <div
            key={s.id}
            onClick={() => navigate(`/stickers/${s.id}`)}
            style={{
              ...panel, padding: 16, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              transition: 'box-shadow 0.22s ease, transform 0.22s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 0 44px rgba(167,44,50,0.40), 0 12px 40px rgba(0,0,0,0.55)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = panel.boxShadow; e.currentTarget.style.transform = 'translateY(0)' }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#FFFFFF', fontFamily: 'monospace', letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.id}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.42)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.displayName}
              </div>
            </div>
            <ChevronRight style={{ width: 14, height: 14, color: 'rgba(255,255,255,0.18)', flexShrink: 0 }} />
            {isAdmin && (
              <button
                onClick={e => handleUnbind(s.id, e)}
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
        ))}

        {!loading && stickerRows.length === 0 && (
          <div style={{ gridColumn: '1 / -1', ...panel, padding: '60px 22px', textAlign: 'center', color: T.txt3, fontSize: 13 }}>
            No stickers match your filters
          </div>
        )}
      </div>

      {/* ── Pagination (LIGHT) ─────────────────────────────────────────────── */}
      {total > 0 && isLight && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, padding: '4px 2px' }}>
          <span style={{ fontSize: 11, color: '#333333', marginRight: 6, fontWeight: 500 }}>
            {(page - 1) * 20 + 1}–{Math.min(page * 20, total)} of {total}
          </span>

          <button
            onClick={() => goToPage(page - 1)}
            disabled={!hasPreviousPage}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              cursor: !hasPreviousPage ? 'not-allowed' : 'pointer',
              background: T.paginBg, border: `1px solid ${T.paginBorder}`,
              color: !hasPreviousPage ? T.paginDisabled : T.paginColor,
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)', transition: 'all 0.15s',
            }}
            onMouseEnter={e => { if (hasPreviousPage) { e.currentTarget.style.borderColor = '#000000'; e.currentTarget.style.color = '#000000' }}}
            onMouseLeave={e => { e.currentTarget.style.borderColor = T.paginBorder; e.currentTarget.style.color = !hasPreviousPage ? T.paginDisabled : T.paginColor }}
          >
            ← Prev
          </button>

          <div style={{ display: 'flex', gap: 4 }}>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              const p = totalPages <= 7 ? i + 1 : (page < 4 ? i + 1 : page - 3 + i)
              if (p > totalPages) return null
              return (
                <button key={p} onClick={() => goToPage(p)}
                  style={{
                    width: 28, height: 28, borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    background: p === page ? '#000000' : T.paginBg,
                    border: p === page ? '1px solid #000000' : `1px solid ${T.paginBorder}`,
                    color: p === page ? '#FFFFFF' : T.paginColor,
                    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                    transition: 'all 0.15s',
                  }}>
                  {p}
                </button>
              )
            })}
          </div>

          <button
            onClick={() => goToPage(page + 1)}
            disabled={!hasNextPage}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              cursor: !hasNextPage ? 'not-allowed' : 'pointer',
              background: T.paginBg, border: `1px solid ${T.paginBorder}`,
              color: !hasNextPage ? T.paginDisabled : T.paginColor,
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)', transition: 'all 0.15s',
            }}
            onMouseEnter={e => { if (hasNextPage) { e.currentTarget.style.borderColor = '#000000'; e.currentTarget.style.color = '#000000' }}}
            onMouseLeave={e => { e.currentTarget.style.borderColor = T.paginBorder; e.currentTarget.style.color = !hasNextPage ? T.paginDisabled : T.paginColor }}
          >
            Next →
          </button>
        </div>
      )}

      {/* ── Pagination (DARK — original layout) ──────────────────────────────── */}
      {total > 0 && !isLight && (
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
                    background: p === page ? '#B7B2A8' : 'rgba(255,255,255,0.05)',
                    border: p === page ? '1px solid #B7B2A8' : '1px solid rgba(255,255,255,0.08)',
                    color: p === page ? '#000000' : 'rgba(255,255,255,0.45)',
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
            onMouseEnter={e => { if (hasPreviousPage) { e.currentTarget.style.background = 'rgba(183,178,168,0.18)'; e.currentTarget.style.borderColor = 'rgba(183,178,168,0.45)'; e.currentTarget.style.color = '#B7B2A8' }}}
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
            onMouseEnter={e => { if (hasNextPage) { e.currentTarget.style.background = 'rgba(183,178,168,0.18)'; e.currentTarget.style.borderColor = 'rgba(183,178,168,0.45)'; e.currentTarget.style.color = '#B7B2A8' }}}
            onMouseLeave={e => { e.currentTarget.style.background = !hasNextPage ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)'; e.currentTarget.style.color = !hasNextPage ? 'rgba(255,255,255,0.20)' : 'rgba(255,255,255,0.65)' }}
          >
            Next →
          </button>
        </div>
      )}

      {/* ── Bind Modal (ALWAYS dark overlay) ─────────────────────────────────────── */}
      {showBindModal && (
        <ModalPortal>
        <div onClick={closeBindModal} style={modalOverlay}>
          <div onClick={e => e.stopPropagation()} style={{ ...modalPanel, width: '100%', maxWidth: 440, margin: 'auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ padding: 7, background: 'rgba(167,44,50,0.14)', borderRadius: 8, border: '1px solid rgba(167,44,50,0.24)', display: 'flex' }}>
                  <Link2 style={{ width: 14, height: 14, color: '#C86068' }} />
                </div>
                <span style={{ fontSize: 15, fontWeight: 700, color: '#FFFFFF' }}>Bind Sticker</span>
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
                    {unboundStickers.length === 0
                      ? <p style={{ color: 'rgba(255,255,255,0.32)', fontSize: 12, margin: 0 }}>No unbound stickers available</p>
                      : (
                        <select value={bindSn} onChange={e => setBindSn(e.target.value)} style={SELECT_STYLE}>
                          {unboundStickers.map(d => (
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
                      Sticker Label <span style={{ fontWeight: 400, color: 'rgba(255,255,255,0.28)' }}>(optional)</span>
                    </label>
                    <input type="text" placeholder="e.g. Pallet A12, Shipment 001…" value={bindName} onChange={e => setBindName(e.target.value)} style={inputStyle} />
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
                      Sticker Serial Number <span style={{ color: '#C86068' }}>*</span>
                    </label>
                    <input
                      type="text"
                      list="bind-sticker-datalist"
                      placeholder="Type or select a serial number…"
                      value={bindSn}
                      onChange={e => setBindSn(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleBind()}
                      autoFocus
                      autoComplete="off"
                      style={{ ...inputStyle, border: `1px solid ${bindError ? 'rgba(127,29,29,0.60)' : 'rgba(255,255,255,0.08)'}` }}
                    />
                    <datalist id="bind-sticker-datalist">
                      {availableDevices.map(d => (
                        <option key={d.sn} value={d.sn}>{d.name || d.client || ''}</option>
                      ))}
                    </datalist>
                    <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.26)' }}>
                      {availableDevices.length > 0
                        ? `${availableDevices.length} sticker${availableDevices.length !== 1 ? 's' : ''} available — click to browse or type to search`
                        : 'Enter the serial number printed on your sticker.'}
                    </p>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.58)' }}>
                      Sticker Label <span style={{ fontWeight: 400, color: 'rgba(255,255,255,0.28)' }}>(optional)</span>
                    </label>
                    <input
                      type="text" placeholder="e.g. Pallet A12, Shipment 001…"
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
              >{bindLoading ? 'Saving…' : 'Bind Sticker'}</button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* ── Unbind Confirm Modal (ALWAYS dark) ──────────────────────────────── */}
      {deleteTarget && (
        <ModalPortal>
        <div onClick={() => !deleteLoading && setDeleteTarget(null)} style={modalOverlay}>
          <div
            onClick={e => e.stopPropagation()}
            style={{ ...modalPanel, width: '100%', maxWidth: 380, padding: 22, margin: 'auto' }}
          >
            <div style={{ fontSize: 15, fontWeight: 700, color: '#FFFFFF', marginBottom: 8 }}>Unbind Sticker</div>
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
        </ModalPortal>
      )}
    </div>
  )
}
