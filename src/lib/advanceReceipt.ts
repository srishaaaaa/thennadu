import { jsPDF } from 'jspdf'
import { BRAND_ADDRESS, BRAND_EN, BRAND_LOGO, BRAND_PHONE_DISPLAY } from './brand'
import { LOGO_BASE64 } from './logoBase64'
import { formatCurrency } from './retail'
import type { AdvanceOrder } from '../services/advanceOrderService'

const esc = (value: string) => value.replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char] || char))

// jsPDF's built-in Helvetica font renders MYR currency symbols fine; we strip
// the 'MYR' prefix from Intl and show 'RM ' instead for cleaner PDF output.
const pdfMoney = (value: number): string => {
  const formatted = formatCurrency(value)
  // Normalise MYR format: 'MYR 12.00' -> 'RM 12.00'
  return formatted.replace(/^MYR\s*/, 'RM ')
}

export function advanceReceiptPdf(order: AdvanceOrder) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  doc.setFillColor('#E87020'); doc.rect(0, 0, 210, 5, 'F')
  try { doc.addImage(LOGO_BASE64, 'PNG', 16, 10, 12, 12) } catch {}
  doc.setTextColor('#E87020'); doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.text(BRAND_EN.toUpperCase(), 38, 20)
  doc.setTextColor('#6b7280'); doc.setFontSize(8); doc.text('ADVANCE RECEIPT - NOT A TAX INVOICE', 38, 26)

  doc.setFont('helvetica', 'normal'); doc.text(BRAND_ADDRESS, 194, 20, { align: 'right', maxWidth: 76 }); doc.text(BRAND_PHONE_DISPLAY, 194, 30, { align: 'right' })
  doc.setDrawColor('#E87020'); doc.line(16, 38, 194, 38)
  doc.setTextColor('#111827'); doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.text(order.deposit_id, 16, 51)
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor('#6b7280'); doc.text(`Created: ${new Date(order.created_at).toLocaleString('en-MY')}`, 194, 51, { align: 'right' })
  const rows = [
    ['Customer', order.customer_name], ['Phone', order.phone], ['Address', order.address || '-'], ['Product', order.product_name],
    ['Category', order.category || '-'], ['Expected delivery', new Date(`${order.expected_delivery_date}T00:00:00`).toLocaleDateString('en-MY')],
  ]
  let y = 66
  rows.forEach(([label, value]) => { doc.setFont('helvetica', 'bold'); doc.setTextColor('#6b7280'); doc.text(label.toUpperCase(), 16, y); doc.setFont('helvetica', 'normal'); doc.setTextColor('#111827'); doc.text(String(value), 64, y, { maxWidth: 126 }); y += 10 })
  y += 4; doc.setFillColor('#FFF3E8'); doc.roundedRect(16, y, 178, 42, 3, 3, 'F')
  const money = [[ 'Total order amount', order.total_amount ], [ 'Deposit paid', order.deposit_amount ], [ 'Remaining balance', order.remaining_balance ]] as const
  money.forEach(([label, value], index) => { const rowY = y + 11 + index * 11; doc.setFont('helvetica', index === 2 ? 'bold' : 'normal'); doc.setTextColor(index === 2 ? '#C73660' : '#374151'); doc.text(label, 22, rowY); doc.text(pdfMoney(value), 188, rowY, { align: 'right' }) })
  doc.setFont('helvetica', 'bold'); doc.setTextColor('#b45309'); doc.setFontSize(9); doc.text('This receipt records an advance payment only. It is not a final invoice.', 105, y + 55, { align: 'center' })
  return new File([doc.output('blob')], `Advance-Receipt-${order.deposit_id}.pdf`, { type: 'application/pdf' })
}

