import React, { useState } from 'react'
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Search } from 'lucide-react'

export default function DataTable({ columns, data, pageSize = 10, searchPlaceholder = 'Search…' }) {
  const [page, setPage]       = useState(1)
  const [query, setQuery]     = useState('')
  const [sortKey, setSortKey] = useState(null)
  const [sortDir, setSortDir] = useState('asc')

  const filtered = data.filter(r =>
    !query || Object.values(r).some(v => String(v ?? '').toLowerCase().includes(query.toLowerCase()))
  )
  const sorted = sortKey
    ? [...filtered].sort((a, b) => {
        const av = String(a[sortKey] ?? ''), bv = String(b[sortKey] ?? '')
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      })
    : filtered

  const total = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage = Math.min(page, total)
  const paged = sorted.slice((safePage - 1) * pageSize, safePage * pageSize)

  const sort = (k) => { if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortKey(k); setSortDir('asc') }; setPage(1) }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-500" />
        <input value={query} onChange={e => { setQuery(e.target.value); setPage(1) }}
          placeholder={searchPlaceholder}
          className="w-full max-w-xs bg-ink-800 border border-ink-700 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-300 placeholder-ink-500 focus:outline-none focus:border-brand-500/50 transition-all" />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-ink-700">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-ink-800/80">
              {columns.map((col, ci) => (
                <th key={ci} onClick={() => col.sortable !== false && sort(col.key)}
                  className={`px-4 py-3 text-left font-semibold text-ink-500 uppercase tracking-wider whitespace-nowrap ${col.sortable !== false ? 'cursor-pointer hover:text-slate-300' : ''}`}>
                  <div className="flex items-center gap-1">
                    {col.label}
                    {col.sortable !== false && sortKey === col.key && (
                      sortDir === 'asc' ? <ChevronUp className="w-3 h-3 text-brand-400" /> : <ChevronDown className="w-3 h-3 text-brand-400" />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-800">
            {paged.length === 0 && (
              <tr><td colSpan={columns.length} className="py-12 text-center text-ink-500">No records found</td></tr>
            )}
            {paged.map((row, ri) => (
              <tr key={ri} className="trow transition-colors">
                {columns.map((col, ci) => (
                  <td key={ci} className="px-4 py-3 whitespace-nowrap">
                    {col.render ? col.render(row[col.key], row) : <span className="text-slate-300">{row[col.key] ?? '—'}</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-xs text-ink-500">
        <span>Showing {Math.min((safePage-1)*pageSize+1, sorted.length)}–{Math.min(safePage*pageSize, sorted.length)} of {sorted.length}</span>
        <div className="flex items-center gap-1">
          <button onClick={() => setPage(p => Math.max(1,p-1))} disabled={safePage===1}
            className="p-1.5 rounded-lg hover:bg-ink-800 disabled:opacity-30 transition-colors"><ChevronLeft className="w-3.5 h-3.5" /></button>
          {Array.from({ length: Math.min(5, total) }, (_, i) => Math.max(1, Math.min(safePage-2,total-4))+i).filter(p=>p<=total).map(p => (
            <button key={p} onClick={() => setPage(p)}
              className={`w-7 h-7 rounded-lg text-xs font-medium transition-colors ${p===safePage?'bg-brand-600 text-white':'hover:bg-ink-800'}`}>{p}</button>
          ))}
          <button onClick={() => setPage(p => Math.min(total,p+1))} disabled={safePage===total}
            className="p-1.5 rounded-lg hover:bg-ink-800 disabled:opacity-30 transition-colors"><ChevronRight className="w-3.5 h-3.5" /></button>
        </div>
      </div>
    </div>
  )
}
