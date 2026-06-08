import React, { useContext } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Layers, Radio, Tag } from 'lucide-react'
import Locators from './Locators.jsx'
import Stickers from './Stickers.jsx'
import { ThemeContext } from '../components/layout/Layout.jsx'

const TABS = [
  { key: 'locator', label: 'Locators',       icon: Radio },
  { key: 'sticker', label: 'Smart Stickers', icon: Tag   },
]

export default function Devices() {
  const [searchParams, setSearchParams] = useSearchParams()
  // Fall back to 'locator' for any unknown tab (e.g. legacy ?tab=offline links)
  const rawTab = searchParams.get('tab')
  const activeTab = (rawTab === 'sticker' || rawTab === 'locator') ? rawTab : 'locator'
  const pageTheme = useContext(ThemeContext)
  const isLight   = pageTheme === 'light'

  const setTab = (key) => setSearchParams({ tab: key }, { replace: true })

  const T = {
    tabBg:     isLight ? '#DCDCDC' : 'rgba(255,255,255,0.05)',
    tabBorder: isLight ? '#C9C9C9' : 'rgba(255,255,255,0.08)',
    txt1:      isLight ? '#000000' : '#f4f4f5',
    txt2:      isLight ? '#333333' : 'rgba(255,255,255,0.50)',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '4px 0', position: 'relative' }}>

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: isLight ? 12 : 10 }}>
        {isLight ? (
          <div style={{ width: 44, height: 44, borderRadius: 12, background: '#A72C32', border: '1px solid #8B2328', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Layers style={{ width: 20, height: 20, color: '#FFFFFF' }} />
          </div>
        ) : (
          <div style={{ padding: 9, background: 'rgba(167,44,50,0.14)', borderRadius: 12, border: '1px solid rgba(167,44,50,0.24)', display: 'flex' }}>
            <Layers style={{ width: 18, height: 18, color: '#C86068' }} />
          </div>
        )}
        <h1 style={{ fontSize: 22, fontWeight: 800, color: T.txt1, margin: 0, letterSpacing: isLight ? '-0.02em' : '-0.03em' }}>
          Devices
        </h1>
      </div>

      {/* ── Filter tab bar ───────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 4, padding: 4, background: T.tabBg, border: `1px solid ${T.tabBorder}`, borderRadius: 12, width: 'fit-content', flexWrap: 'wrap' }}>
        {TABS.map(({ key, label, icon: Icon }) => {
          const active = activeTab === key
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '8px 18px', borderRadius: 9, border: 'none',
                fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
                background: active ? '#A72C32' : 'transparent',
                color:      active ? '#FFFFFF'  : T.txt2,
                boxShadow:  active ? '0 2px 8px rgba(167,44,50,0.30)' : 'none',
              }}
            >
              <Icon style={{ width: 14, height: 14 }} />
              {label}
            </button>
          )
        })}
      </div>

      {/* ── Active tab content — reuses the existing page components ──────── */}
      {activeTab === 'locator' && <Locators embedded />}
      {activeTab === 'sticker' && <Stickers embedded />}
    </div>
  )
}
