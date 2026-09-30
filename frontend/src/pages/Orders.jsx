/**
 * Orders — locator purchase invoices, admin only.
 *
 * Every row comes from the MyTrakker e-commerce receipt service, which only
 * ever returns payments that have already been collected. There is therefore
 * no order-state column (no paid / unpaid / in-progress): the page reports
 * what was bought, by whom, for how much and when.
 *
 * Search, sort and paging are all server-side (`/api/orders`) so the page never
 * holds the full invoice history in memory. The table carries the columns an
 * admin scans; every remaining field lives in the per-invoice drawer.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Pagination from '@mui/material/Pagination'
import Stack from '@mui/material/Stack'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import {
  Search, X, RefreshCw, ShoppingBag, Download, Receipt, CreditCard,
  MapPin, Mail, Phone, Building2, Hash, Package, Calendar, Fingerprint,
  ChevronUp, ChevronDown, AlertTriangle,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerBody, DrawerFooter,
} from '../components/ui/Drawer.jsx'
import { ThemeContext } from '../components/layout/Layout.jsx'
import TPLLoader from '../components/TPLLoader.jsx'
import { useCityTag } from '../hooks/useCityTag.js'
import { downloadInvoicePdf } from '../utils/invoicePdf.js'

const PAGE_SIZE = 12
const EXPORT_LIMIT = 500          // matches the backend's MAX_LIMIT
const EXPORT_MAX_PAGES = 60       // safety bound → up to 30k invoices per export

/* ── Formatting ─────────────────────────────────────────────────────────────
   Receipt timestamps are gateway wall-clock, normalised server-side to a naive
   ISO string. They are rendered as-is — parsing them as UTC would shift every
   invoice by the local offset. */

function fmtDate(iso, raw) {
  if (!iso) return raw || '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso)
  if (!m) return raw || iso
  const [, y, mo, d, h, min] = m
  const hour = Number(h)
  const suffix = hour >= 12 ? 'PM' : 'AM'
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  return `${d}/${mo}/${y} ${String(h12).padStart(2, '0')}:${min} ${suffix}`
}

function fmtDateOnly(iso, raw) {
  if (!iso) return raw || '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (raw || iso)
}

// The receipt payload carries no currency code (amounts arrive as plain strings
// like "50"), so the unit is declared here rather than inferred per row. One
// constant so a future multi-currency payload has a single place to change.
const CURRENCY = 'PKR'

/** Bare figure with thousands separators — for dense cells whose column header
 *  already carries the unit. */
function fmtAmount(v) {
  if (v === null || v === undefined || v === '') return '—'
  const n = Number(v)
  if (!Number.isFinite(n)) return String(v)
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

/** Figure with the currency attached — for standalone amounts that have no
 *  column header to lean on (summary tile, drawer header, detail rows). */
function fmtMoney(v) {
  const text = fmtAmount(v)
  return text === '—' ? text : `${CURRENCY} ${text}`
}

const dash = (v) => (v === null || v === undefined || v === '' ? '—' : String(v))

function initialsOf(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return parts.slice(0, 2).map(p => p[0]).join('').toUpperCase()
}

const COLUMNS = [
  { key: 'invoice_no',    label: 'Invoice',  sortable: true  },
  { key: 'customer_name', label: 'Customer', sortable: true  },
  { key: 'product',       label: 'Product',  sortable: true  },
  { key: 'units',         label: 'Units',    sortable: true  },
  { key: 'total_amount',  label: `Amount (${CURRENCY})`, sortable: true  },
  { key: 'payment_type',  label: 'Payment',  sortable: false },
  { key: 'city',          label: 'City',     sortable: true  },
  { key: 'payment_date',  label: 'Date',     sortable: true  },
]

/* ── Payment-method chip ──────────────────────────────────────────────────── */

function MethodChip({ order, isLight }) {
  const method = order.payment_type || order.transaction_type
  if (!method) return <span style={{ color: isLight ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.20)' }}>—</span>

  const isCard = /card/i.test(method)
  const bg  = isCard ? 'rgba(59,130,246,0.12)' : 'rgba(16,185,129,0.12)'
  const bdr = isCard ? 'rgba(59,130,246,0.30)' : 'rgba(16,185,129,0.30)'
  const txt = isCard ? '#60a5fa' : '#34d399'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '3px 9px', borderRadius: 7, background: bg, border: `1px solid ${bdr}`,
        color: txt, fontSize: '0.7em', fontWeight: 700, textTransform: 'capitalize',
        whiteSpace: 'nowrap',
      }}>
        <CreditCard style={{ width: 10, height: 10 }} />
        {method}
      </span>
      {order.bank_type && (
        <span style={{
          fontSize: '0.7em', fontWeight: 700, letterSpacing: '0.06em',
          color: isLight ? 'rgba(0,0,0,0.42)' : 'rgba(255,255,255,0.35)',
          textTransform: 'uppercase',
        }}>
          {order.bank_type}
        </span>
      )}
    </div>
  )
}

