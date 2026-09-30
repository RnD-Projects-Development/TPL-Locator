/**
 * invoicePdf — render one purchase invoice as a printable A4 PDF.
 *
 * Drawn as text rather than as a screenshot of the drawer (the approach the
 * Dashboard export uses): an invoice is a document someone may search, copy a
 * transaction ID out of, or print, so the text stays real text and the file
 * stays a few KB rather than a few MB.
 */

import jsPDF from 'jspdf'
import tplLogo from '../assets/tpl.png'

const BRAND = [167, 44, 50]        // #A72C32
const INK   = [17, 17, 17]
const MUTED = [125, 125, 125]
const RULE  = [225, 225, 225]

const PAGE_W  = 210
const MARGIN  = 15
const CONTENT = PAGE_W - MARGIN * 2

// jsPDF's built-in Helvetica cannot encode an em dash (it renders as a tofu
// box), so the PDF uses a plain hyphen for empty values while the on-screen
// table keeps the nicer typographic dash.
const EMPTY = '-'

const dash = (v) => (v === null || v === undefined || v === '' ? EMPTY : String(v))

function money(v, currency) {
  if (v === null || v === undefined || v === '') return EMPTY
  const n = Number(v)
  if (!Number.isFinite(n)) return String(v)
  return `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

function invoiceDate(order) {
  const iso = order.payment_date
  const m = iso && /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso)
  if (!m) return order.payment_date_raw || EMPTY
  const [, y, mo, d, h, min] = m
  const hour = Number(h)
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  return `${d}/${mo}/${y} ${String(h12).padStart(2, '0')}:${min} ${hour >= 12 ? 'PM' : 'AM'}`
}

/** Load the brand mark for the header; a failure must not block the download. */
async function loadLogo() {
  try {
    const img = new Image()
    img.src = tplLogo
    if (img.decode) await img.decode()
    else await new Promise((res, rej) => { img.onload = res; img.onerror = rej })
    return img
  } catch {
    return null
  }
}

export async function downloadInvoicePdf(order, { currency = 'PKR' } = {}) {
  if (!order) return

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const logo = await loadLogo()

  /* ── Header band ─────────────────────────────────────────────────────── */
  pdf.setFillColor(...BRAND)
  pdf.rect(0, 0, PAGE_W, 30, 'F')

  if (logo) {
    pdf.setFillColor(255, 255, 255)
    pdf.roundedRect(MARGIN, 9, 12, 12, 2, 2, 'F')
    try { pdf.addImage(logo, 'PNG', MARGIN + 2, 11, 8, 8) } catch { /* header still renders */ }
  }

  pdf.setTextColor(255, 255, 255)
  pdf.setFont('helvetica', 'bold').setFontSize(15)
  pdf.text('TPL LOCATOR', MARGIN + (logo ? 16 : 0), 15)
  pdf.setFont('helvetica', 'normal').setFontSize(8.5)
  pdf.text('TPL Trakker Limited', MARGIN + (logo ? 16 : 0), 20.5)

  pdf.setFont('helvetica', 'bold').setFontSize(19)
  pdf.text('INVOICE', PAGE_W - MARGIN, 16, { align: 'right' })
  pdf.setFont('helvetica', 'normal').setFontSize(9)
  pdf.text(dash(order.invoice_no), PAGE_W - MARGIN, 22.5, { align: 'right' })

  let y = 44

  /* ── Label/value pair, returns the next free y ───────────────────────── */
  const pair = (label, value, x, yy, width) => {
    pdf.setFont('helvetica', 'bold').setFontSize(7)
    pdf.setTextColor(...MUTED)
    pdf.text(String(label).toUpperCase(), x, yy)
    pdf.setFont('helvetica', 'normal').setFontSize(9.5)
    pdf.setTextColor(...INK)
    const lines = pdf.splitTextToSize(dash(value), width)
    pdf.text(lines, x, yy + 4.6)
    return yy + 4.6 + lines.length * 4.4 + 3
  }

  const sectionTitle = (text, yy) => {
    pdf.setFont('helvetica', 'bold').setFontSize(8)
    pdf.setTextColor(...BRAND)
    pdf.text(String(text).toUpperCase(), MARGIN, yy)
    pdf.setDrawColor(...RULE).setLineWidth(0.3)
    pdf.line(MARGIN, yy + 2, PAGE_W - MARGIN, yy + 2)
    return yy + 8
  }

  const colW = CONTENT / 2 - 5
  const rightX = MARGIN + CONTENT / 2 + 5

  /* ── Invoice meta ────────────────────────────────────────────────────── */
  y = sectionTitle('Invoice details', y)
  let yl = y
  let yr = y
  yl = pair('Invoice No', order.invoice_no, MARGIN, yl, colW)
  yr = pair('Payment Date', invoiceDate(order), rightX, yr, colW)
  yl = pair('Payment ID', order.payment_id, MARGIN, yl, colW)
  yr = pair('Source', order.source, rightX, yr, colW)
  y = Math.max(yl, yr) + 4

  /* ── Billed to ───────────────────────────────────────────────────────── */
  y = sectionTitle('Billed to', y)
  yl = y
  yr = y
  yl = pair('Name', order.customer_name, MARGIN, yl, colW)
  yr = pair('Phone', order.phone, rightX, yr, colW)
  yl = pair('Email', order.email, MARGIN, yl, colW)
  yr = pair('CNIC', order.cnic, rightX, yr, colW)
  const address = [order.address, order.city, order.postal_code, order.country].filter(Boolean).join(', ')
  yl = pair('Address', address, MARGIN, yl, colW)
  yr = pair('Company', order.company_name, rightX, yr, colW)
  y = Math.max(yl, yr) + 4

  /* ── Line items ──────────────────────────────────────────────────────── */
  y = sectionTitle('Items', y)

  const cols = [
    { x: MARGIN,                w: CONTENT - 95, align: 'left'  },  // description
    { x: MARGIN + CONTENT - 92, w: 32,           align: 'right' },  // unit price
    { x: MARGIN + CONTENT - 58, w: 18,           align: 'right' },  // units
    { x: MARGIN + CONTENT - 38, w: 38,           align: 'right' },  // amount
  ]
  const headers = ['Description', `Unit Price (${currency})`, 'Units', `Amount (${currency})`]

  pdf.setFillColor(246, 246, 246)
  pdf.rect(MARGIN, y - 4.5, CONTENT, 8, 'F')
  pdf.setFont('helvetica', 'bold').setFontSize(7.5)
  pdf.setTextColor(...MUTED)
  headers.forEach((h, i) => {
    const c = cols[i]
    pdf.text(h.toUpperCase(), c.align === 'right' ? c.x + c.w : c.x, y, { align: c.align })
  })
  y += 8

  pdf.setFont('helvetica', 'normal').setFontSize(9.5)
  pdf.setTextColor(...INK)
  const desc = pdf.splitTextToSize(dash(order.product), cols[0].w)
  pdf.text(desc, cols[0].x, y)
  pdf.text(money(order.unit_price, currency), cols[1].x + cols[1].w, y, { align: 'right' })
  pdf.text(dash(order.units), cols[2].x + cols[2].w, y, { align: 'right' })
  pdf.text(money(order.total_amount ?? order.amount_paid, currency), cols[3].x + cols[3].w, y, { align: 'right' })

  let itemBottom = y + desc.length * 4.4
  if (order.product_detail) {
    pdf.setFontSize(8).setTextColor(...MUTED)
    const detail = pdf.splitTextToSize(order.product_detail, cols[0].w)
    pdf.text(detail, cols[0].x, itemBottom)
    itemBottom += detail.length * 3.8
  }
  y = itemBottom + 4

  pdf.setDrawColor(...RULE).setLineWidth(0.3)
  pdf.line(MARGIN, y, PAGE_W - MARGIN, y)
  y += 7

  /* ── Totals ──────────────────────────────────────────────────────────── */
  const totalRow = (label, value, bold) => {
    pdf.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(bold ? 11 : 9.5)
    pdf.setTextColor(...(bold ? INK : MUTED))
    pdf.text(label, PAGE_W - MARGIN - 45, y, { align: 'right' })
    pdf.setTextColor(...INK)
    pdf.text(value, PAGE_W - MARGIN, y, { align: 'right' })
    y += bold ? 7 : 5.6
  }
  totalRow('Amount Paid', money(order.amount_paid, currency), false)
  totalRow('Total', money(order.total_amount ?? order.amount_paid, currency), true)
  y += 3

  /* ── Payment ─────────────────────────────────────────────────────────── */
  y = sectionTitle('Payment', y)
  yl = y
  yr = y
  yl = pair('Payment Type', order.payment_type, MARGIN, yl, colW)
  yr = pair('Bank', order.bank_type ? String(order.bank_type).toUpperCase() : null, rightX, yr, colW)
  yl = pair('Card No', order.card_no, MARGIN, yl, colW)
  yr = pair('Transaction Type', order.transaction_type, rightX, yr, colW)
  yl = pair('Transaction ID', order.transaction_id, MARGIN, yl, colW)
  yr = pair('Reference ID', order.reference_id, rightX, yr, colW)
  y = Math.max(yl, yr)

  /* ── Footer ──────────────────────────────────────────────────────────── */
  const footY = 285
  pdf.setDrawColor(...RULE).setLineWidth(0.3)
  pdf.line(MARGIN, footY - 5, PAGE_W - MARGIN, footY - 5)
  pdf.setFont('helvetica', 'normal').setFontSize(7.5)
  pdf.setTextColor(...MUTED)
  pdf.text('This is a computer-generated invoice and does not require a signature.', MARGIN, footY)
  pdf.text(`Generated ${new Date().toLocaleString()}`, PAGE_W - MARGIN, footY, { align: 'right' })

  const safe = String(order.invoice_no || order.payment_id || 'invoice').replace(/[^\w.-]+/g, '_')
  pdf.save(`invoice_${safe}.pdf`)
}
