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

export function formatDate(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10)
}