/* ── Summary tiles ────────────────────────────────────────────────────────── */

function SummaryTile({ icon: Icon, label, value, sub, isLight, panelStyle, T }) {
  return (
    <div style={{ ...panelStyle, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: '1 1 0' }}>
      <div style={{
        width: 34, height: 34, borderRadius: 9, flexShrink: 0,
        background: 'rgba(167,44,50,0.14)', border: '1px solid rgba(167,44,50,0.28)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon style={{ width: 16, height: 16, color: '#C44E54' }} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
          color: T.lblColor, whiteSpace: 'nowrap',
        }}>
          {label}
        </div>
        <div style={{
          fontSize: 18, fontWeight: 800, color: T.txt1, letterSpacing: '-0.02em',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {value}
        </div>
        {sub && <div style={{ fontSize: 10, color: T.txt4, whiteSpace: 'nowrap' }}>{sub}</div>}
      </div>
    </div>
  )
}

/* ── Invoice detail drawer ────────────────────────────────────────────────── */

function DetailRow({ icon: Icon, label, value, mono = false }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      {Icon
        ? <Icon style={{ width: 13, height: 13, color: 'rgba(255,255,255,0.30)', flexShrink: 0, marginTop: 2 }} />
        : <span style={{ width: 13, flexShrink: 0 }} />}
      <div style={{ minWidth: 118, fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.38)', flexShrink: 0 }}>
        {label}
      </div>
      <div style={{
        flex: 1, fontSize: 12.5, color: '#E8E8E8', wordBreak: 'break-word',
        fontFamily: mono ? 'var(--font-mono)' : undefined,
      }}>
        {value}
      </div>
    </div>
  )
}

function DetailSection({ title, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{
        fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase',
        color: '#C44E54', marginBottom: 2,
      }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function OrderDrawer({ order, open, onClose }) {
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  // A failure from a previous invoice must not linger on the next one.
  const invoiceKey = order?.payment_id || order?.invoice_no || null
  useEffect(() => { setSaveError('') }, [invoiceKey])

  // Hooks must run for every render, so the empty check comes after them.
  if (!order) return null

  const address = [order.address, order.city, order.postal_code, order.country]
    .filter(Boolean).join(', ')

  const handleExport = async () => {
    setSaving(true)
    setSaveError('')
    try {
      await downloadInvoicePdf(order, { currency: CURRENCY })
    } catch (err) {
      setSaveError(err?.message || 'Could not generate the invoice PDF')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Drawer open={open} onOpenChange={isOpen => { if (!isOpen) onClose() }} swipeDirection="right">
      <DrawerContent style={{ background: '#141414', borderLeft: '1px solid rgba(255,255,255,0.10)' }}>
        <DrawerHeader style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              <div style={{
                width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                background: '#A72C32', border: '1.5px solid #C44E54',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 15, fontWeight: 800, color: '#FFFFFF',
              }}>
                {initialsOf(order.customer_name)}
              </div>
              <div style={{ minWidth: 0 }}>
                <DrawerTitle style={{ color: '#FFFFFF', fontSize: 17, fontWeight: 700, margin: 0 }}>
                  <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {order.customer_name || 'Invoice'}
                  </span>
                </DrawerTitle>
                <DrawerDescription style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, margin: '2px 0 0', fontFamily: 'var(--font-mono)' }}>
                  {order.invoice_no || '—'}
                </DrawerDescription>
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.02em' }}>
                {fmtMoney(order.total_amount ?? order.amount_paid)}
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
                Total
              </div>
            </div>
          </div>
        </DrawerHeader>

        <DrawerBody style={{ padding: '18px 24px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <DetailSection title="Order">
            <DetailRow icon={Receipt}  label="Invoice No"   value={dash(order.invoice_no)} mono />
            <DetailRow icon={Hash}     label="Payment ID"   value={dash(order.payment_id)} mono />
            <DetailRow icon={Package}  label="Product"      value={dash(order.product)} />
            <DetailRow               label="Detail"       value={dash(order.product_detail)} />
            <DetailRow icon={Calendar} label="Paid On"      value={fmtDate(order.payment_date, order.payment_date_raw)} />
            <DetailRow               label="Source"       value={dash(order.source)} />
          </DetailSection>

          <DetailSection title="Amount">
            <DetailRow label="Unit Price"   value={fmtMoney(order.unit_price)} mono />
            <DetailRow label="No of Units"  value={dash(order.units)} mono />
            <DetailRow label="Total Amount" value={fmtMoney(order.total_amount)} mono />
            <DetailRow label="Amount Paid"  value={fmtMoney(order.amount_paid)} mono />
          </DetailSection>

          <DetailSection title="Customer">
            <DetailRow               label="Name"          value={dash(order.customer_name)} />
            <DetailRow               label="Account Title" value={dash(order.account_title)} />
            <DetailRow icon={Phone}    label="Phone"         value={dash(order.phone)} mono />
            <DetailRow icon={Mail}     label="Email"         value={dash(order.email)} mono />
            <DetailRow icon={Fingerprint} label="CNIC"       value={dash(order.cnic)} mono />
            <DetailRow icon={Building2} label="Company"      value={dash(order.company_name)} />
            <DetailRow               label="Sales For"     value={dash(order.sales_for)} />
          </DetailSection>

          <DetailSection title="Delivery Address">
            <DetailRow icon={MapPin} label="Address" value={address || '—'} />
          </DetailSection>

          <DetailSection title="Payment Method">
            <DetailRow icon={CreditCard} label="Type"        value={dash(order.payment_type)} />
            <DetailRow                 label="Transaction" value={dash(order.transaction_type)} />
            <DetailRow                 label="Bank"         value={order.bank_type ? String(order.bank_type).toUpperCase() : '—'} />
            <DetailRow                 label="Card No"      value={dash(order.card_no)} mono />
          </DetailSection>

          <DetailSection title="Gateway References">
            <DetailRow label="Transaction ID"  value={dash(order.transaction_id)} mono />
            <DetailRow label="Trans ID"        value={dash(order.trans_id)} mono />
            <DetailRow label="Reference ID"    value={dash(order.reference_id)} mono />
            <DetailRow label="Consumer No"     value={dash(order.consumer_no)} mono />
            <DetailRow label="Registration No" value={dash(order.registration_no)} mono />
          </DetailSection>
        </DrawerBody>

        <DrawerFooter style={{ borderTop: '1px solid rgba(255,255,255,0.07)', padding: '12px 24px', flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
          {saveError && (
            <div style={{ fontSize: 11.5, color: '#fca5a5', display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertTriangle style={{ width: 12, height: 12, flexShrink: 0 }} />
              {saveError}
            </div>
          )}
          <button
            onClick={handleExport}
            disabled={saving}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              width: '100%', padding: '10px 16px',
              background: 'linear-gradient(135deg, #BF3840 0%, #8B2328 100%)',
              border: '1px solid rgba(167,44,50,0.45)', borderRadius: 10,
              color: '#FFFFFF', fontSize: 13, fontWeight: 700,
              cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1,
              boxShadow: '0 4px 14px rgba(167,44,50,0.28)', transition: 'all 0.15s',
            }}
          >
            <Download style={{ width: 14, height: 14, animation: saving ? 'spin 0.9s linear infinite' : 'none' }} />
            {saving ? 'Preparing…' : 'Export Invoice (PDF)'}
          </button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

/* ── Table row ────────────────────────────────────────────────────────────── */

function OrderRow({ order, idx, isLight, onOpen }) {
  const [hov, setHov] = useState(false)

  const txt1   = isLight ? '#111111'               : '#FFFFFF'
  const txt2   = isLight ? '#555555'               : 'rgba(255,255,255,0.55)'
  const txt3   = isLight ? '#888888'               : 'rgba(255,255,255,0.38)'
  const txt4   = isLight ? 'rgba(0,0,0,0.38)'      : 'rgba(255,255,255,0.28)'
  const rowHov = isLight ? 'rgba(167,44,50,0.03)'  : 'rgba(255,255,255,0.03)'
  const rowAlt = isLight ? 'rgba(0,0,0,0.02)'      : 'rgba(255,255,255,0.015)'
  const rowBdr = isLight ? 'rgba(0,0,0,0.07)'      : 'rgba(255,255,255,0.04)'

  const cell = { padding: '0.92em 1.15em', verticalAlign: 'middle' }

  return (
    <tr
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={() => onOpen(order)}
      title="Click to view the full invoice"
      style={{
        background: hov ? rowHov : idx % 2 === 0 ? 'transparent' : rowAlt,
        transition: 'background 0.12s',
        borderBottom: `1px solid ${rowBdr}`,
        cursor: 'pointer',
      }}
    >
      {/* Invoice + payment id */}
      <td style={cell}>
        <div style={{ fontSize: '0.85em', fontWeight: 600, color: txt1, fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
          {order.invoice_no || '—'}
        </div>
        {order.payment_id && (
          <div style={{ fontSize: '0.7em', color: txt4, fontFamily: 'var(--font-mono)', marginTop: 2 }}>
            #{order.payment_id}
          </div>
        )}
      </td>

      {/* Customer + contact */}
      <td style={{ ...cell, maxWidth: 220 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65em', minWidth: 0 }}>
          <div style={{
            width: '2.4em', height: '2.4em', borderRadius: '50%', flexShrink: 0,
            background: '#A72C32', border: '1px solid #8B2328',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.8em', fontWeight: 700, color: '#FFFFFF',
          }}>
            {initialsOf(order.customer_name)}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: '0.92em', fontWeight: 600, color: txt1,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }} title={order.customer_name || ''}>
              {order.customer_name || '—'}
            </div>
            <div style={{
              fontSize: '0.7em', color: txt4, fontFamily: 'var(--font-mono)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }} title={[order.phone, order.email].filter(Boolean).join(' · ')}>
              {order.phone || order.email || '—'}
            </div>
          </div>
        </div>
      </td>

      {/* Product */}
      <td style={{ ...cell, maxWidth: 180 }}>
        <div style={{
          fontSize: '0.85em', color: txt2,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }} title={order.product || ''}>
          {order.product || '—'}
        </div>
        {order.product_detail && (
          <div style={{
            fontSize: '0.7em', color: txt4, marginTop: 2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }} title={order.product_detail}>
            {order.product_detail}
          </div>
        )}
      </td>

      {/* Units */}
      <td style={cell}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          minWidth: '1.9em', padding: '3px 8px', borderRadius: 7,
          background: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)',
          border: `1px solid ${isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'}`,
          fontSize: '0.8em', fontWeight: 700, color: txt2, fontFamily: 'var(--font-mono)',
        }}>
          {order.units ?? '—'}
        </span>
      </td>

      {/* Amount */}
      <td style={cell}>
        <div style={{ fontSize: '0.92em', fontWeight: 700, color: txt1, fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
          {fmtAmount(order.total_amount ?? order.amount_paid)}
        </div>
        {order.unit_price != null && order.units != null && (
          <div style={{ fontSize: '0.7em', color: txt4, fontFamily: 'var(--font-mono)', marginTop: 2, whiteSpace: 'nowrap' }}>
            {fmtAmount(order.unit_price)} × {order.units}
          </div>
        )}
      </td>

      {/* Payment method */}
      <td style={cell}><MethodChip order={order} isLight={isLight} /></td>

      {/* City */}
      <td style={{ ...cell, maxWidth: 130 }}>
        <div style={{
          fontSize: '0.85em', color: txt2,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }} title={[order.city, order.country].filter(Boolean).join(', ')}>
          {order.city || '—'}
        </div>
      </td>

      {/* Date */}
      <td style={cell}>
        <div style={{ fontSize: '0.8em', color: txt2, fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
          {fmtDateOnly(order.payment_date, order.payment_date_raw)}
        </div>
        <div style={{ fontSize: '0.7em', color: txt3, fontFamily: 'var(--font-mono)', marginTop: 2, whiteSpace: 'nowrap' }}>
          {order.payment_date ? fmtDate(order.payment_date).split(' ').slice(1).join(' ') : ''}
        </div>
      </td>
    </tr>
  )
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

export default function Orders() {
  const { getOrders } = useCityTag()

  const pageTheme = React.useContext(ThemeContext)
  const isLight   = pageTheme === 'light'

  const panelStyle = isLight ? {
    border: '1.5px solid transparent',
    background: 'linear-gradient(145deg, #FFFFFF 0%, #FAFAFA 100%) padding-box, linear-gradient(135deg, rgba(167,44,50,0.28) 0%, rgba(255,255,255,0) 55%) border-box',
    borderRadius: 16,
    boxShadow: '0 4px 30px rgba(167,44,50,0.07)',
  } : {
    background: 'linear-gradient(157deg, rgba(32,31,31,0.55) 0%, rgba(26,25,25,0.50) 58%, rgba(21,20,20,0.45) 100%)',
    border: '1px solid rgba(255,255,255,0.04)',
    borderRadius: 16,
    boxShadow: '0 4px 24px rgba(0,0,0,0.35)',
  }

  const T = {
    txt1:      isLight ? '#111111'           : '#FFFFFF',
    txt2:      isLight ? '#555555'           : 'rgba(255,255,255,0.65)',
    txt3:      isLight ? '#888888'           : 'rgba(255,255,255,0.38)',
    txt4:      isLight ? 'rgba(0,0,0,0.38)' : 'rgba(255,255,255,0.22)',
    lblColor:  isLight ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.58)',
    bdrLight:  isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.07)',
    theadBg:   isLight ? 'rgba(0,0,0,0.04)' : 'rgba(0,0,0,0.22)',
    theadBdr:  isLight ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.07)',
    theadTxt:  isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.38)',
    searchBg:  isLight ? '#EFEFEF'          : '#18181b',
    searchBdr: isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.10)',
    paginBdr:  isLight ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.05)',
    errBg:     isLight ? 'rgba(127,29,29,0.07)' : 'rgba(127,29,29,0.20)',
    errBdr:    isLight ? 'rgba(127,29,29,0.20)' : 'rgba(127,29,29,0.40)',
    errTxt:    isLight ? '#991b1b'          : '#fca5a5',
  }

  const muiTheme = useMemo(() => createTheme({
    palette: { mode: isLight ? 'light' : 'dark', primary: { main: '#A72C32', contrastText: '#FFFFFF' } },
  }), [isLight])

  const [query,      setQuery]      = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [page,       setPage]       = useState(1)
  const [sortBy,     setSortBy]     = useState('payment_date')
  const [sortDir,    setSortDir]    = useState('desc')

  const [orders,   setOrders]   = useState([])
  const [total,    setTotal]    = useState(0)
  const [summary,  setSummary]  = useState({ total_orders: 0, total_amount: 0, total_units: 0 })
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')
  const [exporting, setExporting] = useState(false)
  const [selected, setSelected] = useState(null)

  const debounceRef = useRef(null)
  const reqIdRef    = useRef(0)

  const handleSearch = (value) => {
    setQuery(value)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedQ(value.trim())
      setPage(1)
    }, 350)
  }
  useEffect(() => () => clearTimeout(debounceRef.current), [])

  const load = useCallback(async ({ refresh = false } = {}) => {
    // Late responses from a superseded query must not overwrite fresher state.
    const reqId = ++reqIdRef.current
    setLoading(true)
    setError('')
    try {
      const res = await getOrders({
        page, limit: PAGE_SIZE, search: debouncedQ, sortBy, sortDir, refresh,
      })
      if (reqId !== reqIdRef.current) return
      setOrders(Array.isArray(res?.orders) ? res.orders : [])
      setTotal(Number(res?.total) || 0)
      setSummary(res?.summary || { total_orders: 0, total_amount: 0, total_units: 0 })
    } catch (err) {
      if (reqId !== reqIdRef.current) return
      setOrders([])
      setTotal(0)
      setSummary({ total_orders: 0, total_amount: 0, total_units: 0 })
      setError(err?.message || 'Failed to load orders')
    } finally {
      if (reqId === reqIdRef.current) setLoading(false)
    }
  }, [getOrders, page, debouncedQ, sortBy, sortDir])

  useEffect(() => { load() }, [load])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const safePage   = Math.min(page, totalPages)

  const toggleSort = (key) => {
    if (sortBy === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(key)
      setSortDir(key === 'payment_date' || key === 'total_amount' || key === 'units' ? 'desc' : 'asc')
    }
    setPage(1)
  }

  /** Export the full matched set (not just the page on screen) to Excel. */
  const exportExcel = async () => {
    setExporting(true)
    try {
      const rows = []
      for (let p = 1; p <= EXPORT_MAX_PAGES; p += 1) {
        const res = await getOrders({ page: p, limit: EXPORT_LIMIT, search: debouncedQ, sortBy, sortDir })
        const batch = Array.isArray(res?.orders) ? res.orders : []
        rows.push(...batch)
        const count = Number(res?.total) || rows.length
        if (batch.length === 0 || rows.length >= count) break
      }

      const headers = [
        'Invoice No', 'Payment ID', 'Payment Date', 'Customer', 'Account Title',
        'Phone', 'Email', 'CNIC', 'Company', 'Sales For',
        'Product', 'Product Detail', `Unit Price (${CURRENCY})`, 'Units', `Total Amount (${CURRENCY})`, `Amount Paid (${CURRENCY})`,
        'Payment Type', 'Transaction Type', 'Bank', 'Card No', 'Source',
        'Address', 'City', 'Postal Code', 'Country',
        'Transaction ID', 'Trans ID', 'Reference ID', 'Consumer No', 'Registration No',
      ]
      const body = rows.map(o => [
        o.invoice_no ?? '', o.payment_id ?? '', fmtDate(o.payment_date, o.payment_date_raw),
        o.customer_name ?? '', o.account_title ?? '',
        o.phone ?? '', o.email ?? '', o.cnic ?? '', o.company_name ?? '', o.sales_for ?? '',
        o.product ?? '', o.product_detail ?? '',
        o.unit_price ?? '', o.units ?? '', o.total_amount ?? '', o.amount_paid ?? '',
        o.payment_type ?? '', o.transaction_type ?? '', o.bank_type ?? '', o.card_no ?? '', o.source ?? '',
        o.address ?? '', o.city ?? '', o.postal_code ?? '', o.country ?? '',
        o.transaction_id ?? '', o.trans_id ?? '', o.reference_id ?? '', o.consumer_no ?? '', o.registration_no ?? '',
      ])

      const ws = XLSX.utils.aoa_to_sheet([headers, ...body])
      ws['!cols'] = headers.map((h, i) => ({ wch: [18, 12, 20, 22, 22][i] ?? Math.max(12, h.length + 2) }))
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Orders')
      const stamp = new Date().toISOString().slice(0, 10)
      XLSX.writeFile(wb, `orders_${stamp}.xlsx`)
    } catch (err) {
      setError(err?.message || 'Failed to export orders')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: T.txt1, letterSpacing: '-0.02em', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          <ShoppingBag style={{ width: 22, height: 22, color: '#C44E54', flexShrink: 0 }} />
          Orders
        </h1>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => load({ refresh: true })}
            disabled={loading}
            title="Re-fetch invoices from the payment gateway"
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
              background: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${T.bdrLight}`, borderRadius: 10,
              color: T.txt2, fontSize: 12, fontWeight: 600,
              cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.55 : 1,
            }}
          >
            <RefreshCw style={{ width: 13, height: 13, animation: loading ? 'spin 0.9s linear infinite' : 'none' }} />
            Refresh
          </button>

          <button
            onClick={exportExcel}
            disabled={exporting || total === 0}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px',
              background: 'linear-gradient(135deg, #BF3840 0%, #8B2328 100%)',
              border: '1px solid rgba(167,44,50,0.45)', borderRadius: 10,
              color: '#FFFFFF', fontSize: 12, fontWeight: 700,
              cursor: exporting || total === 0 ? 'default' : 'pointer',
              opacity: exporting || total === 0 ? 0.5 : 1,
              boxShadow: '0 4px 14px rgba(167,44,50,0.28)', transition: 'all 0.15s',
            }}
          >
            <Download style={{ width: 13, height: 13, animation: exporting ? 'spin 0.9s linear infinite' : 'none' }} />
            {exporting ? 'Exporting…' : 'Export Excel'}
          </button>
        </div>
      </div>

      {/* ── Summary ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <SummaryTile icon={Receipt}    label="Invoices"    value={summary.total_orders?.toLocaleString() ?? '0'}
          sub={debouncedQ ? 'matching your search' : 'all time'} isLight={isLight} panelStyle={panelStyle} T={T} />
        <SummaryTile icon={CreditCard} label="Total Collected" value={fmtMoney(summary.total_amount)}
          sub="sum of invoice totals" isLight={isLight} panelStyle={panelStyle} T={T} />
        <SummaryTile icon={Package}    label="Units Sold"  value={summary.total_units?.toLocaleString() ?? '0'}
          sub="locators across all invoices" isLight={isLight} panelStyle={panelStyle} T={T} />
      </div>

      {/* ── Search ───────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '0 0 300px' }}>
          <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: T.txt3, pointerEvents: 'none' }} />
          <input
            type="text"
            name="orders-table-search"
            autoComplete="off"
            value={query}
            onChange={e => handleSearch(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') handleSearch('') }}
            placeholder="Search invoice, name, phone…"
            style={{
              width: '100%', boxSizing: 'border-box',
              paddingLeft: 32, paddingRight: query ? 30 : 12, paddingTop: 8, paddingBottom: 8,
              background: T.searchBg, border: `1px solid ${T.searchBdr}`,
              borderRadius: 10, color: T.txt1, fontSize: 12, outline: 'none',
            }}
            onFocus={e => { e.target.style.borderColor = 'rgba(167,44,50,0.50)' }}
            onBlur={e  => { e.target.style.borderColor = T.searchBdr }}
          />
          {query && (
            <button onClick={() => handleSearch('')}
              style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: T.txt3, padding: 2, display: 'flex', alignItems: 'center' }}>
              <X style={{ width: 12, height: 12 }} />
            </button>
          )}
        </div>
        <span style={{ fontSize: 11, color: T.txt4, marginLeft: 'auto' }}>
          {total.toLocaleString()} invoice{total !== 1 ? 's' : ''}
        </span>
      </div>

      {/* ── Table ────────────────────────────────────────────────────────── */}
      {error ? (
        <div style={{
          ...panelStyle, padding: '28px 24px', display: 'flex', alignItems: 'flex-start', gap: 12,
          background: T.errBg, border: `1px solid ${T.errBdr}`,
        }}>
          <AlertTriangle style={{ width: 18, height: 18, color: T.errTxt, flexShrink: 0, marginTop: 1 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.errTxt, marginBottom: 4 }}>
              Couldn’t load orders
            </div>
            <div style={{ fontSize: 12.5, color: T.txt2, wordBreak: 'break-word' }}>{error}</div>
            <button
              onClick={() => load({ refresh: true })}
              style={{
                marginTop: 12, padding: '6px 14px', borderRadius: 8, cursor: 'pointer',
                background: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)',
                border: `1px solid ${T.bdrLight}`, color: T.txt2, fontSize: 12, fontWeight: 600,
              }}
            >
              Try again
            </button>
          </div>
        </div>
      ) : loading && orders.length === 0 ? (
        <TPLLoader label="Loading orders…" />
      ) : (
        <div style={{ ...panelStyle, overflow: 'hidden', opacity: loading ? 0.6 : 1, transition: 'opacity 0.15s' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="scalable-container" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${T.theadBdr}`, background: T.theadBg }}>
                  {COLUMNS.map(col => {
                    const active = sortBy === col.key
                    return (
                      <th
                        key={col.key}
                        onClick={() => col.sortable && toggleSort(col.key)}
                        style={{
                          padding: '0.85em 1.15em', textAlign: 'left', fontSize: '0.65em', fontWeight: 700,
                          color: active ? '#C44E54' : T.theadTxt, textTransform: 'uppercase',
                          letterSpacing: '0.08em', whiteSpace: 'nowrap',
                          cursor: col.sortable ? 'pointer' : 'default', userSelect: 'none',
                        }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          {col.label}
                          {col.sortable && active && (
                            sortDir === 'asc'
                              ? <ChevronUp style={{ width: 11, height: 11 }} />
                              : <ChevronDown style={{ width: 11, height: 11 }} />
                          )}
                        </span>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={COLUMNS.length} style={{ padding: '56px 20px', textAlign: 'center' }}>
                      <ShoppingBag style={{ width: 28, height: 28, color: T.txt4, marginBottom: 10 }} />
                      <div style={{ fontSize: 13, color: T.txt3 }}>
                        {debouncedQ ? `No invoices matching “${debouncedQ}”` : 'No invoices found'}
                      </div>
                    </td>
                  </tr>
                ) : (
                  orders.map((o, i) => (
                    <OrderRow
                      key={o.payment_id || o.invoice_no || `${o.transaction_id}-${i}`}
                      order={o} idx={i} isLight={isLight} onOpen={setSelected}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: `1px solid ${T.paginBdr}`, flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontSize: 11, color: T.txt4 }}>
                Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, total)} of {total.toLocaleString()}
              </span>
              <ThemeProvider theme={muiTheme}>
                <Stack>
                  <Pagination
                    count={totalPages}
                    page={safePage}
                    onChange={(_, p) => setPage(p)}
                    color="primary"
                    shape="rounded"
                    size="medium"
                    sx={{
                      '& .MuiPaginationItem-root': {
                        fontFamily: 'inherit',
                        fontSize: 13,
                        fontWeight: 600,
                        color: isLight ? '#000000' : 'rgba(255,255,255,0.70)',
                        border: 'none',
                        '&:hover': { background: isLight ? 'rgba(167,44,50,0.08)' : 'rgba(255,255,255,0.08)' },
                        '&.Mui-selected': {
                          background: isLight ? '#A72C32' : '#3d3d3d',
                          color: '#ffffff',
                          fontWeight: 700,
                          border: 'none',
                        },
                      },
                    }}
                  />
                </Stack>
              </ThemeProvider>
            </div>
          )}
        </div>
      )}

      <OrderDrawer order={selected} open={Boolean(selected)} onClose={() => setSelected(null)} />
    </div>
  )
}
