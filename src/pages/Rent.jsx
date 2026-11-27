import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Layout from '../components/Layout'
import Badge from '../components/Badge'
import Icon from '../components/Icon'
import ExportButtons from '../components/ExportButtons'
import Pagination, { usePaged } from '../components/Pagination'
import { supabase } from '../supabaseClient'
import { useToast } from '../context/ToastContext'
import { useAdminConfirm } from '../context/AdminConfirmContext'
import { ensureCharges, adminDeletePayment, fetchAll } from '../lib/api'
import { formatKES, formatDate, todayISO, sum } from '../lib/constants'
import { tableDoc } from '../lib/exporter'

const PAGE_SIZE = 10
const TABS = [
  { key: 'balances', label: 'Tenant Balances' },
  { key: 'payments', label: 'Payments' },
  { key: 'maintenance', label: 'Maintenance Bills' },
]

function accountStatus(b) {
  if (Number(b.months_overdue) > 0) return 'overdue'
  if (Number(b.amount_due) > 0) return 'due'
  if (Number(b.credit) > 0) return 'credit'
  return 'clear'
}

function accountLabel(b) {
  const s = accountStatus(b)
  if (s === 'overdue') return `${b.months_overdue} mo overdue`
  if (s === 'due') return 'Due'
  if (s === 'credit') return 'Credit'
  return 'Up to date'
}

function StatusBadge({ b }) {
  const s = accountStatus(b)
  if (s === 'overdue') return <Badge color="red">{accountLabel(b)}</Badge>
  if (s === 'due') return <Badge color="amber">Due</Badge>
  if (s === 'credit') return <Badge color="blue">Credit</Badge>
  return <Badge color="green">Up to date</Badge>
}

const FILTER_LABELS = { overdue: 'Overdue', due: 'Due (not yet overdue)', credit: 'In credit', clear: 'Up to date' }
const truncate = (str, n) => (!str ? '' : str.length > n ? str.slice(0, n) + '…' : str)
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '')

