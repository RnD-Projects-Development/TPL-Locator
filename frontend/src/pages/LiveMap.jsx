import React, { useState, useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet'
import L from 'leaflet'
import { Map, Radio, Tag, MapPin, Eye, EyeOff } from 'lucide-react'
import Badge from '../components/common/Badge.jsx'
import { useApp } from '../App.jsx'

// Fix default Leaflet marker icons broken by bundlers
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const makeIcon = (color, active) => L.divIcon({
  className: '',
  html: `<div style="
    width:${active ? 14 : 12}px; height:${active ? 14 : 12}px;
    background:${color}; border:2px solid white;
    border-radius:50%; box-shadow:0 0 0 ${active ? 6 : 0}px ${color}33;
  "></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
})

const statusColor = s => ({
  'Active':     '#10B981',
  'In Transit': '#6366F1',
  'Delivered':  '#10B981',
  'Lost':       '#EF4444',
  'Missing':    '#EF4444',
  'At Risk':    '#F59E0B',
  'Idle':       '#64748B',
}[s] || '#64748B')

// Best-guess city coords from text locations
const CITY_COORDS = {
  'mumbai':      [19.076, 72.877],
  'pune':        [18.520, 73.856],
  'delhi':       [28.704, 77.102],
  'chennai':     [13.082, 80.270],
  'bangalore':   [12.971, 77.594],
  'bengaluru':   [12.971, 77.594],
  'kolkata':     [22.572, 88.363],
  'hyderabad':   [17.385, 78.486],
  'ahmedabad':   [23.022, 72.571],
  'jaipur':      [26.912, 75.787],
  'nashik':      [19.997, 73.789],
  'coimbatore':  [11.001, 76.966],
  'thane':       [19.218, 72.978],
  'dadar':       [19.018, 72.842],
  'bandra':      [19.054, 72.841],
  'andheri':     [19.119, 72.847],
  'powai':       [19.118, 72.906],
  'colaba':      [18.907, 72.815],
  'bkc':         [19.066, 72.867],
  'goregaon':    [19.162, 72.849],
  'lower parel': [18.997, 72.831],
  'juhu':        [19.099, 72.827],
}

function guessLatLng(location) {
  if (!location) return [20.5, 78.9]
  const loc = location.toLowerCase()
  for (const [key, coords] of Object.entries(CITY_COORDS)) {
    if (loc.includes(key)) return coords
  }
  return [20 + Math.random() * 5, 77 + Math.random() * 5]
}

export default function LiveMap() {
  const { state } = useApp()
  const [showLocators, setShowLocators] = useState(true)
  const [showStickers, setShowStickers] = useState(true)
  const [filter, setFilter]             = useState('All')
  const [selected, setSelected]         = useState(null)

  const filters = ['All', 'Active', 'In Transit', 'Lost', 'Missing']

  const allPins = [
    ...(showLocators ? state.locators.map(l => ({
      ...l,
      type: 'locator',
      name: l.userName || l.owner_name,
      coords: guessLatLng(l.lastLocation || l.last_location),
    })) : []),
    ...(showStickers ? state.stickers.map(s => ({
      ...s,
      type: 'sticker',
      name: s.cargoName || s.cargo_name,
      coords: guessLatLng(s.lastLocation || s.last_location),
    })) : []),
  ].filter(p => filter === 'All' || p.status === filter)

  return (
    <div className="space-y-5 animate-slide-up">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Map className="w-6 h-6 text-cyan-400" /> Live Map
          </h1>
          <p className="text-ink-500 text-sm mt-0.5">Last-seen locations — BLE detection based, not live GPS</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {filters.map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${filter === f ? 'bg-brand-600 border-brand-500 text-white' : 'border-ink-700 text-ink-400 hover:border-ink-600 hover:text-slate-300'}`}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Layer toggles */}
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setShowLocators(v => !v)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${showLocators ? 'border-brand-500/50 bg-brand-600/10 text-brand-400' : 'border-ink-700 text-ink-500'}`}>
          {showLocators ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
          <Radio className="w-3 h-3" /> Locators ({state.locators.length})
        </button>
        <button onClick={() => setShowStickers(v => !v)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${showStickers ? 'border-violet-500/50 bg-violet-600/10 text-violet-400' : 'border-ink-700 text-ink-500'}`}>
          {showStickers ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
          <Tag className="w-3 h-3" /> Stickers ({state.stickers.length})
        </button>
        <span className="ml-auto text-xs text-ink-500 self-center">{allPins.length} devices shown</span>
      </div>

      {/* Map */}
      <div className="card overflow-hidden" style={{ height: 520 }}>
        <MapContainer center={[20.5, 78.9]} zoom={5} style={{ height: '100%', width: '100%', background: '#0F1628' }}>
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          />
          {allPins.filter(p => p.status === 'Active' || p.status === 'In Transit').map(pin => {
            const color = statusColor(pin.status)
            return (
              <Circle
                key={`circle-${pin.id || pin.device_id}`}
                center={pin.coords}
                radius={8000}
                pathOptions={{ color, fillColor: color, fillOpacity: 0.08, weight: 1 }}
              />
            )
          })}
          {allPins.map(pin => {
            const color = statusColor(pin.status)
            const isActive = pin.status === 'Active' || pin.status === 'In Transit'
            return (
              <Marker
                key={`marker-${pin.id || pin.device_id}`}
                position={pin.coords}
                icon={makeIcon(color, isActive)}
                eventHandlers={{ click: () => setSelected(pin) }}
              >
                <Popup>
                  <div className="text-xs font-sans" style={{ minWidth: 180 }}>
                    <div className="font-bold text-sm mb-1">{pin.name}</div>
                    <div className="text-gray-500 font-mono mb-2">{pin.id || pin.device_id}</div>
                    <div className="space-y-1">
                      <div><span className="text-gray-400">Status:</span> <span className="font-semibold">{pin.status}</span></div>
                      <div><span className="text-gray-400">Location:</span> {pin.lastLocation || pin.last_location}</div>
                      <div><span className="text-gray-400">Battery:</span> {pin.battery}%</div>
                      {pin.rssi && <div><span className="text-gray-400">RSSI:</span> {pin.rssi} dBm</div>}
                    </div>
                  </div>
                </Popup>
              </Marker>
            )
          })}
        </MapContainer>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 flex-wrap">
        {[['Active / In Transit','#10B981'],['Lost / Missing','#EF4444'],['At Risk','#F59E0B'],['Idle','#64748B']].map(([s,c]) => (
          <div key={s} className="flex items-center gap-1.5 text-xs text-ink-400">
            <span className="w-2.5 h-2.5 rounded-full" style={{background:c}} />{s}
          </div>
        ))}
        <span className="ml-auto text-[10px] text-ink-600">Positions are approximate — based on last BLE detection event</span>
      </div>
    </div>
  )
}
