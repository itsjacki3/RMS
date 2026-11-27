import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Layout from '../components/Layout'
import Icon from '../components/Icon'
import BarChart from '../components/BarChart'
import ExportButtons from '../components/ExportButtons'
import Pagination, { usePaged } from '../components/Pagination'
import { supabase } from '../supabaseClient'
import { ensureCharges, fetchAll, getSettings } from '../lib/api'
import { formatKES, formatNumber, formatDate, lastMonths, todayISO, sum } from '../lib/constants'

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'rent', label: 'Rent & Arrears' },
  { key: 'units', label: 'Occupancy & Units' },
  { key: 'maintenance', label: 'Maintenance' },
  { key: 'water', label: 'Water & Utilities' },
  { key: 'activity', label: 'System Activity' },
]

const C = { coral: '#ff7a50', teal: '#23c7b7', blue: '#3e8ef7', amber: '#f5a623', violet: '#8b7cf6', pink: '#f35f86' }

/* ------------------------------------------------------------------ */
/* small helpers                                                       */
/* ------------------------------------------------------------------ */
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0)
const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + 's'}`
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '')
const mk = (iso) => (iso || '').slice(0, 7)
const day = (iso) => (iso || '').slice(0, 10)
const daysBetween = (a, b) => Math.round((new Date(`${day(b)}T00:00:00`) - new Date(`${day(a)}T00:00:00`)) / 86400000)
const avg = (arr) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0)
const monthLabel = (m) => `${m.label} ${m.year}`
const keyLabel = (key, ms) => { const m = ms.find((x) => x.key === key); return m ? monthLabel(m) : key }
const STATUS = { open: 'Open', in_progress: 'In Progress', resolved: 'Resolved' }

function groupBy(rows, fn) {
  const out = new Map()
  rows.forEach((r) => { const k = fn(r); if (!out.has(k)) out.set(k, []); out.get(k).push(r) })
  return out
}

/** Everything the report builders share, computed once per window. */
function makeContext(d, n) {
  const ms = lastMonths(n)
  const keys = new Set(ms.map((m) => m.key))
  const inWin = (iso) => keys.has(mk(iso))
  const today = todayISO()
  return {
    d, ms, n, today, inWin, thisKey: today.slice(0, 7),
    ledgerW: d.ledger.filter((r) => inWin(r.period_start)),
    paymentsW: d.payments.filter((p) => inWin(p.payment_date)),
    readingsW: d.readings.filter((w) => inWin(w.period_start)),
    requestsW: d.requests.filter((r) => inWin(r.date_reported)),
    tenantById: Object.fromEntries(d.tenants.map((t) => [t.id, t])),
    unitById: Object.fromEntries(d.units.map((u) => [u.id, u])),
  }
}

function monthlyBilling(c) {
  return c.ms.map((m) => {
    const l = c.ledgerW.filter((r) => mk(r.period_start) === m.key)
    const p = c.paymentsW.filter((r) => mk(r.payment_date) === m.key)
    const billed = sum(l, 'total_charge')
    const collected = sum(p, 'amount')
    return {
      m, billed, collected, rate: pct(collected, billed),
      rent: sum(l, 'rent_amount'), water: sum(l, 'water_amount'),
      garbage: sum(l, 'garbage_amount'), maintenance: sum(l, 'maintenance_amount'),
    }
  })
}

/* ------------------------------------------------------------------ */
/* Report builders: each returns                                       */
/*   { title, subtitle, kpis, insights, charts, sections }             */
/* All table cells are plain text, so the same data feeds the screen,  */
/* the printout and the PDF.                                           */
/* ------------------------------------------------------------------ */
function buildOverview(c) {
  const { d, ms, n } = c
  const monthly = monthlyBilling(c)
  const billed = sum(monthly, 'billed')
  const collected = sum(monthly, 'collected')
  const totalUnits = d.units.length
  const occupied = d.units.filter((u) => u.status === 'occupied').length
  const overdue = d.balances.filter((b) => Number(b.months_overdue) > 0)
  const overdueAmt = sum(overdue, 'overdue_amount')
  const open = d.requests.filter((r) => r.status !== 'resolved')
  const vacant = d.units.filter((u) => u.status === 'vacant')

  const insights = []
  insights.push(`Over the last ${n} months ${formatKES(collected)} was collected against ${formatKES(billed)} billed (${pct(collected, billed)}%).`)
  if (overdue.length) {
    const top = [...overdue].sort((a, b) => Number(b.overdue_amount) - Number(a.overdue_amount))[0]
    insights.push(`${plural(overdue.length, 'tenant is', 'tenants are')} overdue, owing ${formatKES(overdueAmt)} in total. The largest is ${top.full_name} (${formatKES(top.overdue_amount)}).`)
  } else insights.push('No tenants are overdue.')
  if (vacant.length) {
    insights.push(`${plural(vacant.length, 'unit is', 'units are')} vacant (${vacant.slice(0, 4).map((u) => u.unit_number).join(', ')}${vacant.length > 4 ? '…' : ''}), leaving about ${formatKES(sum(vacant, 'rent_amount'))} of monthly rent unearned.`)
  } else if (totalUnits) insights.push('Every unit is occupied or under maintenance.')
  const stale = open.filter((r) => daysBetween(r.date_reported, c.today) > 14)
  if (stale.length) insights.push(`${plural(stale.length, 'maintenance request has', 'maintenance requests have')} been open for more than 14 days.`)
  const readingKeys = new Set(d.readings.map((w) => `${w.tenant_id}|${w.period_start}`))
  const missing = d.ledger.filter((r) => mk(r.period_start) === c.thisKey && !readingKeys.has(`${r.tenant_id}|${r.period_start}`))
  if (missing.length) insights.push(`${plural(missing.length, 'tenant bill')} for this month still ${missing.length === 1 ? 'has' : 'have'} no water reading.`)

  return {
    title: 'Overview',
    subtitle: `Key figures and what needs attention, last ${n} months`,
    kpis: [
      { label: 'Occupancy Rate', value: `${pct(occupied, totalUnits)}%`, icon: 'units', color: 'coral' },
      { label: 'Collection Rate', value: `${pct(collected, billed)}%`, icon: 'rent', color: 'teal' },
      { label: 'Overdue Amount', value: formatKES(overdueAmt), icon: 'clock', color: 'pink' },
      { label: 'Open Maintenance', value: String(open.length), icon: 'maintenance', color: 'amber' },
    ],
    insights,
    charts: [{
      title: 'Billed vs collected', money: true, labels: monthly.map((r) => r.m.label),
      datasets: [{ label: 'Billed', data: monthly.map((r) => r.billed), color: C.coral }, { label: 'Collected', data: monthly.map((r) => r.collected), color: C.teal }],
    }],
    sections: [{
      heading: `Monthly billing & collections (last ${n} months)`,
      columns: [{ header: 'Month' }, { header: 'Rent', align: 'right' }, { header: 'Water', align: 'right' }, { header: 'Garbage', align: 'right' },
        { header: 'Maintenance', align: 'right' }, { header: 'Total Billed', align: 'right' }, { header: 'Collected', align: 'right' }, { header: 'Collection %', align: 'right' }],
      rows: [...monthly].reverse().map((r) => [monthLabel(r.m), formatKES(r.rent), formatKES(r.water), formatKES(r.garbage), formatKES(r.maintenance), formatKES(r.billed), formatKES(r.collected), `${r.rate}%`]),
      totals: ['Total', formatKES(sum(monthly, 'rent')), formatKES(sum(monthly, 'water')), formatKES(sum(monthly, 'garbage')), formatKES(sum(monthly, 'maintenance')), formatKES(billed), formatKES(collected), `${pct(collected, billed)}%`],
      note: 'The current month is still in progress. Collection % can pass 100% when old arrears are paid off in a later month.',
    }],
  }
}

function buildRent(c) {
  const { d, n } = c
  const dueDay = Number(d.settings?.rent_due_day || 5)
  const onTime = c.paymentsW.filter((p) => Number(day(p.payment_date).slice(8, 10)) <= dueDay).length

  // arrears ageing: how long overdue bills have been overdue
  const buckets = [
    { label: '1–30 days', min: 1, max: 30 }, { label: '31–60 days', min: 31, max: 60 },
    { label: '61–90 days', min: 61, max: 90 }, { label: 'Over 90 days', min: 91, max: Infinity },
  ].map((b) => {
    const rows = d.ledger.filter((r) => r.status === 'overdue').filter((r) => { const age = daysBetween(r.due_date, c.today); return age >= b.min && age <= b.max })
    return { ...b, tenants: new Set(rows.map((r) => r.tenant_id)).size, amount: sum(rows, 'outstanding') }
  })

  const lastPaid = {}
  d.payments.forEach((p) => { if (!lastPaid[p.tenant_id] || p.payment_date > lastPaid[p.tenant_id]) lastPaid[p.tenant_id] = p.payment_date })
  const debtors = d.balances.filter((b) => Number(b.amount_due) > 0)
    .sort((a, b) => Number(b.overdue_amount) - Number(a.overdue_amount) || Number(b.amount_due) - Number(a.amount_due))
  const overdueAmt = sum(d.balances, 'overdue_amount')
  const formerOwing = d.balances.filter((b) => b.tenant_status !== 'active' && Number(b.balance) > 0)

  const methods = [...groupBy(c.paymentsW, (p) => p.method || 'Unspecified')].map(([method, rows]) => ({ method, count: rows.length, amount: sum(rows, 'amount') }))
    .sort((a, b) => b.amount - a.amount)
  const totalPaid = sum(c.paymentsW, 'amount')
  const monthly = monthlyBilling(c)

  const insights = []
  if (debtors.length) {
    insights.push(`${formatKES(sum(debtors, 'amount_due'))} is outstanding across ${plural(debtors.length, 'tenant')}, of which ${formatKES(overdueAmt)} is already overdue.`)
  } else insights.push('Nobody owes anything right now.')
  const old = buckets[2].amount + buckets[3].amount
  if (old > 0) insights.push(`${formatKES(old)} has been overdue for more than 60 days. These accounts are the most urgent to follow up.`)
  if (formerOwing.length) insights.push(`${plural(formerOwing.length, 'former tenant')} still owe${formerOwing.length === 1 ? 's' : ''} ${formatKES(sum(formerOwing, 'balance'))} after moving out.`)
  if (c.paymentsW.length) insights.push(`${pct(onTime, c.paymentsW.length)}% of payments in this period arrived on or before day ${dueDay} of the month.`)
  if (methods[0]) insights.push(`${methods[0].method} is the most used payment method (${pct(methods[0].amount, totalPaid)}% of money received).`)

  return {
    title: 'Rent & Arrears',
    subtitle: `Who owes what, how overdue it is and how rent is being paid, last ${n} months`,
    kpis: [
      { label: 'Total Amount Due', value: formatKES(sum(d.balances, 'amount_due')), icon: 'rent', color: 'coral' },
      { label: 'Overdue', value: formatKES(overdueAmt), icon: 'clock', color: 'pink' },
      { label: 'Tenants Owing', value: String(debtors.length), icon: 'tenants', color: 'amber' },
      { label: 'Paid by Due Date', value: `${pct(onTime, c.paymentsW.length)}%`, icon: 'check', color: 'teal' },
    ],
    insights,
    charts: [{
      title: 'Collection rate by month (%)', labels: monthly.map((r) => r.m.label),
      datasets: [{ label: 'Collection %', data: monthly.map((r) => r.rate), color: C.teal }],
    }],
    sections: [
      {
        heading: 'Arrears ageing', half: true,
        columns: [{ header: 'Overdue for' }, { header: 'Tenants', align: 'right' }, { header: 'Amount', align: 'right' }],
        rows: buckets.map((b) => [b.label, String(b.tenants), formatKES(b.amount)]),
        totals: ['Total', '', formatKES(sum(buckets, 'amount'))],
      },
      {
        heading: 'Payment methods', half: true,
        columns: [{ header: 'Method' }, { header: 'Payments', align: 'right' }, { header: 'Amount', align: 'right' }, { header: 'Share', align: 'right' }],
        rows: methods.map((m) => [m.method, String(m.count), formatKES(m.amount), `${pct(m.amount, totalPaid)}%`]),
        totals: ['Total', String(c.paymentsW.length), formatKES(totalPaid), ''],
      },
      {
        heading: 'Tenants with an outstanding balance',
        note: 'Largest overdue amounts first. Former tenants who still owe money are included.',
        columns: [{ header: 'Tenant' }, { header: 'Unit' }, { header: 'Status' }, { header: 'Months Overdue', align: 'right' },
          { header: 'Overdue', align: 'right' }, { header: 'Total Due', align: 'right' }, { header: 'Last Payment' }],
        rows: debtors.map((b) => [b.full_name, b.unit_number || '—', b.tenant_status === 'active' ? 'Active' : 'Vacated',
          String(b.months_overdue), formatKES(b.overdue_amount), formatKES(b.amount_due), lastPaid[b.tenant_id] ? formatDate(lastPaid[b.tenant_id]) : 'Never']),
        totals: ['Total', '', '', '', formatKES(overdueAmt), formatKES(sum(debtors, 'amount_due')), ''],
      },
    ],
  }
}

function buildUnits(c) {
  const { d, ms, n } = c
  const occupied = d.units.filter((u) => u.status === 'occupied')
  const vacant = d.units.filter((u) => u.status === 'vacant')
  const inMaint = d.units.filter((u) => u.status === 'maintenance')
  const potential = sum(d.units.filter((u) => u.status !== 'maintenance'), 'rent_amount')
  const earning = sum(occupied, 'rent_amount')

  const perUnit = d.units.map((u) => {
    const tenants = d.tenants.filter((t) => t.unit_id === u.id)
    const current = tenants.find((t) => t.status === 'active')
    const bal = d.balances.filter((b) => b.unit_id === u.id)
    const reqs = d.requests.filter((r) => r.unit_id === u.id)
    return { u, current, billed: sum(bal, 'total_charged'), paid: sum(bal, 'total_paid'), reqs: reqs.length, repair: sum(reqs, 'cost') }
  }).sort((a, b) => String(a.u.unit_number).localeCompare(String(b.u.unit_number), undefined, { numeric: true }))

  const moves = ms.map((m) => ({
    m,
    ins: d.tenants.filter((t) => mk(t.move_in_date) === m.key).length,
    outs: d.tenants.filter((t) => mk(t.move_out_date) === m.key).length,
  }))
  const stays = d.tenants.filter((t) => t.status !== 'active' && t.move_in_date && t.move_out_date)
    .map((t) => daysBetween(t.move_in_date, t.move_out_date) / 30.4)
  const activeStays = d.tenants.filter((t) => t.status === 'active' && t.move_in_date).map((t) => daysBetween(t.move_in_date, c.today) / 30.4)
  const best = [...perUnit].filter((r) => r.paid > 0).sort((a, b) => b.paid - a.paid)[0]

  const insights = []
  insights.push(`${pct(occupied.length, d.units.length)}% of units are occupied (${occupied.length} of ${d.units.length}).`)
  if (vacant.length) insights.push(`Vacant units are costing about ${formatKES(sum(vacant, 'rent_amount'))} a month, or ${pct(sum(vacant, 'rent_amount'), potential)}% of potential rent.`)
  if (best) insights.push(`Unit ${best.u.unit_number} has brought in the most money so far (${formatKES(best.paid)} collected).`)
  const repeat = [...perUnit].sort((a, b) => b.reqs - a.reqs)[0]
  if (repeat && repeat.reqs >= 3) insights.push(`Unit ${repeat.u.unit_number} has had ${repeat.reqs} maintenance requests, the most of any unit. It may need a proper fix rather than another repair.`)
  if (stays.length) insights.push(`Tenants who have left stayed ${formatNumber(avg(stays), 1)} months on average.`)

  return {
    title: 'Occupancy & Units',
    subtitle: 'How the building is being used, unit by unit',
    kpis: [
      { label: 'Occupancy Rate', value: `${pct(occupied.length, d.units.length)}%`, icon: 'units', color: 'coral' },
      { label: 'Vacant Units', value: String(vacant.length), icon: 'units', color: 'amber' },
      { label: 'Rent Roll (Occupied)', value: formatKES(earning), icon: 'rent', color: 'teal' },
      { label: 'Vacancy Loss / Month', value: formatKES(sum(vacant, 'rent_amount')), icon: 'clock', color: 'pink' },
    ],
    insights,
    charts: [{
      title: `Move-ins and move-outs (last ${n} months)`, labels: moves.map((r) => r.m.label),
      datasets: [{ label: 'Move-ins', data: moves.map((r) => r.ins), color: C.teal }, { label: 'Move-outs', data: moves.map((r) => r.outs), color: C.coral }],
    }],
    sections: [
      {
        heading: 'Unit summary', half: true,
        columns: [{ header: 'Measure' }, { header: 'Value', align: 'right' }],
        rows: [
          ['Total units', String(d.units.length)], ['Occupied', String(occupied.length)], ['Vacant', String(vacant.length)],
          ['Under maintenance', String(inMaint.length)], ['Potential monthly rent', formatKES(potential)], ['Monthly rent being earned', formatKES(earning)],
          ['Average rent per unit', formatKES(d.units.length ? sum(d.units, 'rent_amount') / d.units.length : 0)],
          ['Average stay (former tenants)', stays.length ? `${formatNumber(avg(stays), 1)} months` : '—'],
          ['Average tenancy so far (current)', activeStays.length ? `${formatNumber(avg(activeStays), 1)} months` : '—'],
        ],
      },
      {
        heading: 'Turnover by month', half: true,
        columns: [{ header: 'Month' }, { header: 'Move-ins', align: 'right' }, { header: 'Move-outs', align: 'right' }],
        rows: [...moves].reverse().map((r) => [monthLabel(r.m), String(r.ins), String(r.outs)]),
        totals: ['Total', String(sum(moves, 'ins')), String(sum(moves, 'outs'))],
      },
      {
        heading: 'Performance by unit',
        note: 'Billed and collected are all-time totals for everyone who has rented the unit.',
        columns: [{ header: 'Unit' }, { header: 'Floor' }, { header: 'Beds', align: 'right' }, { header: 'Status' }, { header: 'Rent', align: 'right' },
          { header: 'Current Tenant' }, { header: 'Since' }, { header: 'Billed', align: 'right' }, { header: 'Collected', align: 'right' },
          { header: 'Repairs', align: 'right' }, { header: 'Repair Cost', align: 'right' }],
        rows: perUnit.map((r) => [r.u.unit_number, r.u.floor || '—', String(r.u.bedrooms ?? ''), cap(r.u.status), formatKES(r.u.rent_amount),
          r.current?.full_name || '—', r.current ? formatDate(r.current.move_in_date) : '—', formatKES(r.billed), formatKES(r.paid), String(r.reqs), formatKES(r.repair)]),
        totals: ['Total', '', '', '', formatKES(sum(d.units, 'rent_amount')), '', '', formatKES(sum(perUnit, 'billed')), formatKES(sum(perUnit, 'paid')),
          String(sum(perUnit, 'reqs')), formatKES(sum(perUnit, 'repair'))],
      },
    ],
  }
}

function buildMaintenance(c) {
  const { d, ms, n } = c
  const all = d.requests
  const w = c.requestsW
  const open = all.filter((r) => r.status !== 'resolved')
  const resolvedDays = (rows) => rows.filter((r) => r.status === 'resolved' && r.date_resolved && r.date_reported).map((r) => daysBetween(r.date_reported, r.date_resolved))
  const charged = w.filter((r) => r.bill_to_tenant && Number(r.cost) > 0)
  const absorbed = w.filter((r) => !r.bill_to_tenant && Number(r.cost) > 0)

  const byCat = [...groupBy(w, (r) => r.category)].map(([cat, rows]) => ({ cat, count: rows.length, cost: sum(rows, 'cost'), days: avg(resolvedDays(rows)), hasDays: resolvedDays(rows).length > 0 }))
    .sort((a, b) => b.count - a.count)
  const byUnit = [...groupBy(w.filter((r) => r.unit_id), (r) => r.unit_id)].map(([uid, rows]) => ({
    unit: c.unitById[uid]?.unit_number || '—', count: rows.length, cost: sum(rows, 'cost'), last: rows.map((r) => r.date_reported).sort().pop(),
  })).sort((a, b) => b.count - a.count || b.cost - a.cost)
  const monthly = ms.map((m) => {
    const logged = w.filter((r) => mk(r.date_reported) === m.key)
    return { m, logged: logged.length, resolved: all.filter((r) => r.date_resolved && mk(r.date_resolved) === m.key).length, cost: sum(logged, 'cost') }
  })
  const stale = open.filter((r) => daysBetween(r.date_reported, c.today) > 14).sort((a, b) => a.date_reported.localeCompare(b.date_reported))
  const topCat = byCat[0]

  const insights = []
  insights.push(`${plural(w.length, 'request was', 'requests were')} logged in the last ${n} months; ${plural(open.length, 'request is', 'requests are')} still open or in progress.`)
  if (topCat) insights.push(`${cap(topCat.cat)} problems are the most common (${topCat.count} of ${w.length}, ${pct(topCat.count, w.length)}%).`)
  const days = resolvedDays(w)
  if (days.length) insights.push(`Resolved requests took ${formatNumber(avg(days), 1)} days on average to close.`)
  if (sum(w, 'cost') > 0) insights.push(`Repairs cost ${formatKES(sum(w, 'cost'))}: ${formatKES(sum(charged, 'cost'))} was charged to tenants and ${formatKES(sum(absorbed, 'cost'))} was absorbed by the landlord.`)
  if (stale.length) insights.push(`${plural(stale.length, 'request has', 'requests have')} been open for over 14 days, the oldest since ${formatDate(stale[0].date_reported)}.`)
  const high = open.filter((r) => r.priority === 'high')
  if (high.length) insights.push(`${plural(high.length, 'high-priority request is', 'high-priority requests are')} still unresolved.`)

  return {
    title: 'Maintenance',
    subtitle: `Repair requests, costs and response times, last ${n} months`,
    kpis: [
      { label: 'Requests Logged', value: String(w.length), icon: 'maintenance', color: 'amber' },
      { label: 'Open Now', value: String(open.length), icon: 'clock', color: 'pink' },
      { label: 'Avg Days to Resolve', value: days.length ? formatNumber(avg(days), 1) : '—', icon: 'check', color: 'teal' },
      { label: 'Repair Cost', value: formatKES(sum(w, 'cost')), icon: 'rent', color: 'coral' },
    ],
    insights,
    charts: [
      { title: 'Requests logged vs resolved', labels: monthly.map((r) => r.m.label),
        datasets: [{ label: 'Logged', data: monthly.map((r) => r.logged), color: C.amber }, { label: 'Resolved', data: monthly.map((r) => r.resolved), color: C.teal }] },
      { title: 'Repair cost by month', money: true, labels: monthly.map((r) => r.m.label), datasets: [{ label: 'Cost', data: monthly.map((r) => r.cost), color: C.coral }] },
    ],
    sections: [
      {
        heading: 'By category', half: true,
        columns: [{ header: 'Category' }, { header: 'Requests', align: 'right' }, { header: 'Share', align: 'right' }, { header: 'Cost', align: 'right' }, { header: 'Avg Days', align: 'right' }],
        rows: byCat.map((r) => [cap(r.cat), String(r.count), `${pct(r.count, w.length)}%`, formatKES(r.cost), r.hasDays ? formatNumber(r.days, 1) : '—']),
        totals: ['Total', String(w.length), '', formatKES(sum(w, 'cost')), ''],
      },
      {
        heading: 'Who pays', half: true,
        columns: [{ header: 'Cost borne by' }, { header: 'Requests', align: 'right' }, { header: 'Amount', align: 'right' }],
        rows: [['Charged to tenants', String(charged.length), formatKES(sum(charged, 'cost'))], ['Landlord expense', String(absorbed.length), formatKES(sum(absorbed, 'cost'))]],
        totals: ['Total', String(charged.length + absorbed.length), formatKES(sum(charged, 'cost') + sum(absorbed, 'cost'))],
      },
      {
        heading: 'Units with the most requests', half: true,
        columns: [{ header: 'Unit' }, { header: 'Requests', align: 'right' }, { header: 'Cost', align: 'right' }, { header: 'Last Reported' }],
        rows: byUnit.map((r) => [r.unit, String(r.count), formatKES(r.cost), formatDate(r.last)]),
      },
      {
        heading: 'Status and priority', half: true,
        columns: [{ header: 'Group' }, { header: 'Count', align: 'right' }],
        rows: [
          ...['open', 'in_progress', 'resolved'].map((s) => [`Status: ${STATUS[s]}`, String(w.filter((r) => r.status === s).length)]),
          ...['high', 'medium', 'low'].map((p) => [`Priority: ${cap(p)}`, String(w.filter((r) => r.priority === p).length)]),
        ],
      },
      {
        heading: 'Open for more than 14 days',
        note: 'Requests that have waited longest. These are worth chasing first.',
        columns: [{ header: 'Reported' }, { header: 'Days Open', align: 'right' }, { header: 'Tenant' }, { header: 'Unit' }, { header: 'Category' }, { header: 'Priority' }, { header: 'Status' }, { header: 'Description' }],
        rows: stale.map((r) => [formatDate(r.date_reported), String(daysBetween(r.date_reported, c.today)), r.tenants?.full_name || '—', r.units?.unit_number || '—', cap(r.category), cap(r.priority), STATUS[r.status], r.description]),
      },
    ],
  }
}

function buildWater(c) {
  const { d, ms, n } = c
  const monthly = ms.map((m) => {
    const rd = c.readingsW.filter((w) => mk(w.period_start) === m.key)
    const l = c.ledgerW.filter((r) => mk(r.period_start) === m.key)
    const keys = new Set(rd.map((w) => w.tenant_id))
    return { m, units: sum(rd, 'units_used'), water: sum(l, 'water_amount'), garbage: sum(l, 'garbage_amount'), readings: rd.length, bills: l.length, missing: l.filter((r) => !keys.has(r.tenant_id)).length }
  })
  const totalUnits = sum(c.readingsW, 'units_used')
  const readingKeys = new Set(d.readings.map((w) => `${w.tenant_id}|${w.period_start}`))
  const missingRows = c.ledgerW.filter((r) => !readingKeys.has(`${r.tenant_id}|${r.period_start}`))
  const missingByTenant = [...groupBy(missingRows, (r) => r.tenant_id)].map(([tid, rows]) => {
    const t = c.tenantById[tid]
    return { name: t?.full_name || 'Unknown', unit: t?.units?.unit_number || '—', count: rows.length, latest: rows.map((r) => r.period_start).sort().pop() }
  }).sort((a, b) => b.count - a.count)
  const consumers = [...groupBy(c.readingsW, (w) => w.tenant_id)].map(([tid, rows]) => {
    const t = c.tenantById[tid]
    return { name: t?.full_name || 'Unknown', unit: t?.units?.unit_number || '—', months: rows.length, units: sum(rows, 'units_used'), billed: sum(rows, 'amount') }
  }).sort((a, b) => b.units - a.units)
  const peak = [...monthly].sort((a, b) => b.units - a.units)[0]
  const avgPer = c.readingsW.length ? totalUnits / c.readingsW.length : 0
  const heavy = consumers.filter((r) => r.months && r.units / r.months > avgPer * 1.5)
  const garbage = sum(c.ledgerW, 'garbage_amount')

  const insights = []
  if (c.readingsW.length) insights.push(`${formatNumber(totalUnits, 1)} water units were used in the last ${n} months, billed at ${formatKES(sum(c.readingsW, 'amount'))}. That is ${formatNumber(avgPer, 1)} units per tenant per month.`)
  else insights.push('No water readings have been entered in this period.')
  if (peak && peak.units > 0) insights.push(`${monthLabel(peak.m)} had the highest water use (${formatNumber(peak.units, 1)} units).`)
  if (heavy.length) insights.push(`${plural(heavy.length, 'tenant uses', 'tenants use')} over 50% more water than the average (${heavy.slice(0, 3).map((r) => r.name).join(', ')}${heavy.length > 3 ? '…' : ''}). Worth checking for leaks.`)
  if (missingRows.length) insights.push(`${plural(missingRows.length, 'bill')} in this period ${missingRows.length === 1 ? 'has' : 'have'} no water reading, so water was not charged for ${missingRows.length === 1 ? 'it' : 'them'}.`)
  if (garbage > 0) insights.push(`Garbage fees billed in this period come to ${formatKES(garbage)}.`)

  return {
    title: 'Water & Utilities',
    subtitle: `Water use, billing and missing readings, last ${n} months`,
    kpis: [
      { label: 'Water Units Used', value: formatNumber(totalUnits, 1), icon: 'water', color: 'blue' },
      { label: 'Water Billed', value: formatKES(sum(c.readingsW, 'amount')), icon: 'rent', color: 'teal' },
      { label: 'Garbage Billed', value: formatKES(garbage), icon: 'garbage', color: 'amber' },
      { label: 'Bills Missing a Reading', value: String(missingRows.length), icon: 'clock', color: 'pink' },
    ],
    insights,
    charts: [{ title: 'Water units used by month', labels: monthly.map((r) => r.m.label), datasets: [{ label: 'Units', data: monthly.map((r) => Math.round(r.units * 10) / 10), color: C.blue }] }],
    sections: [
      {
        heading: 'Usage by month', half: true,
        columns: [{ header: 'Month' }, { header: 'Units Used', align: 'right' }, { header: 'Water Billed', align: 'right' }, { header: 'Garbage', align: 'right' }, { header: 'Readings', align: 'right' }, { header: 'Missing', align: 'right' }],
        rows: [...monthly].reverse().map((r) => [monthLabel(r.m), formatNumber(r.units, 1), formatKES(r.water), formatKES(r.garbage), `${r.readings} of ${r.bills}`, String(r.missing)]),
        totals: ['Total', formatNumber(totalUnits, 1), formatKES(sum(monthly, 'water')), formatKES(garbage), '', String(sum(monthly, 'missing'))],
      },
      {
        heading: 'Highest water users', half: true,
        columns: [{ header: 'Tenant' }, { header: 'Unit' }, { header: 'Months', align: 'right' }, { header: 'Total Units', align: 'right' }, { header: 'Avg / Month', align: 'right' }, { header: 'Billed', align: 'right' }],
        rows: consumers.map((r) => [r.name, r.unit, String(r.months), formatNumber(r.units, 1), formatNumber(r.months ? r.units / r.months : 0, 1), formatKES(r.billed)]),
      },
      {
        heading: 'Readings still to enter',
        note: 'Months with a bill but no water reading. Enter them on the tenant’s profile under Water Readings.',
        columns: [{ header: 'Tenant' }, { header: 'Unit' }, { header: 'Months Missing', align: 'right' }, { header: 'Latest Month Missing' }],
        rows: missingByTenant.map((r) => [r.name, r.unit, String(r.count), r.latest ? keyLabel(mk(r.latest), ms) : '—']),
      },
    ],
  }
}

function buildActivity(c) {
  const { d, ms, n } = c
  const latest = (rows, f) => rows.map(f).filter(Boolean).sort().pop()
  const rec = (rows, f, key) => rows.filter((r) => mk(f(r)) === key).length

  const monthly = ms.map((m) => ({
    m,
    payments: rec(d.payments, (r) => r.created_at, m.key),
    readings: rec(d.readings, (r) => r.created_at, m.key),
    requests: rec(d.requests, (r) => r.created_at, m.key),
    tenants: rec(d.tenants, (r) => r.created_at, m.key),
  }))

  const gaps = []
  d.tenants.filter((t) => t.status === 'active').forEach((t) => {
    const missing = []
    if (!t.phone) missing.push('phone')
    if (!t.email) missing.push('email')
    if (!t.id_number) missing.push('national ID')
    if (!t.move_in_date) missing.push('move-in date')
    if (!t.unit_id) missing.push('unit')
    if (missing.length) gaps.push([t.full_name, t.units?.unit_number || '—', missing.map(cap).join(', '), String(missing.length)])
  })
  gaps.sort((a, b) => Number(b[3]) - Number(a[3]) || a[0].localeCompare(b[0]))
  const unitsNoFloor = d.units.filter((u) => !u.floor).length

  const lastRows = [
    ['Last payment recorded', latest(d.payments, (r) => day(r.created_at))],
    ['Last water reading entered', latest(d.readings, (r) => day(r.created_at))],
    ['Last maintenance request logged', latest(d.requests, (r) => day(r.created_at))],
    ['Last tenant added', latest(d.tenants, (r) => day(r.created_at))],
  ].map(([k, v]) => [k, v ? formatDate(v) : 'Never'])

  const totalActions = sum(monthly, 'payments') + sum(monthly, 'readings') + sum(monthly, 'requests') + sum(monthly, 'tenants')
  const busiest = [...monthly].sort((a, b) => (b.payments + b.readings + b.requests + b.tenants) - (a.payments + a.readings + a.requests + a.tenants))[0]

  const insights = [`${plural(totalActions, 'record was', 'records were')} entered in the last ${n} months (payments, readings, requests and tenants).`]
  if (busiest && totalActions > 0) insights.push(`${monthLabel(busiest.m)} was the busiest month with ${busiest.payments + busiest.readings + busiest.requests + busiest.tenants} records.`)
  if (gaps.length) insights.push(`${plural(gaps.length, 'active tenant has', 'active tenants have')} incomplete details. Completing them makes follow-up and statements easier.`)
  const readingMonths = monthly.filter((r) => r.readings === 0 && c.ledgerW.some((l) => mk(l.period_start) === r.m.key)).length
  if (readingMonths) insights.push(`No water readings were entered in ${plural(readingMonths, 'month')} that had bills, so some usage may not have been recorded.`)

  return {
    title: 'System Activity',
    subtitle: `What has been recorded in the system, last ${n} months`,
    kpis: [
      { label: 'Payments on File', value: String(d.payments.length), icon: 'rent', color: 'teal' },
      { label: 'Tenants (all time)', value: String(d.tenants.length), icon: 'tenants', color: 'coral' },
      { label: 'Maintenance Requests', value: String(d.requests.length), icon: 'maintenance', color: 'amber' },
      { label: 'Water Readings', value: String(d.readings.length), icon: 'water', color: 'blue' },
    ],
    insights,
    charts: [{
      title: 'Records entered by month', labels: monthly.map((r) => r.m.label),
      datasets: [
        { label: 'Payments', data: monthly.map((r) => r.payments), color: C.teal }, { label: 'Readings', data: monthly.map((r) => r.readings), color: C.blue },
        { label: 'Requests', data: monthly.map((r) => r.requests), color: C.amber }, { label: 'Tenants', data: monthly.map((r) => r.tenants), color: C.coral },
      ],
    }],
    sections: [
      {
        heading: 'Records on file', half: true,
        columns: [{ header: 'Record' }, { header: 'Count', align: 'right' }],
        rows: [
          ['Units', String(d.units.length)], ['Active tenants', String(d.tenants.filter((t) => t.status === 'active').length)],
          ['Vacated tenants', String(d.tenants.filter((t) => t.status !== 'active').length)], ['Monthly bills', String(d.ledger.length)],
          ['Payments', String(d.payments.length)], ['Water readings', String(d.readings.length)], ['Maintenance requests', String(d.requests.length)],
        ],
      },
      { heading: 'Latest activity', half: true, columns: [{ header: 'Event' }, { header: 'Date' }], rows: lastRows },
      {
        heading: 'Records entered by month',
        columns: [{ header: 'Month' }, { header: 'Payments', align: 'right' }, { header: 'Water Readings', align: 'right' }, { header: 'Requests', align: 'right' }, { header: 'Tenants Added', align: 'right' }, { header: 'Total', align: 'right' }],
        rows: [...monthly].reverse().map((r) => [monthLabel(r.m), String(r.payments), String(r.readings), String(r.requests), String(r.tenants), String(r.payments + r.readings + r.requests + r.tenants)]),
        totals: ['Total', String(sum(monthly, 'payments')), String(sum(monthly, 'readings')), String(sum(monthly, 'requests')), String(sum(monthly, 'tenants')), String(totalActions)],
      },
      {
        heading: 'Details still to complete',
        note: `Active tenants with missing information.${unitsNoFloor ? ` ${plural(unitsNoFloor, 'unit has', 'units have')} no floor recorded.` : ''}`,
        columns: [{ header: 'Tenant' }, { header: 'Unit' }, { header: 'Missing' }, { header: 'Fields', align: 'right' }],
        rows: gaps,
      },
    ],
  }
}

const BUILDERS = { overview: buildOverview, rent: buildRent, units: buildUnits, maintenance: buildMaintenance, water: buildWater, activity: buildActivity }

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */
function ReportTable({ section }) {
  const pager = usePaged(section.rows, 10)
  const right = (i) => (section.columns[i]?.align === 'right' ? { textAlign: 'right' } : undefined)
  return (
    <div className={`card table-card${section.half ? '' : ' span-2'}`}>
      <div className="table-card-head"><h3>{section.heading}</h3></div>
      {section.note && <div className="filter-bar" style={{ paddingBottom: 10 }}><span className="cell-muted" style={{ fontSize: 13 }}>{section.note}</span></div>}
      <div className="table-scroll">
        <table>
          <thead><tr>{section.columns.map((c, i) => <th key={c.header} style={right(i)}>{c.header}</th>)}</tr></thead>
          <tbody>
            {section.rows.length === 0 && <tr><td colSpan={section.columns.length} className="empty-state">Nothing to show for this period.</td></tr>}
            {pager.pageRows.map((r, ri) => <tr key={ri}>{r.map((v, i) => <td key={i} style={right(i)} className={i === 0 ? 'cell-strong' : undefined}>{v}</td>)}</tr>)}
          </tbody>
          {section.totals && section.rows.length > 0 && (
            <tfoot><tr>{section.totals.map((v, i) => <td key={i} style={{ ...right(i), fontWeight: 700, background: '#fafbfd', padding: '12px 22px', fontSize: 14 }}>{v}</td>)}</tr></tfoot>
          )}
        </table>
      </div>
      <Pagination {...pager} />
    </div>
  )
}

export default function Reports() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requested = searchParams.get('tab')
  const tab = TABS.some((t) => t.key === requested) ? requested : 'overview'
  const [months, setMonths] = useState(6)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    try {
      await ensureCharges()
      const [units, tenants, balances, ledger, payments, readings, requests, settings] = await Promise.all([
        fetchAll(() => supabase.from('units').select('*').order('id')),
        fetchAll(() => supabase.from('tenants').select('*, units(unit_number)').order('id')),
        fetchAll(() => supabase.from('tenant_balances').select('*').order('tenant_id')),
        fetchAll(() => supabase.from('tenant_ledger')
          .select('tenant_id, period_start, due_date, rent_amount, water_amount, garbage_amount, maintenance_amount, total_charge, outstanding, status')
          .order('tenant_id').order('period_start')),
        fetchAll(() => supabase.from('payments').select('id, tenant_id, amount, payment_date, method, created_at').order('id')),
        fetchAll(() => supabase.from('water_readings').select('id, tenant_id, period_start, units_used, amount, created_at').order('id')),
        fetchAll(() => supabase.from('maintenance_requests').select('*, tenants(full_name), units(unit_number)').order('id')),
        getSettings(),
      ])
      setData({ units, tenants, balances, ledger, payments, readings, requests, settings })
    } catch (err) {
      setError(err.message)
    }
  }

  const report = useMemo(() => (data ? BUILDERS[tab](makeContext(data, months)) : null), [data, tab, months])

  const getDoc = () => ({
    title: `${report.title} Report`,
    subtitle: report.subtitle,
    summary: report.kpis.map((k) => [k.label, k.value]),
    sections: [
      ...(report.insights.length ? [{ heading: 'Key insights', columns: [{ header: 'Insight' }], rows: report.insights.map((i) => [i]) }] : []),
      ...report.sections.map((s) => ({ heading: s.heading, columns: s.columns, rows: s.rows, totals: s.totals })),
    ],
  })

  return (
    <Layout
      title="Reports"
      subtitle="Billing, occupancy, maintenance, utilities and system usage, with insights for decisions"
      actions={report && <ExportButtons getDoc={getDoc} filename={`${report.title}-report`} />}
    >
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={`tab${tab === t.key ? ' active' : ''}`}
            onClick={() => setSearchParams(t.key === 'overview' ? {} : { tab: t.key }, { replace: true })}>
            {t.label}
          </button>
        ))}
      </div>

      {error && <div className="alert alert-error">Could not load the report: {error}</div>}
      {!data && !error && <div className="empty-state">Loading report…</div>}

      {report && (
        <>
          <div className="report-toolbar">
            <div className="cell-muted">{report.subtitle}</div>
            <label className="cell-muted" style={{ fontSize: 13 }}>
              Period&nbsp;
              <select value={months} onChange={(e) => setMonths(Number(e.target.value))}>
                <option value={3}>Last 3 months</option>
                <option value={6}>Last 6 months</option>
                <option value={12}>Last 12 months</option>
              </select>
            </label>
          </div>

          <div className="stat-grid" style={{ marginBottom: 20 }}>
            {report.kpis.map((k) => (
              <div className="card stat-card" key={k.label}>
                <div className={`stat-icon ${k.color}`}><Icon name={k.icon} /></div>
                <div><div className="stat-label">{k.label}</div><div className="stat-value">{k.value}</div></div>
              </div>
            ))}
          </div>

          <div className="report-grid">
            {report.insights.length > 0 && (
              <div className="card table-card span-2">
                <div className="table-card-head"><h3>Key insights</h3></div>
                <ul className="insight-list">{report.insights.map((i) => <li key={i}>{i}</li>)}</ul>
              </div>
            )}
            {report.charts.map((ch) => (
              <div className="card table-card" key={ch.title}>
                <div className="table-card-head"><h3>{ch.title}</h3></div>
                <div className="chart-box"><BarChart labels={ch.labels} datasets={ch.datasets} money={ch.money} /></div>
              </div>
            ))}
            {report.sections.map((s) => <ReportTable key={`${tab}-${s.heading}`} section={s} />)}
          </div>
        </>
      )}
    </Layout>
  )
}
