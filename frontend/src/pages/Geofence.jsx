import React, { useState } from 'react'
import { Shield, Circle, Plus, MapPin, Activity, Trash2, Eye } from 'lucide-react'
import Badge from '../components/common/Badge.jsx'
import { geofences as initGeofences } from '../data/mockData.js'

const W = 700, H = 420
const LAT_MIN = 7, LAT_MAX = 36, LNG_MIN = 68, LNG_MAX = 98
const project = (lat, lng) => ({
  x: ((lng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * (W - 60) + 30,
  y: ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * (H - 60) + 30,
})
const radiusPx = r => r * 18

export default function Geofence() {
  const [fences, setFences]   = useState(initGeofences)
  const [selected, setSelected] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', lat: '', lng: '', radius: '1.0', color: '#6366F1' })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const addFence = e => {
    e.preventDefault()
    const newF = {
      id: `GF-${String(fences.length + 1).padStart(3,'0')}`,
      name:    form.name,
      shape:   'Circle',
      radius:  parseFloat(form.radius),
      lat:     parseFloat(form.lat),
      lng:     parseFloat(form.lng),
      devices: 0,
      events:  0,
      status:  'Active',
      color:   form.color,
    }
    setFences(f => [...f, newF])
    setForm({ name: '', lat: '', lng: '', radius: '1.0', color: '#6366F1' })
    setShowForm(false)
  }

  const toggle = id => setFences(f => f.map(g => g.id === id ? { ...g, status: g.status === 'Active' ? 'Inactive' : 'Active' } : g))
  const remove = id => { setFences(f => f.filter(g => g.id !== id)); if (selected?.id === id) setSelected(null) }

  return (
    <div className="space-y-5 animate-slide-up">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Shield className="w-6 h-6 text-jade-400" /> Geofence Manager
          </h1>
          <p className="text-ink-500 text-sm mt-0.5">Define virtual boundaries and get alerts when BLE devices enter or exit</p>
        </div>
        <button onClick={() => setShowForm(f => !f)}
          className="flex items-center gap-2 px-4 py-2.5 gradient-brand text-white text-sm font-semibold rounded-xl shadow-lg shadow-brand-600/25 hover:opacity-90 transition-all">
          <Plus className="w-4 h-4" /> Add Geofence
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="card p-5 border-brand-500/30 animate-slide-up">
          <h3 className="text-white font-semibold mb-4">Create New Geofence</h3>
          <form onSubmit={addFence} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-ink-500 font-semibold block mb-1.5">Name</label>
              <input required value={form.name} onChange={e => set('name', e.target.value)}
                placeholder="e.g. Mumbai HQ"
                className="w-full bg-ink-800 border border-ink-700 rounded-xl px-3 py-2 text-sm text-slate-200 placeholder-ink-500 focus:outline-none focus:border-brand-500/50" />
            </div>
            <div>
              <label className="text-xs text-ink-500 font-semibold block mb-1.5">Latitude</label>
              <input required type="number" step="0.01" value={form.lat} onChange={e => set('lat', e.target.value)}
                placeholder="e.g. 19.07"
                className="w-full bg-ink-800 border border-ink-700 rounded-xl px-3 py-2 text-sm text-slate-200 placeholder-ink-500 focus:outline-none focus:border-brand-500/50" />
            </div>
            <div>
              <label className="text-xs text-ink-500 font-semibold block mb-1.5">Longitude</label>
              <input required type="number" step="0.01" value={form.lng} onChange={e => set('lng', e.target.value)}
                placeholder="e.g. 72.87"
                className="w-full bg-ink-800 border border-ink-700 rounded-xl px-3 py-2 text-sm text-slate-200 placeholder-ink-500 focus:outline-none focus:border-brand-500/50" />
            </div>
            <div>
              <label className="text-xs text-ink-500 font-semibold block mb-1.5">Radius (km)</label>
              <input type="number" step="0.1" min="0.1" value={form.radius} onChange={e => set('radius', e.target.value)}
                className="w-full bg-ink-800 border border-ink-700 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-brand-500/50" />
            </div>
            <div>
              <label className="text-xs text-ink-500 font-semibold block mb-1.5">Color</label>
              <input type="color" value={form.color} onChange={e => set('color', e.target.value)}
                className="w-full h-9 bg-ink-800 border border-ink-700 rounded-xl px-2 cursor-pointer" />
            </div>
            <div className="flex items-end gap-2">
              <button type="submit" className="flex-1 py-2.5 gradient-brand text-white text-sm font-bold rounded-xl hover:opacity-90 transition-all">Create</button>
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2.5 border border-ink-700 text-ink-400 hover:text-slate-300 text-sm rounded-xl transition-colors">Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Map */}
        <div className="xl:col-span-2 card p-4">
          <h3 className="text-white font-semibold text-sm mb-3">Geofence Map</h3>
          <div className="rounded-xl overflow-hidden bg-ink-900 border border-ink-700" style={{ height: 420 }}>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full">
              {/* Grid */}
              {Array.from({ length: 8 }, (_, i) => (
                <line key={`h${i}`} x1={0} y1={i*(H/8)} x2={W} y2={i*(H/8)} stroke="#1E2840" strokeWidth={0.5} />
              ))}
              {Array.from({ length: 12 }, (_, i) => (
                <line key={`v${i}`} x1={i*(W/12)} y1={0} x2={i*(W/12)} y2={H} stroke="#1E2840" strokeWidth={0.5} />
              ))}

              {/* Geofences */}
              {fences.map(gf => {
                const { x, y } = project(gf.lat, gf.lng)
                const r = radiusPx(gf.radius)
                const isActive = gf.status === 'Active'
                const isSelected = selected?.id === gf.id
                return (
                  <g key={gf.id} onClick={() => setSelected(gf === selected ? null : gf)} style={{ cursor: 'pointer' }}>
                    <circle cx={x} cy={y} r={r} fill={gf.color} fillOpacity={isActive ? 0.1 : 0.04}
                      stroke={gf.color} strokeOpacity={isActive ? (isSelected ? 1 : 0.5) : 0.2} strokeWidth={isSelected ? 2 : 1}
                      strokeDasharray={isActive ? 'none' : '4 4'} />
                    <circle cx={x} cy={y} r={4} fill={gf.color} fillOpacity={isActive ? 1 : 0.3} />
                    <text x={x} y={y - r - 6} textAnchor="middle" fill={gf.color} fontSize={9} fontWeight="600" fillOpacity={isActive ? 1 : 0.4}>
                      {gf.name}
                    </text>
                    {isActive && (
                      <text x={x} y={y - r + 4} textAnchor="middle" fill={gf.color} fontSize={7} fillOpacity={0.6}>
                        {gf.radius}km
                      </text>
                    )}
                  </g>
                )
              })}
            </svg>
          </div>
        </div>

        {/* List */}
        <div className="card overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-ink-700">
            <h3 className="text-white font-semibold text-sm">Geofences ({fences.length})</h3>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-ink-800/60">
            {fences.map(gf => (
              <div key={gf.id} onClick={() => setSelected(gf === selected ? null : gf)}
                className={`px-4 py-3 cursor-pointer transition-colors hover:bg-ink-800/30 ${selected?.id === gf.id ? 'bg-ink-800/50 border-l-2' : ''}`}
                style={selected?.id === gf.id ? { borderLeftColor: gf.color } : {}}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: gf.color }} />
                    <span className="text-slate-200 font-semibold text-xs">{gf.name}</span>
                  </div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold border ${gf.status === 'Active' ? 'bg-jade-500/15 text-jade-400 border-jade-500/30' : 'bg-ink-700 text-ink-400 border-ink-600'}`}>{gf.status}</span>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-ink-500 ml-4.5">
                  <span><Circle className="w-2.5 h-2.5 inline mr-1" />{gf.radius}km radius</span>
                  <span><Activity className="w-2.5 h-2.5 inline mr-1" />{gf.events} events</span>
                  <span>{gf.devices} devices</span>
                </div>
                <div className="flex gap-2 mt-2 ml-4.5">
                  <button onClick={e => { e.stopPropagation(); toggle(gf.id) }}
                    className="text-[10px] px-2 py-0.5 rounded-lg border border-ink-700 text-ink-400 hover:border-brand-500/50 hover:text-brand-400 transition-all">
                    {gf.status === 'Active' ? 'Disable' : 'Enable'}
                  </button>
                  <button onClick={e => { e.stopPropagation(); remove(gf.id) }}
                    className="text-[10px] px-2 py-0.5 rounded-lg border border-ink-700 text-rose-500/50 hover:border-rose-500 hover:text-rose-400 transition-all">
                    <Trash2 className="w-2.5 h-2.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Stats */}
          <div className="px-4 py-3 border-t border-ink-700 grid grid-cols-3 gap-2 text-center">
            {[
              { l: 'Active',   v: fences.filter(f=>f.status==='Active').length,   c: 'text-jade-400' },
              { l: 'Inactive', v: fences.filter(f=>f.status==='Inactive').length, c: 'text-ink-400' },
              { l: 'Events',   v: fences.reduce((s,f)=>s+f.events,0),             c: 'text-brand-400' },
            ].map(s => (
              <div key={s.l}>
                <div className={`text-lg font-bold ${s.c}`}>{s.v}</div>
                <div className="text-ink-600 text-[9px]">{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
