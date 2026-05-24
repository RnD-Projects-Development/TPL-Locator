import React, { useState } from 'react'
import { Settings, Users, Building2, Radio, Tag, Shield, Activity, Plus, Edit2, ToggleLeft, ToggleRight } from 'lucide-react'
import Badge from '../components/common/Badge.jsx'
import DataTable from '../components/common/DataTable.jsx'
import { useApp } from '../App.jsx'
import { companies, users } from '../data/mockData.js'

const TABS = [
  { id: 'companies', label: 'Companies',   icon: Building2 },
  { id: 'users',     label: 'Users',       icon: Users },
  { id: 'system',    label: 'System',      icon: Settings },
]

const planBadge = p => ({
  Enterprise: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  Business:   'bg-brand-500/20 text-brand-300 border-brand-500/20',
  Starter:    'bg-ink-600/60 text-slate-400 border-ink-500/40',
}[p] || 'bg-ink-700 text-slate-400 border-ink-600')

export default function AdminPanel() {
  const { state, user } = useApp()
  const [tab, setTab] = useState('companies')

  const devicesByCompany = companies.map(c => ({
    ...c,
    locators: state.locators.filter(l => l.company === c.name).length,
    stickers: state.stickers.filter(s => s.company === c.name).length,
  }))

  const companyColumns = [
    { key: 'id',       label: 'ID',       render: v => <span className="font-mono text-brand-400 text-xs">{v}</span> },
    { key: 'name',     label: 'Company',  render: v => <span className="text-slate-200 font-semibold text-xs">{v}</span> },
    { key: 'industry', label: 'Industry', render: v => <span className="text-ink-400 text-xs">{v}</span> },
    { key: 'plan',     label: 'Plan',     render: v => <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${planBadge(v)}`}>{v}</span> },
    { key: 'locators', label: 'Locators', render: v => <span className="text-brand-400 font-semibold text-xs">{v}</span> },
    { key: 'stickers', label: 'Stickers', render: v => <span className="text-violet-400 font-semibold text-xs">{v}</span> },
    { key: 'status',   label: 'Status',   render: v => <Badge status={v === 'Active' ? 'Active-user' : 'Suspended'} size="xs" /> },
  ]

  const userColumns = [
    { key: 'id',        label: 'ID',       render: v => <span className="font-mono text-brand-400 text-xs">{v}</span> },
    { key: 'name',      label: 'Name',     render: v => <span className="text-slate-200 font-semibold text-xs">{v}</span> },
    { key: 'email',     label: 'Email',    render: v => <span className="text-ink-400 text-xs">{v}</span> },
    { key: 'role',      label: 'Role',     render: v => {
      const cls = { 'Super Admin': 'text-violet-400', 'Company Admin': 'text-brand-400', 'Operator': 'text-jade-400', 'Viewer': 'text-ink-400' }[v] || 'text-ink-400'
      return <span className={`text-xs font-semibold ${cls}`}>{v}</span>
    }},
    { key: 'company',   label: 'Company',  render: v => <span className="text-ink-400 text-xs">{v}</span> },
    { key: 'status',    label: 'Status',   render: v => <Badge status={v === 'Active' ? 'Active-user' : 'Inactive'} size="xs" /> },
    { key: 'lastLogin', label: 'Last Login', render: v => <span className="text-ink-500 text-xs">{v}</span> },
  ]

  const systemHealth = [
    { label: 'BLE Detection Engine',  status: 'Operational', uptime: '99.9%', color: 'text-jade-400' },
    { label: 'Alert Processing',       status: 'Operational', uptime: '99.7%', color: 'text-jade-400' },
    { label: 'Geofence Monitor',       status: 'Operational', uptime: '98.2%', color: 'text-jade-400' },
    { label: 'AI Analytics Engine',    status: 'Operational', uptime: '97.8%', color: 'text-jade-400' },
    { label: 'Gateway Sync',           status: 'Degraded',    uptime: '94.1%', color: 'text-amber-400' },
    { label: 'Mobile App Push Service',status: 'Operational', uptime: '99.5%', color: 'text-jade-400' },
  ]

  return (
    <div className="space-y-5 animate-slide-up">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Settings className="w-6 h-6 text-brand-400" /> Admin Panel
          </h1>
          <p className="text-ink-500 text-sm mt-0.5">Super Admin — Multi-tenant management & system health</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-violet-500/10 border border-violet-500/20">
          <Shield className="w-3.5 h-3.5 text-violet-400" />
          <span className="text-violet-400 text-xs font-semibold">{user?.role || 'Super Admin'}</span>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { l: 'Companies',       v: companies.length,                                  c: 'text-violet-400', icon: Building2 },
          { l: 'Total Users',     v: users.length,                                      c: 'text-brand-400',  icon: Users },
          { l: 'BLE Locators',    v: state.locators.length,                             c: 'text-jade-400',   icon: Radio },
          { l: 'Smart Stickers',  v: state.stickers.length,                             c: 'text-cyan-400',   icon: Tag },
        ].map(s => (
          <div key={s.l} className="card p-4 flex items-center gap-3">
            <s.icon className={`w-5 h-5 ${s.c} flex-shrink-0`} />
            <div>
              <div className={`text-2xl font-bold ${s.c}`}>{s.v}</div>
              <div className="text-ink-500 text-xs">{s.l}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-ink-800 rounded-xl border border-ink-700 w-fit">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${tab === t.id ? 'bg-brand-600 text-white' : 'text-ink-400 hover:text-slate-300'}`}>
            <t.icon className="w-3.5 h-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {/* Companies tab */}
      {tab === 'companies' && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold">Tenant Companies</h3>
            <button className="flex items-center gap-2 px-3 py-1.5 gradient-brand text-white text-xs font-semibold rounded-lg hover:opacity-90 transition-all">
              <Plus className="w-3.5 h-3.5" /> Add Company
            </button>
          </div>
          <DataTable columns={companyColumns} data={devicesByCompany} pageSize={10} searchPlaceholder="Search companies…" />
        </div>
      )}

      {/* Users tab */}
      {tab === 'users' && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold">User Management</h3>
            <button className="flex items-center gap-2 px-3 py-1.5 gradient-brand text-white text-xs font-semibold rounded-lg hover:opacity-90 transition-all">
              <Plus className="w-3.5 h-3.5" /> Invite User
            </button>
          </div>
          <DataTable columns={userColumns} data={users} pageSize={10} searchPlaceholder="Search users…" />
        </div>
      )}

      {/* System tab */}
      {tab === 'system' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {/* Service health */}
          <div className="card p-5">
            <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
              <Activity className="w-4 h-4 text-jade-400" /> Service Health
            </h3>
            <div className="space-y-3">
              {systemHealth.map(s => (
                <div key={s.label} className="flex items-center justify-between p-3 rounded-xl bg-ink-800/60">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${s.status === 'Operational' ? 'bg-jade-400' : 'bg-amber-400 animate-pulse'}`} />
                    <span className="text-slate-300 text-xs font-medium">{s.label}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className={s.color}>{s.status}</span>
                    <span className="text-ink-500">{s.uptime} uptime</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Platform settings */}
          <div className="card p-5">
            <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
              <Settings className="w-4 h-4 text-brand-400" /> Platform Settings
            </h3>
            <div className="space-y-4">
              {[
                { label: 'Missing threshold (At Risk)',  value: '12 hours',   desc: 'Devices not seen beyond this time are flagged At Risk' },
                { label: 'Missing threshold (Missing)',  value: '24 hours',   desc: 'Devices not seen beyond this time are flagged Missing' },
                { label: 'BLE scan interval',           value: '500ms',      desc: 'Default scan interval for gateway devices' },
                { label: 'Alert cooldown period',       value: '30 minutes', desc: 'Minimum time between repeat alerts for same device' },
                { label: 'Default confidence threshold', value: '70%',       desc: 'Minimum AI confidence to register a detection event' },
                { label: 'Max detection history',       value: '90 days',    desc: 'Detection events older than this are archived' },
              ].map(s => (
                <div key={s.label} className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-slate-300 text-xs font-semibold">{s.label}</div>
                    <div className="text-ink-500 text-[10px] mt-0.5">{s.desc}</div>
                  </div>
                  <div className="flex-shrink-0 px-2.5 py-1 bg-ink-800 border border-ink-700 rounded-lg text-brand-400 text-xs font-semibold whitespace-nowrap">
                    {s.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Feature toggles */}
          <div className="card p-5 xl:col-span-2">
            <h3 className="text-white font-semibold mb-4">Feature Flags</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { label: 'AI Analytics Engine',     enabled: true  },
                { label: 'Geofence Monitoring',     enabled: true  },
                { label: 'Missing Device Alerts',   enabled: true  },
                { label: 'Low Battery Alerts',      enabled: true  },
                { label: 'Detection Feed LIVE',     enabled: true  },
                { label: 'Mobile App Detection',    enabled: true  },
                { label: 'Gateway Auto-Detect',     enabled: true  },
                { label: 'Route Replay Export',     enabled: false },
                { label: 'Multi-Language Support',  enabled: false },
              ].map(f => (
                <div key={f.label} className="flex items-center justify-between p-3 rounded-xl bg-ink-800/60 border border-ink-700">
                  <span className="text-slate-300 text-xs font-medium">{f.label}</span>
                  <div className={`flex items-center gap-1.5 text-[10px] font-semibold ${f.enabled ? 'text-jade-400' : 'text-ink-500'}`}>
                    {f.enabled ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                    {f.enabled ? 'ON' : 'OFF'}
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
