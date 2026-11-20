import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Layout from '../components/Layout'
import Badge from '../components/Badge'
import Icon from '../components/Icon'
import { supabase } from '../supabaseClient'
import { useToast } from '../context/ToastContext'
import { useAdminConfirm } from '../context/AdminConfirmContext'
import { ensureCharges, adminDeletePayment } from '../lib/api'
import { formatKES, formatDate, todayISO, sum } from '../lib/constants'

function accountStatus(b) {
  if (Number(b.months_overdue) > 0) return 'overdue'
  if (Number(b.amount_due) > 0) return 'due'
  if (Number(b.credit) > 0) return 'credit'
  return 'clear'
}

function StatusBadge({ b }) {
  const s = accountStatus(b)
  if (s === 'overdue') return <Badge color="red">{b.months_overdue} mo overdue</Badge>
  if (s === 'due') return <Badge color="amber">Due</Badge>
  if (s === 'credit') return <Badge color="blue">Credit</Badge>
  return <Badge color="green">Up to date</Badge>
}

export default function Rent() {
  const { notify } = useToast()
  const { confirmAsAdmin } = useAdminConfirm()
  const [searchParams, setSearchParams] = useSearchParams()
  const statusFilter = searchParams.get('status') || ''
  const [balances, setBalances] = useState([])
  const [recent, setRecent] = useState([])
  const [collectedThisMonth, setCollectedThisMonth] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    await ensureCharges()
    const monthStart = `${todayISO().slice(0, 7)}-01`

    const [bal, rec, month] = await Promise.all([
      supabase.from('tenant_balances').select('*').order('full_name'),
      supabase.from('payments').select('*, tenants(full_name)')
        .order('payment_date', { ascending: false }).order('id', { ascending: false }).limit(15),
      supabase.from('payments').select('amount').gte('payment_date', monthStart),
    ])

    // active tenants, plus anyone who has left but still owes (or is owed) money
    const rows = (bal.data || []).filter((r) => r.tenant_status === 'active' || Number(r.balance) !== 0)
    rows.sort((a, b) => Number(b.overdue_amount) - Number(a.overdue_amount) || a.full_name.localeCompare(b.full_name))
    setBalances(rows)
    setRecent(rec.data || [])
    setCollectedThisMonth(sum(month.data, 'amount'))
    setLoading(false)
  }

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
    }
  }

  const visible = statusFilter ? balances.filter((b) => accountStatus(b) === statusFilter) : balances

  return (
    <Layout
      title="Rent Collection"
      subtitle="Amount due per tenant: rent, water and garbage, with arrears and credit carried forward"
      actions={<Link to="/rent/new" className="btn btn-primary">+ Record Payment</Link>}
    >

      <div className="stat-grid cols-3">
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
      </div>

      <div className="card table-card">
        <div className="table-card-head"><h3>Tenant Balances ({visible.length})</h3></div>
        <form className="filter-bar" onSubmit={(e) => e.preventDefault()}>
          <select value={statusFilter} onChange={(e) => setSearchParams(e.target.value ? { status: e.target.value } : {})}>
            <option value="">All tenants</option>
            <option value="overdue">Overdue</option>
            <option value="due">Due (not yet overdue)</option>
            <option value="credit">In credit</option>
            <option value="clear">Up to date</option>
          </select>
        </form>
        <div className="table-scroll"><table>
          <thead>
            <tr><th>Tenant</th><th>Unit</th><th>Billed to Date</th><th>Paid</th><th>Amount Due</th><th>Overdue</th><th>Credit</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {!loading && visible.length === 0 && (
              <tr><td colSpan={9} className="empty-state">No tenants to show.</td></tr>
            )}
            {visible.map((b) => (
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
        </table></div>
      </div>
            <br></br>
      <div className="card table-card">
        <div className="table-card-head"><h3>Recent Payments</h3></div>
        <div className="table-scroll"><table>
          <thead>
            <tr><th>Date</th><th>Tenant</th><th>Amount</th><th>Method</th><th>Notes</th><th></th></tr>
          </thead>
          <tbody>
            {!loading && recent.length === 0 && (
              <tr><td colSpan={6} className="empty-state">No payments recorded yet.</td></tr>
            )}
            {recent.map((p) => (
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
        </table></div>
      </div>
    </Layout>
  )
}
