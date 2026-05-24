import React, { useState, useEffect, useRef } from 'react'
import { Zap, Radio, Tag, Wifi, MapPin, Signal, Clock, Send, Activity, ChevronRight } from 'lucide-react'
import { useApp } from '../App.jsx'

const SOURCES = ['Mobile App', 'BLE Gateway', 'Manual Entry']
const DEVICE_IDS = [
  'LOC-001','LOC-002','LOC-003','LOC-004','LOC-005','LOC-006','LOC-007','LOC-008','LOC-009','LOC-010',
  'STK-001','STK-002','STK-003','STK-004','STK-005','STK-006','STK-007','STK-008','STK-009','STK-010','STK-011','STK-012',
]
const LOCATIONS = [
  'Andheri East, Mumbai', 'BKC, Mumbai', 'Dadar, Mumbai', 'Colaba, Mumbai', 'Bandra West, Mumbai',
  'Powai, Mumbai', 'Thane, Mumbai', 'Juhu Beach, Mumbai', 'Lower Parel, Mumbai', 'Goregaon, Mumbai',
  'NH-48, Pune Bypass', 'MediCare Depot, Pune', 'Coimbatore Highway', 'Delhi–Jaipur Highway',
  'Ahmedabad Ring Road', 'Jaipur RIICO Area', 'Kolkata Port Access Road', 'Chennai Port',
  'Hyderabad Outskirts', 'Nashik Highway',
]

const rssiColor = r => r > -65 ? '#34D399' : r > -75 ? '#FBBF24' : '#F87171'
const sourceColor = s => ({ 'Mobile App': 'text-brand-400', 'BLE Gateway': 'text-violet-400', 'Manual Entry': 'text-amber-400' }[s] || 'text-ink-400')

function BLEPulse({ active }) {
  return (
    <div className="relative flex items-center justify-center w-24 h-24">
      {active && [1,2,3].map(i => (
        <div key={i} className="absolute rounded-full border-2 border-brand-500/40"
          style={{ width: `${i*30+10}px`, height: `${i*30+10}px`, animation: `bleRing ${1.2+i*0.4}s ease-out infinite ${i*0.3}s` }} />
      ))}
      <div className={`relative z-10 w-14 h-14 rounded-2xl flex items-center justify-center shadow-2xl transition-all duration-300 ${active ? 'gradient-brand shadow-brand-600/40' : 'bg-ink-800 border border-ink-700'}`}>
        <Wifi className={`w-7 h-7 ${active ? 'text-white' : 'text-ink-500'}`} />
      </div>
    </div>
  )
}