export default function Rent() {
  const { notify } = useToast()
  const { confirmAsAdmin } = useAdminConfirm()
  const [searchParams, setSearchParams] = useSearchParams()
  const statusFilter = searchParams.get('status') || ''
  const requestedTab = searchParams.get('tab')
  const activeTab = TABS.some((t) => t.key === requestedTab) ? requestedTab : 'balances'

  const [balances, setBalances] = useState([])
  const [billedMaint, setBilledMaint] = useState([])
  const [collectedThisMonth, setCollectedThisMonth] = useState(0)
  const [loading, setLoading] = useState(true)

  // payments are paged on the server so a long history stays fast
  const [payPage, setPayPage] = useState(1)
  const [payments, setPayments] = useState([])
  const [payTotal, setPayTotal] = useState(0)
  const [payLoading, setPayLoading] = useState(true)

  function setParam(key, value) {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value); else next.delete(key)
    setSearchParams(next, { replace: true })
  }

  const loadPayments = useCallback(async (page) => {
    setPayLoading(true)
    const from = (page - 1) * PAGE_SIZE
    const { data, count, error } = await supabase
      .from('payments')
      .select('*, tenants(full_name)', { count: 'exact' })
      .order('payment_date', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)
    if (error && page > 1) { setPayPage(page - 1); return }   // e.g. the last page was just emptied
    setPayments(data || [])
    setPayTotal(count || 0)
    setPayLoading(false)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    await ensureCharges()
    const monthStart = `${todayISO().slice(0, 7)}-01`

    const [bal, month, maint] = await Promise.all([
      supabase.from('tenant_balances').select('*').order('full_name'),
      supabase.from('payments').select('amount').gte('payment_date', monthStart),
      supabase.from('maintenance_requests')
        .select('*, tenants(full_name), units(unit_number)')
        .eq('bill_to_tenant', true).gt('cost', 0)
        .order('billed_on', { ascending: false }).order('id', { ascending: false }),
    ])

    // active tenants, plus anyone who has left but still owes (or is owed) money
    const rows = (bal.data || []).filter((r) => r.tenant_status === 'active' || Number(r.balance) !== 0)
    rows.sort((a, b) => Number(b.overdue_amount) - Number(a.overdue_amount) || a.full_name.localeCompare(b.full_name))
    setBalances(rows)
    setBilledMaint(maint.data || [])
    setCollectedThisMonth(sum(month.data, 'amount'))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadPayments(payPage) }, [payPage, loadPayments])

  async function deletePayment(p) {
    const done = await confirmAsAdmin({
      title: 'Delete payment',
      message: `Delete the ${formatKES(p.amount)} payment from ${p.tenants?.full_name} (${formatDate(p.payment_date)})? Their balance will be recalculated and this cannot be undone.`,
      confirmLabel: 'Yes, delete payment',
      danger: true,
      run: (password) => adminDeletePayment(p.id, password),
    })
    if (done) {
      notify(`Payment of ${formatKES(p.amount)} deleted.`)
      load()
      loadPayments(payPage)
    }
  }

  const visible = statusFilter ? balances.filter((b) => accountStatus(b) === statusFilter) : balances
  const balPager = usePaged(visible, PAGE_SIZE, statusFilter)
  const maintPager = usePaged(billedMaint, PAGE_SIZE)
  const payPages = Math.max(1, Math.ceil(payTotal / PAGE_SIZE))

  const balanceByTenant = {}
  balances.forEach((b) => { balanceByTenant[b.tenant_id] = b })
  const monthKey = todayISO().slice(0, 7)
  const maintThisMonth = sum(billedMaint.filter((r) => (r.billed_on || '').startsWith(monthKey)), 'cost')

  /* ---------- exports (always ALL records) ---------- */
  const balancesDoc = () => tableDoc({
    title: 'Tenant Balances',
    subtitle: statusFilter ? `Filter: ${FILTER_LABELS[statusFilter]}` : 'All tenants with a balance or an active tenancy',
    columns: [
      { header: 'Tenant' }, { header: 'Unit' }, { header: 'Billed to Date', align: 'right' }, { header: 'Paid', align: 'right' },
      { header: 'Amount Due', align: 'right' }, { header: 'Overdue', align: 'right' }, { header: 'Credit', align: 'right' }, { header: 'Status' },
    ],
    rows: visible.map((b) => [
      b.full_name, b.unit_number || '—', formatKES(b.total_charged), formatKES(b.total_paid),
      formatKES(b.amount_due), formatKES(b.overdue_amount), formatKES(b.credit), accountLabel(b),
    ]),
    totals: ['Total', '', formatKES(sum(visible, 'total_charged')), formatKES(sum(visible, 'total_paid')),
      formatKES(sum(visible, 'amount_due')), formatKES(sum(visible, 'overdue_amount')), formatKES(sum(visible, 'credit')), ''],
  })

  const paymentsDoc = async () => {
    const all = await fetchAll(() => supabase.from('payments').select('*, tenants(full_name)')
      .order('payment_date', { ascending: false }).order('id', { ascending: false }))
    return tableDoc({
      title: 'Payments Received',
      subtitle: `${all.length} payment${all.length === 1 ? '' : 's'}, newest first`,
      columns: [{ header: 'Date' }, { header: 'Tenant' }, { header: 'Amount', align: 'right' }, { header: 'Method' }, { header: 'Notes' }],
      rows: all.map((p) => [formatDate(p.payment_date), p.tenants?.full_name || '', formatKES(p.amount), p.method || '', p.notes || '']),
      totals: ['Total', '', formatKES(sum(all, 'amount')), '', ''],
    })
  }

  const maintenanceDoc = () => tableDoc({
    title: 'Maintenance Bills',
    subtitle: 'Repair costs charged to tenants',
    columns: [
      { header: 'Billed' }, { header: 'Tenant' }, { header: 'Unit' }, { header: 'Category' }, { header: 'Description' },
      { header: 'Amount', align: 'right' }, { header: 'Account Status' },
    ],
    rows: billedMaint.map((r) => [
      formatDate(r.billed_on), r.tenants?.full_name || '', r.units?.unit_number || '', cap(r.category), r.description,
      formatKES(r.cost), balanceByTenant[r.tenant_id] ? accountLabel(balanceByTenant[r.tenant_id]) : 'Settled',
    ]),
    totals: ['Total', '', '', '', '', formatKES(sum(billedMaint, 'cost')), ''],
  })

  return (
    <Layout
      title="Rent Collection"
      subtitle="Amount due per tenant: rent, water, garbage and maintenance, with arrears and credit carried forward"
      actions={<Link to="/rent/new" className="btn btn-primary">+ Record Payment</Link>}
    >

      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <div className="card stat-card">
          <div className="stat-icon teal"><Icon name="rent" /></div>
          <div><div className="stat-label">Collected This Month</div><div className="stat-value">{formatKES(collectedThisMonth)}</div></div>
        </div>
        <div className="card stat-card">
          <div className="stat-icon coral"><Icon name="clock" /></div>
          <div><div className="stat-label">Total Amount Due</div><div className="stat-value">{formatKES(sum(balances, 'amount_due'))}</div></div>
        </div>
        <div className="card stat-card">
          <div className="stat-icon pink"><Icon name="clock" /></div>
          <div><div className="stat-label">Overdue</div><div className="stat-value">{formatKES(sum(balances, 'overdue_amount'))}</div></div>
        </div>
        <div className="card stat-card">
          <div className="stat-icon amber"><Icon name="maintenance" /></div>
          <div>
            <div className="stat-label">Maintenance Billed</div>
            <div className="stat-value">{formatKES(maintThisMonth)}</div>
            <div className="stat-sub">this month &middot; {formatKES(sum(billedMaint, 'cost'))} in total</div>
          </div>
        </div>
      </div>

      <div className="tabs" role="tablist">
        {TABS.map((t) => {
          const count = t.key === 'balances' ? balances.length : t.key === 'payments' ? payTotal : billedMaint.length
          return (
            <button key={t.key} type="button" role="tab" aria-selected={activeTab === t.key}
              className={`tab${activeTab === t.key ? ' active' : ''}`}
              onClick={() => setParam('tab', t.key === 'balances' ? '' : t.key)}>
              {t.label}<span className="tab-count">{count}</span>
            </button>
          )
        })}
      </div>

      {/* ---------- Tenant balances ---------- */}
      {activeTab === 'balances' && (
        <div className="card table-card">
          <div className="table-card-head">
            <h3>Tenant Balances ({visible.length})</h3>
            <div className="head-tools">
              <ExportButtons getDoc={balancesDoc} filename="tenant-balances" disabled={visible.length === 0} />
            </div>
          </div>
          <form className="filter-bar" onSubmit={(e) => e.preventDefault()}>
            <select value={statusFilter} onChange={(e) => setParam('status', e.target.value)}>
              <option value="">All tenants</option>
              <option value="overdue">Overdue</option>
              <option value="due">Due (not yet overdue)</option>
              <option value="credit">In credit</option>
              <option value="clear">Up to date</option>
            </select>
          </form>
          <div className="table-scroll">
            <table>
              <thead>
                <tr><th>Tenant</th><th>Unit</th><th>Billed to Date</th><th>Paid</th><th>Amount Due</th><th>Overdue</th><th>Credit</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {!loading && visible.length === 0 && (
                  <tr><td colSpan={9} className="empty-state">No tenants to show.</td></tr>
                )}
                {balPager.pageRows.map((b) => (
                  <tr key={b.tenant_id}>
                    <td className="cell-strong"><Link to={`/tenants/${b.tenant_id}`} className="text-link">{b.full_name}</Link></td>
                    <td>{b.unit_number || <span className="cell-muted">—</span>}</td>
                    <td className="cell-muted">{formatKES(b.total_charged)}</td>
                    <td className="cell-muted">{formatKES(b.total_paid)}</td>
                    <td className="cell-strong">{formatKES(b.amount_due)}</td>
                    <td>{Number(b.months_overdue) > 0 ? formatKES(b.overdue_amount) : <span className="cell-muted">—</span>}</td>
                    <td>{Number(b.credit) > 0 ? formatKES(b.credit) : <span className="cell-muted">—</span>}</td>
                    <td><StatusBadge b={b} /></td>
                    <td className="row-actions">
                      <Link to={`/rent/new?tenant=${b.tenant_id}`} className="btn btn-sm btn-outline">Record Payment</Link>
                      <Link to={`/tenants/${b.tenant_id}`} title="Profile"><Icon name="user" size={16} /></Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination {...balPager} />
        </div>
      )}

      {/* ---------- Payments ---------- */}
      {activeTab === 'payments' && (
        <div className="card table-card">
          <div className="table-card-head">
            <h3>Payments ({payTotal})</h3>
            <div className="head-tools">
              <ExportButtons getDoc={paymentsDoc} filename="payments" disabled={payTotal === 0} />
            </div>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr><th>Date</th><th>Tenant</th><th>Amount</th><th>Method</th><th>Notes</th><th></th></tr>
              </thead>
              <tbody>
                {!payLoading && payments.length === 0 && (
                  <tr><td colSpan={6} className="empty-state">No payments recorded yet.</td></tr>
                )}
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td>{formatDate(p.payment_date)}</td>
                    <td className="cell-strong">{p.tenants?.full_name}</td>
                    <td>{formatKES(p.amount)}</td>
                    <td>{p.method}</td>
                    <td className="cell-muted">{p.notes}</td>
                    <td className="row-actions">
                      <Link to={`/rent/${p.id}/edit`} title="Edit payment"><Icon name="edit" size={16} /></Link>
                      <a href="#" title="Delete" onClick={(e) => { e.preventDefault(); deletePayment(p) }}>
                        <Icon name="trash" size={16} />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={Math.min(payPage, payPages)} pages={payPages} total={payTotal} pageSize={PAGE_SIZE} onPage={setPayPage} />
        </div>
      )}

      {/* ---------- Maintenance bills ---------- */}
      {activeTab === 'maintenance' && (
        <div className="card table-card">
          <div className="table-card-head">
            <h3>Maintenance Bills ({billedMaint.length})</h3>
            <div className="head-tools">
              <ExportButtons getDoc={maintenanceDoc} filename="maintenance-bills" disabled={billedMaint.length === 0} />
              <Link to="/maintenance/new" className="btn btn-outline btn-sm">+ Log &amp; Charge Repair</Link>
            </div>
          </div>
          <div className="filter-bar" style={{ paddingBottom: 12 }}>
            <span className="cell-muted" style={{ fontSize: 13 }}>
              Repair costs charged to a tenant are added to their monthly statement and amount due, and are cleared by ordinary payments.
              To charge a repair, tick &ldquo;Charge this cost to the tenant&rdquo; on the maintenance request.
            </span>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr><th>Billed</th><th>Tenant</th><th>Unit</th><th>Category</th><th>Description</th><th>Amount</th><th>Tenant Account</th><th></th></tr>
              </thead>
              <tbody>
                {!loading && billedMaint.length === 0 && (
                  <tr><td colSpan={8} className="empty-state">No maintenance costs have been charged to tenants yet.</td></tr>
                )}
                {maintPager.pageRows.map((r) => {
                  const b = balanceByTenant[r.tenant_id]
                  return (
                    <tr key={r.id}>
                      <td>{formatDate(r.billed_on)}</td>
                      <td className="cell-strong"><Link to={`/tenants/${r.tenant_id}?tab=maintenance`} className="text-link">{r.tenants?.full_name}</Link></td>
                      <td>{r.units?.unit_number || <span className="cell-muted">—</span>}</td>
                      <td>{cap(r.category)}</td>
                      <td className="cell-muted" style={{ maxWidth: 260 }}>{truncate(r.description, 70)}</td>
                      <td className="cell-strong">{formatKES(r.cost)}</td>
                      <td>{b ? <StatusBadge b={b} /> : <Badge color="green">Settled</Badge>}</td>
                      <td className="row-actions">
                        {b && <Link to={`/rent/new?tenant=${r.tenant_id}`} className="btn btn-sm btn-outline">Record Payment</Link>}
                        <Link to={`/maintenance/${r.id}/edit`} title="Edit request"><Icon name="edit" size={16} /></Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Pagination {...maintPager} />
        </div>
      )}
    </Layout>
  )
}
