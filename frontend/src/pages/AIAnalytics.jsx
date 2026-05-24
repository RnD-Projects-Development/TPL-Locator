import React from 'react'
import { Activity, Battery, Zap, AlertTriangle, TrendingUp, Radio, Tag } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts'
import { useApp } from '../App.jsx'
import { batteryDistrib, deviceStatusTrend, detectionsByHour } from '../data/mockData.js'

const TT = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="glass rounded-xl px-3 py-2 text-xs shadow-xl">
      <div className="text-ink-500 mb-1">{label}</div>
      {payload.map((p,i) => <div key={i} className="font-semibold" style={{color:p.color}}>{p.name}: {p.value}</div>)}
    </div>
  )
}

export default function Analytics() {
  const { state } = useApp()

  const allDevices = [...state.locators, ...state.stickers]
  const active     = allDevices.filter(d => d.status === 'Active' || d.status === 'In Transit').length
  const missing    = allDevices.filter(d => d.status === 'Missing' || d.status === 'Lost').length
  const lowBatt    = allDevices.filter(d => d.battery <= 20)
  const topDevices = allDevices
    .filter(d => (d.detections || 0) > 0)
    .sort((a,b) => (b.detections||0) - (a.detections||0))
    .slice(0, 6)

  return (
    <div className="space-y-5 animate-slide-up">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Activity className="w-6 h-6 text-violet-400" /> Analytics
        </h1>
        <p className="text-ink-500 text-sm mt-0.5">Detection patterns, battery health, and fleet overview</p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { icon: Zap,           label: 'Detections Today',   value: state.detections.length,    color: 'text-brand-400',  bg: 'bg-brand-500/10 border-brand-500/20' },
          { icon: Activity,      label: 'Active Devices',     value: active,                     color: 'text-jade-400',   bg: 'bg-jade-500/10 border-jade-500/20' },
          { icon: AlertTriangle, label: 'Missing / Lost',     value: missing,                    color: 'text-rose-400',   bg: 'bg-rose-500/10 border-rose-500/20' },
          { icon: Battery,       label: 'Low Battery',        value: lowBatt.length,             color: 'text-amber-400',  bg: 'bg-amber-500/10 border-amber-500/20' },
        ].map(s => (
          <div key={s.label} className={`card p-4 border ${s.bg} flex items-center gap-3`}>
            <s.icon className={`w-5 h-5 ${s.color} flex-shrink-0`} />
            <div>
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-ink-500 text-xs mt-0.5">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Detection by hour */}
        <div className="card p-5">
          <h3 className="text-white font-semibold mb-1">Detection Activity "" Today</h3>
          <p className="text-ink-500 text-xs mb-4">BLE scan events by hour</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={detectionsByHour}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E2840" vertical={false} />
              <XAxis dataKey="h" tick={{ fill:'#3D4F6E', fontSize:9 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill:'#3D4F6E', fontSize:9 }} axisLine={false} tickLine={false} />
              <Tooltip content={<TT />} />
              <Bar dataKey="count" name="Detections" fill="#6366F1" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* 7-day trend */}
        <div className="card p-5">
          <h3 className="text-white font-semibold mb-1">7-Day Status Trend</h3>
          <p className="text-ink-500 text-xs mb-4">Active vs missing devices per day</p>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={deviceStatusTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E2840" vertical={false} />
              <XAxis dataKey="day" tick={{ fill:'#3D4F6E', fontSize:9 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill:'#3D4F6E', fontSize:9 }} axisLine={false} tickLine={false} />
              <Tooltip content={<TT />} />
              <Line type="monotone" dataKey="active"  name="Active"  stroke="#6366F1" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="atRisk"  name="At Risk" stroke="#F59E0B" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
              <Line type="monotone" dataKey="missing" name="Missing" stroke="#EF4444" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Battery distribution */}
        <div className="card p-5">
          <h3 className="text-white font-semibold mb-1">Battery Health Distribution</h3>
          <p className="text-ink-500 text-xs mb-4">All {allDevices.length} devices</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={batteryDistrib}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E2840" vertical={false} />
              <XAxis dataKey="range" tick={{ fill:'#3D4F6E', fontSize:9 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill:'#3D4F6E', fontSize:9 }} axisLine={false} tickLine={false} />
              <Tooltip content={<TT />} />
              <Bar dataKey="count" name="Devices" fill="#F59E0B" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
          {lowBatt.length > 0 && (
            <div className="mt-3 space-y-1">
              <div className="text-xs text-amber-400 font-semibold mb-1.5">Needs attention:</div>
              {lowBatt.map(d => (
                <div key={d.id} className="flex items-center justify-between text-xs text-ink-400 px-2 py-1 rounded-lg bg-amber-500/8">
                  <div className="flex items-center gap-2">
                    {d.cargoName ? <Tag className="w-3 h-3 text-violet-400" /> : <Radio className="w-3 h-3 text-brand-400" />}
                    <span>{d.userName || d.cargoName}</span>
                    <span className="font-mono text-ink-600">{d.id}</span>
                  </div>
                  <span className="text-rose-400 font-bold">{d.battery}%</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Most active devices */}
        <div className="card p-5">
          <h3 className="text-white font-semibold mb-1">Most Active Devices</h3>
          <p className="text-ink-500 text-xs mb-4">By total detection count</p>
          <div className="space-y-2">
            {topDevices.map((d, i) => {
              const max = topDevices[0]?.detections || 1
              const isLoc = !!d.userName
              return (
                <div key={d.id} className="flex items-center gap-3">
                  <span className="text-ink-600 text-xs w-4 text-right">{i+1}</span>
                  <div className="flex items-center gap-1.5 w-32 flex-shrink-0">
                    {isLoc ? <Radio className="w-3 h-3 text-brand-400 flex-shrink-0" /> : <Tag className="w-3 h-3 text-violet-400 flex-shrink-0" />}
                    <span className="text-gray-400 text-xs truncate">{d.userName || d.cargoName}</span>
                  </div>
                  <div className="flex-1 h-1.5 bg-ink-700 rounded-full">
                    <div className="h-1.5 rounded-full bg-brand-500 transition-all" style={{ width: `${(d.detections/max)*100}%` }} />
                  </div>
                  <span className={`text-xs font-bold w-8 text-right ${isLoc ? 'text-brand-400' : 'text-violet-400'}`}>{d.detections}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Detection sources breakdown */}
      <div className="card p-5">
        <h3 className="text-white font-semibold mb-4">Detection Source Breakdown</h3>
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Mobile App',    key: 'MOBILE_APP', color: 'bg-brand-500',  text: 'text-brand-400' },
            { label: 'BLE Gateway',   key: 'GATEWAY',    color: 'bg-violet-500', text: 'text-violet-400' },
            { label: 'Manual Entry',  key: 'MANUAL',     color: 'bg-amber-500',  text: 'text-amber-400' },
          ].map(s => {
            const count = state.detections.filter(d => d.source === s.key).length
            const pct   = state.detections.length ? Math.round(count / state.detections.length * 100) : 0
            return (
              <div key={s.key} className="text-center card p-4">
                <div className={`text-2xl font-bold ${s.text}`}>{count}</div>
                <div className="text-ink-500 text-xs mt-0.5 mb-2">{s.label}</div>
                <div className="h-1.5 bg-ink-700 rounded-full">
                  <div className={`h-1.5 rounded-full ${s.color} transition-all`} style={{ width: `${pct}%` }} />
                </div>
                <div className="text-ink-600 text-[10px] mt-1">{pct}% of total</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

