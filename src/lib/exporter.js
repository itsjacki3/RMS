/**
 * Print + PDF export for any table or report.
 *
 * Both work from the same plain "document" object, so what you print is what
 * you download:
 *
 *   {
 *     title:    'Rent Collection',
 *     subtitle: 'All payments',                      (optional)
 *     summary:  [['Total collected', 'KES 1,000']],   (optional key/value lines)
 *     sections: [{
 *       heading: 'Payments',                          (optional)
 *       columns: [{ header: 'Date' }, { header: 'Amount', align: 'right' }],
 *       rows:    [['05/11/26', 'KES 13,000'], ...],   (already formatted text)
 *       totals:  ['Total', 'KES 13,000'],             (optional last row)
 *     }],
 *   }
 *
 * Always pass ALL the records, not just the page currently on screen.
 */

const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

function stamp() {
  return new Date().toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' })
}

export function slug(text) {
  return String(text || 'report').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

/** Convenience for the common single-table case. */
export function tableDoc({ title, subtitle, summary, heading, columns, rows, totals }) {
  return { title, subtitle, summary, sections: [{ heading, columns, rows, totals }] }
}

/* ------------------------------------------------------------------ */
/* Print                                                               */
/* ------------------------------------------------------------------ */
function buildHTML(doc) {
  const sections = (doc.sections || []).map((s) => {
    const head = (s.columns || []).map((c) => `<th class="${c.align === 'right' ? 'r' : ''}">${esc(c.header)}</th>`).join('')
    const body = (s.rows || []).length
      ? s.rows.map((r) => `<tr>${r.map((v, i) => `<td class="${s.columns[i]?.align === 'right' ? 'r' : ''}">${esc(v)}</td>`).join('')}</tr>`).join('')
      : `<tr><td colspan="${(s.columns || []).length || 1}" class="empty">No records.</td></tr>`
    const totals = s.totals
      ? `<tr class="totals">${s.totals.map((v, i) => `<td class="${s.columns[i]?.align === 'right' ? 'r' : ''}">${esc(v)}</td>`).join('')}</tr>`
      : ''
    return `${s.heading ? `<h2>${esc(s.heading)}</h2>` : ''}<table><thead><tr>${head}</tr></thead><tbody>${body}${totals}</tbody></table>`
  }).join('')

  const summary = (doc.summary || []).length
    ? `<div class="summary">${doc.summary.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div>`
    : ''

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(doc.title)}</title>
<style>
  @page { size: A4 landscape; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font: 12px/1.45 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1f2937; margin: 0; }
  .brand { font-weight: 800; font-size: 13px; color: #ff7a50; letter-spacing: .02em; }
  .brand span { color: #1f2937; }
  h1 { font-size: 20px; margin: 4px 0 2px; }
  .sub { color: #6b7280; margin-bottom: 4px; }
  .meta { color: #9ca3af; font-size: 11px; margin-bottom: 14px; }
  h2 { font-size: 14px; margin: 18px 0 6px; }
  .summary { display: flex; flex-wrap: wrap; gap: 8px 28px; margin: 8px 0 6px; padding: 10px 14px; background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 8px; }
  .summary span { display: block; color: #6b7280; font-size: 11px; }
  .summary b { font-size: 14px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; background: #fff1ea; color: #9a3d1a; font-size: 10.5px; text-transform: uppercase; letter-spacing: .04em; padding: 7px 8px; border-bottom: 2px solid #ff7a50; }
  td { padding: 6px 8px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  th.r, td.r { text-align: right; }
  tr { page-break-inside: avoid; }
  thead { display: table-header-group; }
  tr.totals td { font-weight: 700; background: #f8fafc; border-top: 2px solid #d1d5db; }
  td.empty { text-align: center; color: #9ca3af; padding: 18px; }
</style></head><body>
<div class="brand">casa<span>.care</span></div>
<h1>${esc(doc.title)}</h1>
${doc.subtitle ? `<div class="sub">${esc(doc.subtitle)}</div>` : ''}
<div class="meta">Generated ${esc(stamp())}</div>
${summary}${sections}
</body></html>`
}

export function printDocument(doc) {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;'
  document.body.appendChild(iframe)

  const win = iframe.contentWindow
  win.document.open()
  win.document.write(buildHTML(doc))
  win.document.close()

  const run = () => {
    win.focus()
    win.print()
    setTimeout(() => iframe.remove(), 1500)
  }
  // give the iframe a moment to lay out before opening the print dialog
  if (win.document.readyState === 'complete') setTimeout(run, 150)
  else iframe.onload = () => setTimeout(run, 150)
}

/* ------------------------------------------------------------------ */
/* PDF                                                                 */
/* ------------------------------------------------------------------ */
export async function downloadPDF(doc, filename) {
  // loaded on demand so the PDF library is not part of the main bundle
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ])

  const wide = (doc.sections || []).some((s) => (s.columns || []).length > 6)
  const pdf = new jsPDF({ orientation: wide ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const margin = 40
  const CORAL = [255, 122, 80]
  const INK = [31, 41, 55]
  const MUTED = [107, 114, 128]

  let y = margin
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11); pdf.setTextColor(...CORAL)
  pdf.text('casa', margin, y)
  pdf.setTextColor(...INK)
  pdf.text('.care', margin + pdf.getTextWidth('casa'), y)

  y += 24
  pdf.setFontSize(18); pdf.setTextColor(...INK)
  pdf.text(String(doc.title), margin, y)

  if (doc.subtitle) {
    y += 16
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10.5); pdf.setTextColor(...MUTED)
    pdf.text(String(doc.subtitle), margin, y)
  }
  y += 14
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(150, 156, 168)
  pdf.text(`Generated ${stamp()}`, margin, y)
  y += 10

  if ((doc.summary || []).length) {
    autoTable(pdf, {
      startY: y + 4,
      body: doc.summary.map(([k, v]) => [String(k), String(v)]),
      theme: 'plain',
      styles: { fontSize: 10, cellPadding: { top: 2, bottom: 2, left: 6, right: 6 } },
      columnStyles: { 0: { textColor: MUTED, cellWidth: 170 }, 1: { fontStyle: 'bold', textColor: INK } },
      margin: { left: margin, right: margin },
    })
    y = pdf.lastAutoTable.finalY + 6
  }

  for (const s of doc.sections || []) {
    if (s.heading) {
      if (y > pageH - 90) { pdf.addPage(); y = margin }
      y += 14
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(12); pdf.setTextColor(...INK)
      pdf.text(String(s.heading), margin, y)
      y += 4
    }
    const cols = s.columns || []
    const columnStyles = {}
    cols.forEach((c, i) => { if (c.align === 'right') columnStyles[i] = { halign: 'right' } })
    const body = (s.rows || []).map((r) => r.map((v) => String(v ?? '')))
    if (s.totals) body.push(s.totals.map((v) => String(v ?? '')))
    if (!body.length) body.push([{ content: 'No records.', colSpan: cols.length || 1, styles: { halign: 'center', textColor: MUTED } }])

    autoTable(pdf, {
      startY: y + 6,
      head: [cols.map((c) => ({ content: String(c.header), styles: c.align === 'right' ? { halign: 'right' } : {} }))],
      body,
      columnStyles,
      styles: { fontSize: 9, cellPadding: 5, textColor: INK, lineColor: [229, 231, 235], lineWidth: 0.4 },
      headStyles: { fillColor: [255, 241, 234], textColor: [154, 61, 26], fontStyle: 'bold', lineColor: CORAL, lineWidth: { bottom: 1.2 } },
      alternateRowStyles: { fillColor: [250, 251, 253] },
      didParseCell: (d) => {
        if (s.totals && d.section === 'body' && d.row.index === body.length - 1) {
          d.cell.styles.fontStyle = 'bold'
          d.cell.styles.fillColor = [241, 245, 249]
        }
      },
      margin: { left: margin, right: margin, bottom: 40 },
    })
    y = pdf.lastAutoTable.finalY + 6
  }

  const pages = pdf.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i)
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5); pdf.setTextColor(150, 156, 168)
    pdf.text('casa.care Rental Management', margin, pageH - 20)
    pdf.text(`Page ${i} of ${pages}`, pageW - margin, pageH - 20, { align: 'right' })
  }

  pdf.save(`${slug(filename || doc.title)}.pdf`)
}
