import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Layout from '../components/Layout'
import Badge from '../components/Badge'
import Alert from '../components/Alert'
import Icon from '../components/Icon'
import { supabase } from '../supabaseClient'
import { MONTHS, formatKES, formatDate } from '../lib/constants'

export default function Rent() {
  const [searchParams, setSearchParams] = useSearchParams()
  const statusFilter = searchParams.get('status') || ''
  const [payments, setPayments] = useState([])
  const [totals, setTotals] = useState({ collected: 0, pending: 0 })
  const [loading, setLoading] = useState(true)
  const [flash, setFlash] = useState(null)

  useEffect(() => { load() }, [statusFilter])

  async function load() {
    setLoading(true)
    let query = supabase
      .from('rent_payments')
      .select('*, tenants(full_name), units(unit_number)')
      .order('period_year', { ascending: false })
      .order('period_month', { ascending: false })

    if (statusFilter) query = query.eq('status', statusFilter)
    const { data } = await query
    setPayments(data || [])

    const { data: paidRows } = await supabase.from('rent_payments').select('amount_paid').eq('status', 'paid')
    const { data: pendingRows } = await supabase.from('rent_payments').select('amount_due').in('status', ['pending', 'overdue'])
    setTotals({
      collected: (paidRows || []).reduce((s, r) => s + Number(r.amount_paid || 0), 0),
      pending: (pendingRows || []).reduce((s, r) => s + Number(r.amount_due || 0), 0),
    })
    setLoading(false)
  }

  async function markPaid(row) {
    await supabase.from('rent_payments').update({
      status: 'paid', amount_paid: row.amount_due, payment_date: new Date().toISOString().slice(0, 10),
    }).eq('id', row.id)
    setFlash({ type: 'success', message: 'Payment marked as paid.' })
    load()
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this record?')) return
    await supabase.from('rent_payments').delete().eq('id', id)
    setFlash({ type: 'success', message: 'Record deleted.' })
    load()
  }

  return (
    <Layout
      title="Rent Collection"
      subtitle="Track monthly rent invoices and payments"
      actions={<Link to="/rent/new" className="btn btn-primary">+ Record Payment</Link>}
    >
      <Alert type={flash?.type}>{flash?.message}</Alert>

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(2,1fr)', marginBottom: 20 }}>
        <div className="card stat-card">
          <div className="stat-icon teal"><Icon name="rent" /></div>
          <div><div className="stat-label">Total Collected</div><div className="stat-value">{formatKES(totals.collected)}</div></div>
        </div>
        <div className="card stat-card">
          <div className="stat-icon pink"><Icon name="clock" /></div>
          <div><div className="stat-label">Outstanding</div><div className="stat-value">{formatKES(totals.pending)}</div></div>
        </div>
      </div>

      <div className="card table-card">
        <div className="table-card-head"><h3>Payments ({payments.length})</h3></div>
        <form className="filter-bar">
          <select value={statusFilter} onChange={(e) => setSearchParams(e.target.value ? { status: e.target.value } : {})}>
            <option value="">All statuses</option>
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
            <option value="overdue">Overdue</option>
          </select>
        </form>
        <table>
          <thead>
            <tr><th>Tenant</th><th>Unit</th><th>Period</th><th>Amount Due</th><th>Amount Paid</th><th>Payment Date</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {!loading && payments.length === 0 && (
              <tr><td colSpan={8} className="empty-state">No rent records found.</td></tr>
            )}
            {payments.map((p) => (
              <tr key={p.id}>
                <td className="cell-strong">{p.tenants?.full_name}</td>
                <td>{p.units?.unit_number}</td>
                <td>{MONTHS[p.period_month]} {p.period_year}</td>
                <td>{formatKES(p.amount_due)}</td>
                <td>{formatKES(p.amount_paid)}</td>
                <td className="cell-muted">{formatDate(p.payment_date)}</td>
                <td>
                  {p.status === 'paid' && <Badge color="green">Paid</Badge>}
                  {p.status === 'overdue' && <Badge color="red">Overdue</Badge>}
                  {p.status === 'pending' && <Badge color="amber">Pending</Badge>}
                </td>
                <td className="row-actions">
                  {p.status !== 'paid' && (
                    <a href="#" className="btn btn-sm btn-outline" onClick={(e) => { e.preventDefault(); markPaid(p) }}>Mark Paid</a>
                  )}
                  <a href="#" title="Delete" onClick={(e) => { e.preventDefault(); handleDelete(p.id) }}>
                    <Icon name="trash" size={16} />
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Layout>
  )
}