export default function DetectionEngine() {
  const { state, dispatch } = useApp()
  const feedRef = useRef(null)

  const [form, setForm] = useState({
    deviceId:   'LOC-001',
    deviceType: 'Locator',
    detectedBy: 'Mobile App',
    location:   '',
    rssi:       '-65',
    confidence: '88',
    note:       '',
  })
  const [pulsing, setPulsing] = useState(false)
  const [lastSent, setLastSent] = useState(null)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const randomize = () => {
    set('rssi',       String(-Math.floor(Math.random()*40+45)))
    set('confidence', String(Math.floor(Math.random()*30+65)))
    set('location',   LOCATIONS[Math.floor(Math.random()*LOCATIONS.length)])
  }

  const submit = e => {
    e.preventDefault()
    const now = new Date()
    const ts  = now.toISOString().slice(0,19).replace('T',' ')
    const id  = `DET-${Date.now()}`

    const evt = {
      id,
      deviceId:   form.deviceId,
      deviceType: form.deviceType,
      detectedBy: form.detectedBy,
      location:   form.location || 'Unknown Location',
      rssi:       parseInt(form.rssi),
      confidence: parseInt(form.confidence),
      timestamp:  ts,
      source:     form.detectedBy === 'Mobile App' ? 'MOBILE_APP' : form.detectedBy === 'BLE Gateway' ? 'GATEWAY' : 'MANUAL',
    }

    dispatch({ type: 'ADD_DETECTION', payload: evt })
    setPulsing(true)
    setLastSent(evt)
    setTimeout(() => setPulsing(false), 2400)
    setTimeout(() => feedRef.current?.scrollTo({ top: 0, behavior: 'smooth' }), 100)
  }

  useEffect(() => {
    const dtype = form.deviceId.startsWith('LOC') ? 'Locator' : 'Sticker'
    set('deviceType', dtype)
  }, [form.deviceId])

  return (
    <div className="space-y-5 animate-slide-up">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Zap className="w-6 h-6 text-jade-400" /> BLE Detection Engine
          </h1>
          <p className="text-ink-500 text-sm mt-0.5">Simulate & log BLE detection events — core intelligence layer</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-jade-500/10 border border-jade-500/20">
          <span className="w-2 h-2 rounded-full bg-jade-400 animate-pulse" />
          <span className="text-jade-400 text-xs font-semibold">{state.detections.length} Events Logged</span>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
        {/* Simulation form */}
        <div className="xl:col-span-2 card p-5">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-white font-semibold">Inject Detection Event</h3>
            <BLEPulse active={pulsing} />
          </div>

          <form onSubmit={submit} className="space-y-4">
            {/* Device ID */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">Device ID</label>
              <select value={form.deviceId} onChange={e => set('deviceId', e.target.value)}
                className="w-full bg-ink-800 border border-ink-700 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-brand-500/50 transition-all">
                <optgroup label="BLE Locators">
                  {DEVICE_IDS.filter(d => d.startsWith('LOC')).map(d => <option key={d}>{d}</option>)}
                </optgroup>
                <optgroup label="Smart Stickers">
                  {DEVICE_IDS.filter(d => d.startsWith('STK')).map(d => <option key={d}>{d}</option>)}
                </optgroup>
              </select>
            </div>

            {/* Device type (auto) */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Device Type</label>
                <div className="flex gap-2">
                  {['Locator','Sticker'].map(t => (
                    <button key={t} type="button" onClick={() => set('deviceType', t)}
                      className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all ${form.deviceType === t ? 'bg-brand-600 border-brand-500 text-white' : 'border-ink-700 text-ink-400 hover:border-ink-600'}`}>
                      {t === 'Locator' ? <><Radio className="w-3 h-3 inline mr-1" />Locator</> : <><Tag className="w-3 h-3 inline mr-1" />Sticker</>}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Detected By */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">Detected By (Source)</label>
              <div className="grid grid-cols-3 gap-2">
                {SOURCES.map(s => (
                  <button key={s} type="button" onClick={() => set('detectedBy', s)}
                    className={`py-2 px-2 rounded-xl text-[10px] font-semibold border transition-all text-center ${form.detectedBy === s ? 'bg-ink-700 border-brand-500/50 text-brand-300' : 'border-ink-700 text-ink-400 hover:border-ink-600'}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Location */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">Location</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-500" />
                  <input value={form.location} onChange={e => set('location', e.target.value)}
                    placeholder="e.g. Andheri East, Mumbai"
                    list="loc-suggestions"
                    className="w-full bg-ink-800 border border-ink-700 rounded-xl pl-9 pr-3 py-2.5 text-xs text-slate-200 placeholder-ink-500 focus:outline-none focus:border-brand-500/50 transition-all" />
                  <datalist id="loc-suggestions">
                    {LOCATIONS.map(l => <option key={l} value={l} />)}
                  </datalist>
                </div>
              </div>
            </div>

            {/* RSSI + Confidence */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">RSSI (dBm)</label>
                <input type="number" min="-100" max="-30" value={form.rssi} onChange={e => set('rssi', e.target.value)}
                  className="w-full bg-ink-800 border border-ink-700 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-brand-500/50 transition-all" />
                <div className="mt-1 text-[10px]" style={{color: rssiColor(parseInt(form.rssi))}}>
                  {parseInt(form.rssi) > -65 ? 'Strong signal' : parseInt(form.rssi) > -75 ? 'Medium signal' : 'Weak signal'}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Confidence %</label>
                <input type="number" min="0" max="100" value={form.confidence} onChange={e => set('confidence', e.target.value)}
                  className="w-full bg-ink-800 border border-ink-700 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-brand-500/50 transition-all" />
                <div className="mt-1 h-1.5 bg-ink-700 rounded-full">
                  <div className="h-1.5 rounded-full bg-jade-500 transition-all" style={{ width: `${form.confidence}%` }} />
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button type="button" onClick={randomize}
                className="flex-1 py-2.5 border border-ink-700 hover:border-ink-600 text-ink-400 hover:text-slate-300 text-xs font-semibold rounded-xl transition-all">
                Randomize
              </button>
              <button type="submit"
                className="flex-1 py-2.5 gradient-brand text-white text-xs font-bold rounded-xl shadow-lg shadow-brand-600/25 hover:opacity-90 transition-all flex items-center justify-center gap-2">
                <Send className="w-3.5 h-3.5" /> Inject Detection
              </button>
            </div>
          </form>

          {lastSent && (
            <div className="mt-4 p-3 rounded-xl bg-jade-500/10 border border-jade-500/20 text-xs">
              <div className="text-jade-400 font-semibold mb-1">Detection injected!</div>
              <div className="text-ink-400">{lastSent.deviceId} · {lastSent.location} · {lastSent.rssi} dBm · {lastSent.confidence}% conf</div>
            </div>
          )}
        </div>

        {/* Live Detection Feed */}
        <div className="xl:col-span-3 card flex flex-col">
          <div className="flex items-center justify-between px-5 py-3 border-b border-ink-700">
            <div>
              <h3 className="text-white font-semibold">Live Detection Feed</h3>
              <p className="text-ink-500 text-[10px] mt-0.5">All BLE detection events — newest first</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-jade-400 rounded-full animate-pulse" />
              <span className="text-jade-400 text-[10px] font-bold uppercase">Live</span>
            </div>
          </div>

          <div ref={feedRef} className="flex-1 overflow-y-auto divide-y divide-ink-800/60 max-h-[520px]">
            {state.detections.map((d, i) => (
              <div key={d.id} className={`px-5 py-3.5 hover:bg-ink-800/30 transition-colors ${i === 0 && pulsing ? 'bg-jade-500/5 border-l-2 border-jade-500' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`p-1.5 rounded-lg flex-shrink-0 ${d.deviceType === 'Locator' ? 'bg-brand-600/20' : 'bg-violet-600/20'}`}>
                      {d.deviceType === 'Locator'
                        ? <Radio className="w-3 h-3 text-brand-400" />
                        : <Tag className="w-3 h-3 text-violet-400" />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`font-mono text-[11px] font-bold ${d.deviceType === 'Locator' ? 'text-brand-400' : 'text-violet-400'}`}>{d.deviceId}</span>
                        <span className="text-ink-600 text-[10px]">{d.id}</span>
                      </div>
                      <div className="text-slate-400 text-xs truncate mt-0.5">{d.location}</div>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-ink-500 text-[10px]">{d.timestamp.split(' ')[1]}</div>
                    <div className={`text-[10px] font-semibold mt-0.5 ${sourceColor(d.detectedBy)}`}>{d.detectedBy}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-2">
                  <div className="flex items-center gap-1">
                    <Signal className="w-3 h-3 text-ink-500" />
                    <span className="text-[10px] font-semibold" style={{color: rssiColor(d.rssi)}}>{d.rssi} dBm</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Activity className="w-3 h-3 text-ink-500" />
                    <span className="text-[10px] text-jade-500 font-semibold">{d.confidence}% conf.</span>
                  </div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${d.source === 'MOBILE_APP' ? 'bg-brand-600/20 text-brand-400' : d.source === 'GATEWAY' ? 'bg-violet-600/20 text-violet-400' : 'bg-amber-600/20 text-amber-400'}`}>
                    {d.source}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Stats strip */}
          <div className="px-5 py-3 border-t border-ink-700 flex items-center gap-5">
            {[
              { l: 'Mobile App',   v: state.detections.filter(d => d.source === 'MOBILE_APP').length, c: 'text-brand-400' },
              { l: 'Gateway',      v: state.detections.filter(d => d.source === 'GATEWAY').length,    c: 'text-violet-400' },
              { l: 'Manual Entry', v: state.detections.filter(d => d.source === 'MANUAL').length,      c: 'text-amber-400' },
            ].map(s => (
              <div key={s.l} className="text-center">
                <div className={`text-sm font-bold ${s.c}`}>{s.v}</div>
                <div className="text-ink-500 text-[10px]">{s.l}</div>
              </div>
            ))}
            <div className="ml-auto text-[10px] text-ink-600">Total: {state.detections.length} events</div>
          </div>
        </div>
      </div>

      {/* How it works */}
      <div className="card p-5">
        <h3 className="text-white font-semibold mb-3">How BLE Detection Works</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { step: '01', title: 'BLE Broadcast', desc: 'Every device continuously broadcasts a unique BLE advertisement packet at 100–1000ms intervals.' },
            { step: '02', title: 'Detection Sources', desc: 'Mobile apps, dedicated BLE gateways, or manual entry receive the broadcast and log the detection event with RSSI.' },
            { step: '03', title: 'Last-Seen Intelligence', desc: 'Each detection updates the device\'s last-seen location. Devices not seen >12h → At Risk. >24h → Missing.' },
          ].map(s => (
            <div key={s.step} className="flex gap-3">
              <div className="text-2xl font-black text-ink-700 flex-shrink-0">{s.step}</div>
              <div>
                <div className="text-slate-200 font-semibold text-sm mb-1">{s.title}</div>
                <div className="text-ink-500 text-xs leading-relaxed">{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