export function printAdvanceReceipt(order: AdvanceOrder) {
  const frame = document.createElement('iframe')
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0'
  document.body.appendChild(frame)
  const doc = frame.contentWindow?.document
  if (!doc) return
  const paymentLabel = order.final_payment_method
    ? (order.final_payment_method === 'upi' ? 'UPI / QR' : order.final_payment_method.toUpperCase())
    : ''
  const depositPayment = (() => {
    // Show payment method if available
    return paymentLabel || 'Cash'
  })()
  const html = `<!doctype html><html><head><title>Advance Receipt ${esc(order.deposit_id)}</title>
<meta charset="utf-8">
<style>
  @page { size: 80mm auto; margin: 0; }
  @media print { @page { size: 80mm auto; margin: 0; } }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: Arial, sans-serif;
    font-size: 12px;
    width: 72mm;
    padding: 4mm;
    color: #111;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .c { text-align: center; }
  .r { display: flex; justify-content: space-between; gap: 4px; margin: 5px 0; word-break: break-word; }
  .r span:first-child { flex-shrink: 0; max-width: 55%; }
  .r span:last-child { text-align: right; flex: 1; }
  .line { border-top: 1px dashed #555; margin: 8px 0; }
  .big { font-size: 15px; font-weight: bold; }
  .bold { font-weight: bold; }
  .warn { font-size: 9px; font-weight: bold; margin-top: 10px; text-align: center; }
  .label { font-size: 10px; color: #555; }
  .balance-row { font-size: 14px; font-weight: bold; }
</style>
</head><body>
<div class="c" style="margin-bottom:5px;"><img src="${BRAND_LOGO}" alt="${esc(BRAND_EN)}" style="width:36px;height:36px;object-fit:contain;display:inline-block;border-radius:8px;border:1px solid #e5e7eb;padding:2px;" /></div>
<div class="c big">${esc(BRAND_EN)}</div>
<div class="c" style="font-size:10px;color:#555;">${esc(BRAND_ADDRESS)}</div>
<div class="c" style="font-size:10px;color:#555;">${esc(BRAND_PHONE_DISPLAY)}</div>
<div class="line"></div>
<div class="c big">ADVANCE RECEIPT</div>
<div class="c" style="font-size:10px;">Not a final tax invoice</div>
<div class="line"></div>
<div><span class="bold">${esc(order.deposit_id)}</span></div>
<div style="font-size:10px;color:#555;">${new Date(order.created_at).toLocaleString('en-MY')}</div>
<div class="line"></div>
<div class="r"><span class="label">Customer</span><span class="bold">${esc(order.customer_name)}</span></div>
<div class="r"><span class="label">Phone</span><span>${esc(order.phone)}</span></div>
${order.address ? `<div class="r"><span class="label">Address</span><span>${esc(order.address)}</span></div>` : ''}
<div class="r"><span class="label">Product</span><span>${esc(order.product_name)}</span></div>
${order.category ? `<div class="r"><span class="label">Category</span><span>${esc(order.category)}</span></div>` : ''}
<div class="r"><span class="label">Delivery</span><span>${esc(new Date(`${order.expected_delivery_date}T00:00:00`).toLocaleDateString('en-MY'))}</span></div>
<div class="r"><span class="label">Payment</span><span>${esc(depositPayment)}</span></div>
<div class="line"></div>
<div class="r"><span>Total Amount</span><span class="bold">${esc(formatCurrency(order.total_amount))}</span></div>
<div class="r"><span>Deposit Paid</span><span class="bold">${esc(formatCurrency(order.deposit_amount))}</span></div>
<div class="r balance-row"><span>Balance Due</span><span>${esc(formatCurrency(order.remaining_balance))}</span></div>
<div class="line"></div>
<div class="warn">ADVANCE PAYMENT ONLY &mdash; NOT A FINAL INVOICE</div>
</body></html>`
  doc.open()
  doc.write(html)
  doc.close()
  setTimeout(() => {
    frame.contentWindow?.focus()
    frame.contentWindow?.print()
    setTimeout(() => frame.remove(), 1500)
  }, 300)
}

export function downloadFile(file: File) { const url = URL.createObjectURL(file); const link = document.createElement('a'); link.href = url; link.download = file.name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 500) }

