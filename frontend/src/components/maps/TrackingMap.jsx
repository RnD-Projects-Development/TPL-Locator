import React, { useState, useEffect, useRef } from 'react'
import { vehicles, bleStickers } from '../../data/mockData.js'
import { MapPin, Truck, Navigation, Layers, ZoomIn, ZoomOut, Maximize2, Info } from 'lucide-react'
import Badge from '../common/Badge.jsx'

// Map Indian coordinates to SVG viewport [0..1200, 0..650]
const toSVG = (lat, lng) => ({
  x: ((lng - 68) / (97 - 68)) * 1160 + 20,
  y: ((35 - lat) / (35 - 7)) * 610 + 20,
})

const statusDot = {
  'In Transit': '#3b82f6',
  'Delayed':    '#f59e0b',
  'Loaded':     '#8b5cf6',
  'Delivered':  '#10b981',
  'Idle':       '#64748b',
  'Lost':       '#ef4444',
  'Unloaded':   '#06b6d4',
  'Returned':   '#f97316',
}

const vehicleColor = {
  'Moving':  '#3b82f6',
  'Halted':  '#f59e0b',
  'Loading': '#8b5cf6',
  'Delayed': '#ef4444',
}

// Simplified Indian road network (key corridors)
const roads = [
  // NH-48 Mumbai-Delhi
  [{ lat: 19.07, lng: 72.87 }, { lat: 21.15, lng: 72.85 }, { lat: 23.02, lng: 72.57 }, { lat: 26.91, lng: 75.78 }, { lat: 28.70, lng: 77.10 }],
  // Mumbai-Bangalore
  [{ lat: 19.07, lng: 72.87 }, { lat: 18.52, lng: 73.85 }, { lat: 17.38, lng: 78.48 }, { lat: 15.84, lng: 74.49 }, { lat: 12.97, lng: 77.59 }, { lat: 13.08, lng: 80.27 }],
  // Delhi-Kolkata
  [{ lat: 28.70, lng: 77.10 }, { lat: 27.17, lng: 78.00 }, { lat: 25.32, lng: 82.97 }, { lat: 22.57, lng: 88.36 }],
  // Chennai-Hyderabad
  [{ lat: 13.08, lng: 80.27 }, { lat: 14.67, lng: 79.99 }, { lat: 17.38, lng: 78.48 }],
  // Mumbai-Chennai coastal
  [{ lat: 19.07, lng: 72.87 }, { lat: 15.29, lng: 74.12 }, { lat: 13.08, lng: 80.27 }],
  // Delhi-Jaipur
  [{ lat: 28.70, lng: 77.10 }, { lat: 27.90, lng: 77.05 }, { lat: 26.91, lng: 75.78 }],
  // Coimbatore-Chennai
  [{ lat: 11.01, lng: 76.95 }, { lat: 11.66, lng: 78.14 }, { lat: 13.08, lng: 80.27 }],
]

// Major cities
const cities = [
  { name: 'Mumbai',     lat: 19.07, lng: 72.87 },
  { name: 'Delhi',      lat: 28.70, lng: 77.10 },
  { name: 'Bangalore',  lat: 12.97, lng: 77.59 },
  { name: 'Hyderabad',  lat: 17.38, lng: 78.48 },
  { name: 'Chennai',    lat: 13.08, lng: 80.27 },
  { name: 'Kolkata',    lat: 22.57, lng: 88.36 },
  { name: 'Ahmedabad',  lat: 23.02, lng: 72.57 },
  { name: 'Pune',       lat: 18.52, lng: 73.85 },
  { name: 'Jaipur',     lat: 26.91, lng: 75.78 },
  { name: 'Coimbatore', lat: 11.01, lng: 76.95 },
]

