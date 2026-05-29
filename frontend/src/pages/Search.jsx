import React, { useState, useEffect, useRef } from 'react'
import { Search as SearchIcon, Radio, Tag, MapPin, Clock, Battery, ChevronRight, X, TrendingUp, Zap } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Badge from '../components/common/Badge.jsx'
import { usePaginatedDevices } from '../hooks/usePaginatedDevices.js'
import { ThemeContext } from '../components/layout/Layout.jsx'
import TPLLoader from '../components/TPLLoader.jsx'

const RECENT_KEY = 'tpl_recent_searches'
const MAX_RECENT  = 8

function loadRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') } catch { return [] }
}
function saveRecent(list) {
  localStorage.setItem(RECENT_KEY, JSON.stringify(list))
}

// Bold the portion of `name` that matches the typed query.
function highlightMatch(name, q, accent) {
  if (!q) return name
  const i = name.toLowerCase().indexOf(q.toLowerCase())
  if (i < 0) return name
  return (
    <>
      {name.slice(0, i)}
      <span style={{ color: accent, fontWeight: 800 }}>{name.slice(i, i + q.length)}</span>
      {name.slice(i + q.length)}
    </>
  )
}

export default function Search() {
  const navigate  = useNavigate()
  const pageTheme = React.useContext(ThemeContext)
  const isLight   = pageTheme === 'light'

  // Brand auburn (same hue the dark theme uses) — solid accent borders in light.
  const auburn = '#A72C32'
  // Solid auburn left-accent applied to primary cards in light mode only.
  const cardAccent = isLight ? { borderLeft: `3px solid ${auburn}` } : null

  const [query, setQuery]         = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [focused, setFocused]     = useState(false)
  const [recentSearches, setRecentSearches] = useState(loadRecent)
  const inputRef   = useRef(null)
  const debounceRef = useRef(null)

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedQuery(query.trim()), 200)
    return () => clearTimeout(debounceRef.current)
  }, [query])

  const { devices: searchDocs, loading: searchLoading, total } = usePaginatedDevices(20, {
    search: debouncedQuery,
  })

  const mappedDocs = searchDocs.map(d => {
    const lastSeen    = d.dataRetrievalTime || null
    const hoursAgo    = lastSeen ? (Date.now() - new Date(lastSeen).getTime()) / 3600000 : 99
    const isStickerSN = /^\d+$/.test(String(d.sn ?? ''))
    const displayName = d.assigned_user_name || d.name || d.sn || '—'
    return {
      id:           d.sn || d.local_id,
      userName:     isStickerSN ? null       : displayName,
      cargoName:    isStickerSN ? displayName : null,
      category:     d.category || '',
      lastLocation: d.lastLocation || '',
      hoursAgo,
      battery:      typeof d.battery === 'number' ? d.battery : null,
      status:       (d.status === 'offline' && hoursAgo > 24) ? 'Missing'
                  : (d.status === 'offline' && hoursAgo > 12) ? 'At Risk'
                  : 'Active',
      type:         isStickerSN ? 'sticker' : 'locator',
      route:        isStickerSN ? `/stickers/${d.sn}` : `/locators/${d.sn}`,
    }
  })

  // ── Name-only matching ──────────────────────────────────────────────────────
  // Search engine behaviour: match strictly on the device NAME, not location /
  // category / id. The hook fetches a candidate set; we narrow to name matches.
  const nameOf = d => (d.userName || d.cargoName || '').toString()

  const dq = debouncedQuery.toLowerCase()
  const byName = dq
    ? mappedDocs.filter(d => nameOf(d).toLowerCase().includes(dq))
    : []

  const searchResults = byName
  const locators      = byName.filter(r => r.type === 'locator')
  const stickers      = byName.filter(r => r.type === 'sticker')
  const recentDevices = !debouncedQuery ? mappedDocs : []

  // ── Live name suggestions (autocomplete) — updates on every keystroke ─────────
  const liveQ = query.trim().toLowerCase()
  const suggestions = liveQ
    ? [...mappedDocs]
        .filter(d => nameOf(d).toLowerCase().includes(liveQ))
        .sort((a, b) => {
          const na = nameOf(a).toLowerCase(), nb = nameOf(b).toLowerCase()
          const pa = na.startsWith(liveQ) ? 0 : 1, pb = nb.startsWith(liveQ) ? 0 : 1
          return pa - pb || na.localeCompare(nb)
        })
        .slice(0, 8)
    : []
  const showSuggestions = focused && liveQ.length > 0 && suggestions.length > 0

  // ── Theme tokens ────────────────────────────────────────────────────────────
  const panel = isLight
    ? { background: 'linear-gradient(145deg, #FFFFFF 0%, #F0F0F0 50%, #DCDCDC 100%)', border: '1px solid #C9C9C9', borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.06)' }
    : { background: 'rgba(18,18,18,0.90)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '16px', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }

  const T = {
    txt1:           isLight ? '#111827' : '#FFFFFF',
    txt2:           isLight ? '#6B7280' : 'rgba(255,255,255,0.50)',
    txt3:           isLight ? '#9CA3AF' : 'rgba(255,255,255,0.30)',
    accent:         isLight ? '#DC2626' : '#C44E54',
    accentBg:       isLight ? '#FEF2F2' : 'rgba(164,44,50,0.12)',
    accentBdr:      isLight ? '#FECACA' : 'rgba(164,44,50,0.28)',
    stickerClr:     isLight ? '#DC2626' : '#A78BFA',
    stickerBg:      isLight ? '#FEF2F2' : 'rgba(124,58,237,0.12)',
    stickerBdr:     isLight ? '#FECACA' : 'rgba(124,58,237,0.20)',
    rowHover:       isLight ? '#DCDCDC' : 'rgba(164,44,50,0.06)',
    divider:        isLight ? '#CFCFCF' : 'rgba(255,255,255,0.05)',
    inputBg:        isLight ? '#FFFFFF' : (focused ? 'rgba(22,6,6,0.95)' : 'rgba(18,18,18,0.90)'),
    inputBdr:       isLight ? (focused ? '#DC2626' : '#C9C9C9') : (focused ? 'rgba(164,44,50,0.45)' : 'rgba(255,255,255,0.09)'),
    chipBg:         isLight ? '#DCDCDC' : 'rgba(255,255,255,0.04)',
    chipBdr:        isLight ? '#C9C9C9'  : 'rgba(255,255,255,0.09)',
    chipTxt:        isLight ? '#6B7280'  : 'rgba(255,255,255,0.55)',
    clearBg:        isLight ? '#D2D2D2'  : 'rgba(255,255,255,0.08)',
    statusGreenBg:  isLight ? '#ECFDF5'  : 'rgba(22,163,74,0.12)',
    statusGreenClr: isLight ? '#059669'  : '#4ade80',
    statusGreenBdr: isLight ? '#A7F3D0'  : 'rgba(22,163,74,0.25)',
    statusRedBg:    isLight ? '#FEF2F2'  : 'rgba(220,38,38,0.10)',
    statusRedClr:   isLight ? '#DC2626'  : '#f87171',
    statusRedBdr:   isLight ? '#FECACA'  : 'rgba(220,38,38,0.22)',
    cardHoverBdr:   isLight ? '#DC2626'  : 'rgba(164,44,50,0.35)',
    panelBdr:       isLight ? '#C9C9C9'  : 'rgba(255,255,255,0.07)',
  }

  function commitSearch(term) {
    const t = term.trim()
    if (!t) return
    setRecentSearches(prev => {
      const next = [t, ...prev.filter(s => s.toLowerCase() !== t.toLowerCase())].slice(0, MAX_RECENT)
      saveRecent(next)
      return next
    })
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') commitSearch(query)
  }

  function pickSuggestion(s) {
    setQuery(s)
    commitSearch(s)
  }

  function clearRecent(term, e) {
    e.stopPropagation()
    setRecentSearches(prev => {
      const next = prev.filter(s => s !== term)
      saveRecent(next)
      return next
    })
  }

  useEffect(() => { inputRef.current?.focus() }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '820px', margin: '0 auto' }}>

      {/* Page heading */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
          <div style={{
            width: '32px', height: '32px', borderRadius: '10px',
            background: isLight ? '#A72C32' : T.accentBg,
            border: `1px solid ${isLight ? '#8B2328' : T.accentBdr}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <SearchIcon style={{ width: '15px', height: '15px', color: isLight ? '#000000' : T.accent }} />
          </div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: T.txt1, letterSpacing: '-0.03em', margin: 0 }}>Search</h1>
        </div>
        <p style={{ fontSize: '12px', color: T.txt3, margin: 0, paddingLeft: '42px' }}>
          Find any device, shipment, owner, or location
        </p>
      </div>

      {/* Search bar */}
      <div style={{ position: 'relative' }}>
        {focused && !isLight && (
          <div style={{
            position: 'absolute', inset: '-2px', borderRadius: '50px',
            background: 'transparent',
            border: '1px solid rgba(164,44,50,0.50)',
            boxShadow: '0 0 24px rgba(164,44,50,0.20)',
            pointerEvents: 'none', zIndex: 0,
          }} />
        )}
        <div style={{
          position: 'relative', zIndex: 1,
          background: T.inputBg,
          border: `1px solid ${T.inputBdr}`,
          borderRadius: '50px',
          display: 'flex', alignItems: 'center', gap: '12px',
          padding: '0 18px',
          transition: 'background 0.2s, border-color 0.2s',
          boxShadow: isLight ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
        }}>
          <SearchIcon style={{ width: '18px', height: '18px', color: focused ? T.accent : T.txt3, flexShrink: 0, transition: 'color 0.2s' }} />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => { setFocused(false); commitSearch(query) }}
            placeholder="Search by name, device ID, shipment, location..."
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              fontSize: '14px', color: T.txt1, padding: '14px 0',
              fontFamily: 'inherit', letterSpacing: '-0.01em',
            }}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              style={{
                flexShrink: 0, width: '22px', height: '22px', borderRadius: '50%',
                background: T.clearBg, border: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: T.txt2,
              }}
              onMouseEnter={e => e.currentTarget.style.background = isLight ? '#D1D5DB' : 'rgba(255,255,255,0.14)'}
              onMouseLeave={e => e.currentTarget.style.background = T.clearBg}
            >
              <X style={{ width: '12px', height: '12px' }} />
            </button>
          )}
        </div>

        {/* ── Autocomplete dropdown — live device-name suggestions ── */}
        {showSuggestions && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 8px)', left: 0, right: 0, zIndex: 30,
            ...panel, ...(cardAccent || {}),
            padding: '6px', overflow: 'hidden',
            boxShadow: isLight ? '0 8px 28px rgba(15,23,42,0.14)' : '0 12px 40px rgba(0,0,0,0.55)',
          }}>
            {suggestions.map(d => {
              const isLocator = d.type === 'locator'
              const name = nameOf(d)
              return (
                <button
                  key={d.id}
                  // onMouseDown fires before input blur, so navigation isn't cancelled
                  onMouseDown={e => { e.preventDefault(); commitSearch(name); navigate(d.route) }}
                  style={{
                    width: '100%', display: 'grid', gridTemplateColumns: '28px 1fr auto',
                    alignItems: 'center', gap: '12px', padding: '9px 10px', borderRadius: '10px',
                    background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
                    fontFamily: 'inherit', transition: 'background 0.12s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = T.rowHover}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{
                    width: '28px', height: '28px', borderRadius: '8px',
                    background: isLocator ? T.accentBg : T.stickerBg,
                    border: `1px solid ${isLocator ? T.accentBdr : T.stickerBdr}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    {isLocator
                      ? <Radio style={{ width: '13px', height: '13px', color: T.accent }} />
                      : <Tag   style={{ width: '13px', height: '13px', color: T.stickerClr }} />}
                  </div>
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: T.txt1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {highlightMatch(name, liveQ, T.accent)}
                    </div>
                    <div style={{ fontSize: '11px', color: T.txt3, fontFamily: 'monospace' }}>{d.id}</div>
                  </div>
                  <ChevronRight style={{ width: '14px', height: '14px', color: T.txt3, flexShrink: 0 }} />
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ── EMPTY STATE ── */}
      {!query && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>

          {/* Suggestion chips */}
          <div style={{ ...panel, ...(cardAccent || {}), padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <TrendingUp style={{ width: '14px', height: '14px', color: T.accent }} />
              <span style={{ fontSize: '11px', fontWeight: 700, color: T.txt3, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Suggested Searches</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {[
                'Recent Devices', 'Recent Locations', 'Recent Shipments',
              ].map(s => (
                <button
                  key={s}
                  onClick={() => pickSuggestion(s)}
                  style={{
                    padding: '7px 14px', borderRadius: '20px',
                    background: T.chipBg, border: `1px solid ${T.chipBdr}`,
                    color: T.chipTxt, fontSize: '12px', fontWeight: 500,
                    cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = T.accentBg
                    e.currentTarget.style.borderColor = T.accentBdr
                    e.currentTarget.style.color = T.accent
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = T.chipBg
                    e.currentTarget.style.borderColor = T.chipBdr
                    e.currentTarget.style.color = T.chipTxt
                  }}
                >
                  {s}
                </button>
              ))}
            </div>

            {/* Recent searches */}
            {recentSearches.length > 0 && (
              <div style={{ marginTop: '20px', paddingTop: '18px', borderTop: `1px solid ${T.divider}` }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Clock style={{ width: '14px', height: '14px', color: T.txt3 }} />
                    <span style={{ fontSize: '11px', fontWeight: 700, color: T.txt3, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Recent Searches</span>
                  </div>
                  <button
                    onClick={() => { setRecentSearches([]); saveRecent([]) }}
                    style={{ fontSize: '10px', color: T.txt3, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
                    onMouseEnter={e => e.currentTarget.style.color = T.accent}
                    onMouseLeave={e => e.currentTarget.style.color = T.txt3}
                  >
                    Clear all
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  {recentSearches.map(r => (
                    <button
                      key={r}
                      onClick={() => pickSuggestion(r)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '8px 10px', borderRadius: '8px',
                        background: 'transparent', border: 'none',
                        color: T.txt2, fontSize: '13px',
                        cursor: 'pointer', transition: 'background 0.12s', fontFamily: 'inherit',
                        textAlign: 'left',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = T.rowHover}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <Clock style={{ width: '12px', height: '12px', flexShrink: 0, color: T.txt3 }} />
                      <span style={{ flex: 1 }}>{r}</span>
                      <span
                        onClick={e => clearRecent(r, e)}
                        style={{ padding: '2px 4px', color: T.txt3, fontSize: '11px', lineHeight: 1 }}
                        onMouseEnter={e => { e.stopPropagation(); e.currentTarget.style.color = T.accent }}
                        onMouseLeave={e => e.currentTarget.style.color = T.txt3}
                      >
                        <X style={{ width: '10px', height: '10px' }} />
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Recently active devices */}
          {!debouncedQuery && (
          <div style={{ ...panel, ...(cardAccent || {}), padding: '22px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Zap style={{ width: '14px', height: '14px', color: T.accent }} />
                <span style={{ fontSize: '11px', fontWeight: 700, color: T.txt3, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Recently Active Devices</span>
              </div>
              <span style={{ fontSize: '10px', color: T.txt3 }}>{total} total</span>
            </div>
            {searchLoading && (
              <TPLLoader label="Searching…" />
            )}
            {!searchLoading && recentDevices.length === 0 && (
              <div style={{ fontSize: 12, color: T.txt3, padding: '12px 0' }}>No devices found</div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {recentDevices.map(d => {
                const isLocator = !!d.userName
                return (
                  <button
                    key={d.id}
                    onClick={() => navigate(isLocator ? `/locators/${d.id}` : `/stickers/${d.id}`)}
                    style={{
                      display: 'grid', gridTemplateColumns: '28px 1fr auto',
                      alignItems: 'center', gap: '12px',
                      padding: '10px 10px', borderRadius: '10px',
                      background: 'transparent', border: 'none',
                      cursor: 'pointer', transition: 'background 0.12s', fontFamily: 'inherit',
                      textAlign: 'left',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = T.rowHover}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <div style={{
                      width: '28px', height: '28px', borderRadius: '8px',
                      background: isLocator ? T.accentBg : T.stickerBg,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {isLocator
                        ? <Radio style={{ width: '13px', height: '13px', color: T.accent }} />
                        : <Tag   style={{ width: '13px', height: '13px', color: T.stickerClr }} />
                      }
                    </div>
                    <div style={{ overflow: 'hidden' }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: T.txt1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {isLocator ? d.userName : d.cargoName}
                      </div>
                      <div style={{ fontSize: '11px', color: T.txt3, fontFamily: 'monospace' }}>{d.id}</div>
                    </div>
                    <div style={{
                      fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: '20px',
                      background: (d.status === 'Active' || d.status === 'In Transit') ? T.statusGreenBg : T.statusRedBg,
                      color:      (d.status === 'Active' || d.status === 'In Transit') ? T.statusGreenClr : T.statusRedClr,
                      border: `1px solid ${(d.status === 'Active' || d.status === 'In Transit') ? T.statusGreenBdr : T.statusRedBdr}`,
                      whiteSpace: 'nowrap',
                    }}>
                      {d.status}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
          )}
        </div>
      )}

      {/* ── NO RESULTS ── */}
      {debouncedQuery && byName.length === 0 && (
        <div style={{ ...panel, padding: '48px 24px', textAlign: 'center' }}>
          <div style={{ width: '52px', height: '52px', borderRadius: '16px', background: T.chipBg, border: `1px solid ${T.chipBdr}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <SearchIcon style={{ width: '22px', height: '22px', color: T.txt3 }} />
          </div>
          <div style={{ fontSize: '15px', fontWeight: 700, color: T.txt2, marginBottom: '6px' }}>No results found</div>
          <div style={{ fontSize: '12px', color: T.txt3 }}>No matches for <span style={{ color: T.accent }}>"{query}"</span> — try a device ID, owner name, or location</div>
        </div>
      )}

      {/* ── RESULTS ── */}
      {byName.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ fontSize: '12px', color: T.txt3, fontWeight: 600 }}>
            <span style={{ color: T.accent, fontWeight: 700 }}>{byName.length}</span> result{byName.length !== 1 ? 's' : ''} for <span style={{ color: T.txt2 }}>"{query}"</span>
          </div>

          {/* Locator results */}
          {locators.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '2px' }}>
                <Radio style={{ width: '13px', height: '13px', color: T.accent }} />
                <span style={{ fontSize: '10px', fontWeight: 700, color: T.txt3, textTransform: 'uppercase', letterSpacing: '0.08em' }}>BLE Locators ({locators.length})</span>
              </div>
              {locators.map(l => (
                <div
                  key={l.id}
                  onClick={() => navigate(`/locators/${l.id}`)}
                  style={{ ...panel, ...(cardAccent || {}), padding: '16px 18px', cursor: 'pointer', transition: 'border-color 0.15s, transform 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = T.cardHoverBdr; e.currentTarget.style.transform = 'translateY(-1px)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = T.panelBdr; if (isLight) e.currentTarget.style.borderLeftColor = auburn; e.currentTarget.style.transform = 'translateY(0)' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: T.accentBg, border: `1px solid ${T.accentBdr}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Radio style={{ width: '16px', height: '16px', color: T.accent }} />
                      </div>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: T.txt1 }}>{l.userName}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px' }}>
                          <span style={{ fontFamily: 'monospace', fontSize: '11px', color: T.accent, fontWeight: 600 }}>{l.id}</span>
                          <span style={{ color: T.txt3, fontSize: '10px' }}>·</span>
                          <span style={{ fontSize: '11px', color: T.txt2 }}>{l.category}</span>
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Badge status={l.status} size="xs" />
                      <ChevronRight style={{ width: '15px', height: '15px', color: T.txt3 }} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '12px', paddingTop: '10px', borderTop: `1px solid ${T.divider}` }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: T.txt2 }}>
                      <MapPin style={{ width: '11px', height: '11px' }} />{l.lastLocation}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: l.battery <= 20 ? '#F59E0B' : T.txt2 }}>
                      <Battery style={{ width: '11px', height: '11px' }} />{l.battery}%
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: T.txt2 }}>
                      <Clock style={{ width: '11px', height: '11px' }} />
                      {l.hoursAgo < 1 ? `${Math.round(l.hoursAgo * 60)}m ago` : `${l.hoursAgo}h ago`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Sticker results */}
          {stickers.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '2px' }}>
                <Tag style={{ width: '13px', height: '13px', color: T.stickerClr }} />
                <span style={{ fontSize: '10px', fontWeight: 700, color: T.txt3, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Smart Devices ({stickers.length})</span>
              </div>
              {stickers.map(s => (
                <div
                  key={s.id}
                  onClick={() => navigate(`/stickers/${s.id}`)}
                  style={{ ...panel, ...(cardAccent || {}), padding: '16px 18px', cursor: 'pointer', transition: 'border-color 0.15s, transform 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = isLight ? T.cardHoverBdr : 'rgba(124,58,237,0.35)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = T.panelBdr; if (isLight) e.currentTarget.style.borderLeftColor = auburn; e.currentTarget.style.transform = 'translateY(0)' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: T.stickerBg, border: `1px solid ${T.stickerBdr}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Tag style={{ width: '16px', height: '16px', color: T.stickerClr }} />
                      </div>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: T.txt1 }}>{s.cargoName}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px' }}>
                          <span style={{ fontFamily: 'monospace', fontSize: '11px', color: T.stickerClr, fontWeight: 600 }}>{s.id}</span>
                          {s.shipmentId && (
                            <>
                              <span style={{ color: T.txt3, fontSize: '10px' }}>·</span>
                              <span style={{ fontSize: '11px', color: T.accent, fontWeight: 600 }}>{s.shipmentId}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Badge status={s.status} size="xs" />
                      <ChevronRight style={{ width: '15px', height: '15px', color: T.txt3 }} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '12px', paddingTop: '10px', borderTop: `1px solid ${T.divider}` }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: T.txt2 }}>
                      <MapPin style={{ width: '11px', height: '11px' }} />{s.lastLocation}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: s.battery <= 20 ? '#F59E0B' : T.txt2 }}>
                      <Battery style={{ width: '11px', height: '11px' }} />{s.battery}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
