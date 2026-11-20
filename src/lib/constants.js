export const MONTHS = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export const MONTHS_SHORT = [
  '', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

export function formatKES(amount) {
  const n = Number(amount || 0)
  return 'KES ' + n.toLocaleString('en-KE', { maximumFractionDigits: 0 })
}

export function formatNumber(amount, decimals = 0) {
  const n = Number(amount || 0)
  return n.toLocaleString('en-KE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

/* ------------------------------------------------------------------
 * Dates
 * Everything is STORED as ISO (yyyy-mm-dd) and SHOWN / TYPED as dd/mm/yy.
 * All helpers work on the strings directly (no Date objects) so there are
 * no timezone surprises.
 * ------------------------------------------------------------------ */

/** '2026-11-05' -> '05/11/26'   ('' / null -> '') */
export function isoToDisplay(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '')
  return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : ''
}

/** '05/11/26' -> '2026-11-05'; returns null if it isn't a real calendar date. Two-digit years are 20yy. */
export function displayToISO(text) {
  const m = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(text || '')
  if (!m) return null
  const d = Number(m[1]), mo = Number(m[2]), y = 2000 + Number(m[3])
  const check = new Date(Date.UTC(y, mo - 1, d))
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Display format for dates shown in tables: dd/mm/yy, or an em dash if empty. */
export function formatDate(iso) {
  return isoToDisplay(iso) || '—'
}

function pad(n) { return String(n).padStart(2, '0') }

/** Today as ISO, using the browser's local clock (Nairobi for you), not UTC. */
export function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** ISO date n days from today (local clock). */
export function addDaysISO(n) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** '2026-10-01' -> 'Oct 2026' */
export function formatPeriod(iso) {
  const m = /^(\d{4})-(\d{2})/.exec(iso || '')
  return m ? `${MONTHS_SHORT[Number(m[2])]} ${m[1]}` : '—'
}

/** The last n calendar months (oldest first) as { key:'2026-11', label:'Nov', year, month } */
export function lastMonths(n = 6) {
  const now = new Date()
  const out = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    out.push({
      key: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`,
      label: MONTHS_SHORT[d.getMonth() + 1],
      year: d.getFullYear(),
      month: d.getMonth() + 1,
    })
  }
  return out
}

/** First day of the oldest of the last n months, as ISO. */
export function firstOfMonthsAgo(n = 6) {
  return `${lastMonths(n)[0].key}-01`
}

export function sum(rows, field) {
  return (rows || []).reduce((s, r) => s + Number(r[field] || 0), 0)
}