export default function TrackingMap({ height = '500px', selectedVehicle = null, onSelectVehicle }) {
  const [selected, setSelected] = useState(null)
  const [mapStyle, setMapStyle] = useState('dark')
  const [showLabels, setShowLabels] = useState(true)
  const [tick, setTick] = useState(0)
  const svgRef = useRef(null)

  // Animate markers
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 2000)
    return () => clearInterval(id)
  }, [])

  const handleVehicleClick = (v) => {
    setSelected(v)
    onSelectVehicle && onSelectVehicle(v)
  }

  const bg = mapStyle === 'dark' ? '#0d1117' : '#1a2535'
  const gridColor = mapStyle === 'dark' ? '#161b22' : '#1e2d40'
  const roadColor = '#1c2b3a'
  const majorRoadColor = '#243447'

  return (
    <div className="relative rounded-xl overflow-hidden border border-slate-800" style={{ height }}>
      {/* Map SVG */}
      <svg ref={svgRef} viewBox="0 0 1200 650" className="w-full h-full" style={{ background: bg }}>
        <defs>
          {/* Grid pattern */}
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke={gridColor} strokeWidth="0.5" />
          </pattern>
          {/* Glow filters */}
          <filter id="glow-blue" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="glow-amber" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <radialGradient id="cityGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
          </radialGradient>
          {/* Animated dash */}
          <style>{`
            @keyframes dashMove { to { stroke-dashoffset: -30; } }
            .route-anim { animation: dashMove 1.5s linear infinite; }
          `}</style>
        </defs>

        {/* Background grid */}
        <rect width="1200" height="650" fill="url(#grid)" />

        {/* Ocean/land background suggestion */}
        <rect width="1200" height="650" fill="#0a1628" opacity="0.3" />

        {/* Road network */}
        {roads.map((road, ri) => {
          const pts = road.map(p => toSVG(p.lat, p.lng))
          const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
          return (
            <g key={ri}>
              <path d={d} fill="none" stroke={majorRoadColor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              <path d={d} fill="none" stroke="#2d4a6e" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="8 4" opacity="0.4" />
            </g>
          )
        })}

        {/* City glow auras */}
        {cities.map(c => {
          const p = toSVG(c.lat, c.lng)
          return (
            <circle key={c.name} cx={p.x} cy={p.y} r="35" fill="url(#cityGlow)" />
          )
        })}

        {/* City dots */}
        {cities.map(c => {
          const p = toSVG(c.lat, c.lng)
          return (
            <g key={c.name}>
              <circle cx={p.x} cy={p.y} r="4" fill="#334155" stroke="#475569" strokeWidth="1.5" />
              <circle cx={p.x} cy={p.y} r="2" fill="#94a3b8" />
              {showLabels && (
                <text x={p.x + 7} y={p.y + 4} fill="#64748b" fontSize="10" fontFamily="Inter, sans-serif" fontWeight="500">{c.name}</text>
              )}
            </g>
          )
        })}

        {/* BLE Sticker markers */}
        {bleStickers.filter(s => s.lastGPS && s.status !== 'Idle' && s.status !== 'Returned').map(sticker => {
          const [lat, lng] = sticker.lastGPS.split(',').map(Number)
          const p = toSVG(lat, lng)
          const color = statusDot[sticker.status] || '#64748b'
          const isSelected = selected?.id === sticker.id
          const pulse = tick % 2 === 0

          return (
            <g key={sticker.id} className="cursor-pointer" onClick={() => setSelected(sticker)} transform={`translate(${p.x}, ${p.y})`}>
              {/* Pulse ring */}
              {(sticker.status === 'In Transit' || sticker.status === 'Delayed') && (
                <circle r={pulse ? 14 : 10} fill="none" stroke={color} strokeWidth="1" opacity={pulse ? 0.2 : 0.5} style={{ transition: 'all 1s ease' }} />
              )}
              <circle r="6" fill={color} opacity="0.9" filter="url(#glow-blue)" />
              <circle r="3" fill="white" opacity="0.8" />
              {isSelected && <circle r="10" fill="none" stroke={color} strokeWidth="2" />}
            </g>
          )
        })}

        {/* Vehicle markers */}
        {vehicles.map(v => {
          const p = toSVG(v.lat, v.lng)
          const color = vehicleColor[v.status] || '#3b82f6'
          const isSelected = selected?.id === v.id || selectedVehicle === v.id
          const pulse = tick % 2 === 0

          return (
            <g key={v.id} className="cursor-pointer" onClick={() => handleVehicleClick(v)} transform={`translate(${p.x}, ${p.y})`}>
              {v.status === 'Moving' && (
                <circle r={pulse ? 18 : 12} fill="none" stroke={color} strokeWidth="1.5" opacity={pulse ? 0.15 : 0.35} style={{ transition: 'all 1s ease' }} />
              )}
              {/* Vehicle icon (rotated triangle for direction) */}
              <polygon points="0,-9 7,6 0,3 -7,6" fill={color} opacity="0.95" filter="url(#glow-blue)" />
              <polygon points="0,-6 4,3 0,1 -4,3" fill="white" opacity="0.5" />
              {isSelected && (
                <circle r="14" fill="none" stroke={color} strokeWidth="2" strokeDasharray="4 2" className="route-anim" />
              )}
              {showLabels && (
                <text x="10" y="4" fill={color} fontSize="9" fontFamily="Inter, sans-serif" fontWeight="600" opacity="0.9">{v.number.split('-').slice(0,2).join('-')}</text>
              )}
            </g>
          )
        })}

        {/* Route line for selected vehicle */}
        {selected && selected.number && (() => {
          const pts = [
            toSVG(selected.lat, selected.lng),
            toSVG(selected.lat - 2, selected.lng - 2),
            toSVG(selected.lat - 4, selected.lng - 4),
          ]
          const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
          return (
            <path d={d} fill="none" stroke={vehicleColor[selected.status] || '#3b82f6'}
              strokeWidth="2" strokeDasharray="8 4" opacity="0.6" className="route-anim" />
          )
        })()}
      </svg>

      {/* Map Controls */}
      <div className="absolute top-3 right-3 flex flex-col gap-1.5">
        <button onClick={() => setShowLabels(!showLabels)}
          className="p-2 bg-slate-800/90 backdrop-blur rounded-lg border border-slate-700 text-slate-300 hover:text-white transition-colors text-xs font-medium">
          <Layers className="w-3.5 h-3.5" />
        </button>
        <button className="p-2 bg-slate-800/90 backdrop-blur rounded-lg border border-slate-700 text-slate-300 hover:text-white transition-colors">
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <button className="p-2 bg-slate-800/90 backdrop-blur rounded-lg border border-slate-700 text-slate-300 hover:text-white transition-colors">
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <button className="p-2 bg-slate-800/90 backdrop-blur rounded-lg border border-slate-700 text-slate-300 hover:text-white transition-colors">
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Legend */}
      <div className="absolute bottom-3 left-3 glass rounded-lg px-3 py-2 text-xs space-y-1">
        <div className="text-slate-400 font-semibold mb-1.5 text-[10px] uppercase tracking-wider">Legend</div>
        {[['In Transit','#3b82f6'],['Delayed','#f59e0b'],['Loaded','#8b5cf6'],['Lost','#ef4444']].map(([s,c]) => (
          <div key={s} className="flex items-center gap-2 text-slate-300">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: c }} />
            <span>{s}</span>
          </div>
        ))}
        <div className="mt-1 pt-1 border-t border-slate-700 flex items-center gap-2 text-slate-300">
          <span className="text-[10px]">▲</span><span>Vehicle</span>
        </div>
      </div>

      {/* Selected Info Panel */}
      {selected && (
        <div className="absolute top-3 left-3 glass rounded-xl p-3 max-w-[220px] animate-slide-up">
          <div className="flex items-center justify-between mb-2">
            <div className="text-white font-semibold text-sm">{selected.number || selected.id}</div>
            <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-white text-lg leading-none">×</button>
          </div>
          {selected.number ? (
            // Vehicle
            <div className="space-y-1 text-xs text-slate-300">
              <div className="flex justify-between"><span className="text-slate-500">Driver</span><span>{selected.driver}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Speed</span><span>{selected.speed} km/h</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Cargo</span><span>{selected.cargo} items</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Fuel</span><span>{selected.fuel}%</span></div>
              <div className="mt-2"><Badge status={selected.status} /></div>
            </div>
          ) : (
            // Sticker
            <div className="space-y-1 text-xs text-slate-300">
              <div className="flex justify-between"><span className="text-slate-500">Asset</span><span className="text-right max-w-[120px] truncate">{selected.assetName}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Battery</span><span>{selected.battery}%</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Last seen</span><span>{selected.lastSeen}</span></div>
              <div className="mt-2"><Badge status={selected.status} /></div>
            </div>
          )}
        </div>
      )}

      {/* Live Pulse Label */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 glass rounded-full px-3 py-1.5">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
        </span>
        <span className="text-xs text-slate-300 font-medium">LIVE · {vehicles.length} Vehicles · {bleStickers.filter(s=>s.status==='In Transit').length} In Transit</span>
      </div>
    </div>
  )
}
