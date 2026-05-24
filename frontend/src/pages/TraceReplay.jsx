import React, { useState, useMemo } from 'react'
import { History, Play, Pause, SkipBack, Radio, Tag, MapPin, Clock, Signal, Activity } from 'lucide-react'
import Badge from '../components/common/Badge.jsx'
import { useApp } from '../App.jsx'

const rssiColor = r => r > -65 ? '#34D399' : r > -75 ? '#FBBF24' : '#F87171'
const sourceColor = s => ({ 'Mobile App': 'text-brand-400', 'BLE Gateway': 'text-violet-400', 'Gateway': 'text-violet-400', 'Manual Entry': 'text-amber-400' }[s] || 'text-ink-400')

export default function TraceReplay() {
  const { state } = useApp()

  const allDevices = [
    ...state.locators.map(l => ({ id: l.id, label: `${l.id} — ${l.userName}`, type: 'locator' })),
    ...state.stickers.map(s => ({ id: s.id, label: `${s.id} — ${s.cargoName}`, type: 'sticker' })),
  ]

  const [deviceId, setDeviceId] = useState(allDevices[0]?.id || '')
  const [playing, setPlaying]   = useState(false)
  const [cursor, setCursor]     = useState(0)

  const events = useMemo(() =>
    state.detections
      .filter(d => d.deviceId === deviceId)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    [state.detections, deviceId]
  )

  const device = [...state.locators, ...state.stickers].find(d => d.id === deviceId)

  // Auto-play
  React.useEffect(() => {
    if (!playing) return
    if (cursor >= events.length - 1) { setPlaying(false); return }
    const id = setTimeout(() => setCursor(c => c + 1), 1200)
    return () => clearTimeout(id)
  }, [playing, cursor, events.length])

  const currentEvent = events[cursor] || null

  return (
    <div className="space-y-5 animate-slide-up">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <History className="w-6 h-6 text-cyan-400" /> Trace & Replay
        </h1>
        <p className="text-ink-500 text-sm mt-0.5">Replay detection history for any device — step through BLE events</p>
      </div>

      {/* Device selector */}
      <div className="card p-4 flex items-center gap-4 flex-wrap">
        <div className="flex-1 min-w-[220px]">
          <label className="text-xs text-ink-500 font-semibold block mb-1.5">Select Device</label>
          <select value={deviceId} onChange={e => { setDeviceId(e.target.value); setCursor(0); setPlaying(false) }}
            className="w-full bg-ink-800 border border-ink-700 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-brand-500/50 transition-all">
            <optgroup label="BLE Locators">
              {allDevices.filter(d => d.type === 'locator').map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
            </optgroup>
            <optgroup label="Smart Stickers">
              {allDevices.filter(d => d.type === 'sticker').map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
            </optgroup>
          </select>
        </div>
        {device && (
          <div className="flex items-center gap-3">
            <Badge status={device.status} />
            <span className="text-ink-500 text-xs">{events.length} detection events</span>
          </div>
        )}
      </div>

      {events.length === 0 ? (
        <div className="card py-20 text-center">
          <History className="w-10 h-10 text-ink-700 mx-auto mb-3" />
          <p className="text-ink-500 text-sm">No detection events for this device</p>
          <p className="text-ink-600 text-xs mt-1">Use the Detection Engine to inject events</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          {/* Player + current event */}
          <div className="xl:col-span-1 space-y-4">
            {/* Player card */}
            <div className="card p-5">
              <h3 className="text-white font-semibold mb-4">Replay Controls</h3>

              {/* Progress */}
              <div className="mb-4">
                <div className="flex justify-between text-[10px] text-ink-500 mb-1.5">
                  <span>Event {cursor + 1} of {events.length}</span>
                  <span>{Math.round((cursor / Math.max(events.length - 1, 1)) * 100)}%</span>
                </div>
                <input type="range" min={0} max={Math.max(events.length - 1, 0)} value={cursor}
                  onChange={e => { setCursor(Number(e.target.value)); setPlaying(false) }}
                  className="w-full h-1.5 rounded-full bg-ink-700 appearance-none cursor-pointer"
                  style={{ accentColor: '#6366F1' }} />
              </div>

              {/* Controls */}
              <div className="flex items-center justify-center gap-3">
                <button onClick={() => { setCursor(0); setPlaying(false) }}
                  className="p-2.5 rounded-xl bg-ink-800 hover:bg-ink-700 transition-colors text-ink-400 hover:text-slate-300">
                  <SkipBack className="w-4 h-4" />
                </button>
                <button onClick={() => setPlaying(p => !p)}
                  className="p-3 rounded-xl gradient-brand text-white shadow-lg shadow-brand-600/25 hover:opacity-90 transition-all">
                  {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                </button>
              </div>

              {/* Speed note */}
              <p className="text-center text-ink-600 text-[10px] mt-3">1.2s per event</p>
            </div>

            {/* Current event detail */}
            {currentEvent && (
              <div className="card p-4 border-brand-500/30 bg-brand-600/5">
                <div className="text-ink-500 text-[10px] uppercase font-semibold mb-2">Current Event</div>
                <div className="space-y-2">
                  {[
                    { l: 'Event ID',    v: currentEvent.id },
                    { l: 'Location',    v: currentEvent.location },
                    { l: 'Detected By', v: currentEvent.detectedBy },
                    { l: 'Timestamp',   v: currentEvent.timestamp },
                    { l: 'RSSI',        v: `${currentEvent.rssi} dBm` },
                    { l: 'Confidence',  v: `${currentEvent.confidence}%` },
                  ].map(i => (
                    <div key={i.l} className="flex justify-between text-xs">
                      <span className="text-ink-500">{i.l}</span>
                      <span className="text-slate-300 font-semibold text-right max-w-[140px] truncate">{i.v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Timeline */}
          <div className="xl:col-span-2 card overflow-hidden flex flex-col">
            <div className="px-5 py-3 border-b border-ink-700">
              <h3 className="text-white font-semibold text-sm">Detection Timeline</h3>
              <p className="text-ink-500 text-[10px] mt-0.5">Full BLE event history for {deviceId}</p>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-ink-800/60">
              {events.map((evt, i) => (
                <div key={evt.id} onClick={() => { setCursor(i); setPlaying(false) }}
                  className={`flex gap-4 px-5 py-3 cursor-pointer transition-colors hover:bg-ink-800/30 ${i === cursor ? 'bg-brand-600/8 border-l-2 border-brand-500' : ''}`}>
                  {/* Timeline dot */}
                  <div className="flex flex-col items-center pt-1 flex-shrink-0">
                    <div className={`w-3 h-3 rounded-full border-2 flex-shrink-0 transition-all ${i === cursor ? 'bg-brand-500 border-brand-400 scale-125' : i < cursor ? 'bg-brand-800 border-brand-700' : 'bg-ink-800 border-ink-600'}`} />
                    {i < events.length - 1 && <div className={`w-px flex-1 mt-1 ${i < cursor ? 'bg-brand-800' : 'bg-ink-800'}`} style={{minHeight: 24}} />}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 pb-1">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-slate-300 text-xs font-semibold">{evt.location}</div>
                        <div className={`text-[10px] mt-0.5 ${sourceColor(evt.detectedBy)}`}>{evt.detectedBy}</div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-ink-500 text-[10px]">{evt.timestamp.split(' ')[1]}</div>
                        <div className="text-[10px] font-mono text-ink-600">{evt.id}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-[10px] font-semibold" style={{color: rssiColor(evt.rssi)}}>{evt.rssi} dBm</span>
                      <span className="text-[10px] text-jade-500 font-semibold">{evt.confidence}% conf</span>
                      {i === cursor && <span className="text-[10px] px-1.5 py-0.5 bg-brand-600/20 text-brand-400 rounded-full font-semibold">Current</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
