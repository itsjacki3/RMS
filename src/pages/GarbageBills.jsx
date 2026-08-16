import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../components/Layout'
import Badge from '../components/Badge'
import Alert from '../components/Alert'
import Icon from '../components/Icon'
import { supabase } from '../supabaseClient'
import { MONTHS, formatKES, formatDate } from '../lib/constants'

export default function GarbageBills() {
  const [bills, setBills] = useState([])
  const [loading, setLoading] = useState(true)
  const [flash, setFlash] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('garbage_bills')
      .select('*, tenants(full_name), units(unit_number)')
      .order('billing_year', { ascending: false })
      .order('billing_month', { ascending: false })
    setBills(data || [])
    setLoading(false)
  }

  async function markPaid(id) {
    await supabase.from('garbage_bills').update({ status: 'paid' }).eq('id', id)
    setFlash({ type: 'success', message: 'Garbage bill marked as paid.' })
    load()
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this bill?')) return
    await supabase.from('garbage_bills').delete().eq('id', id)
    setFlash({ type: 'success', message: 'Garbage bill deleted.' })
    load()
  }

  return (
    <Layout
      title="Garbage Collection Bills"
      subtitle="Monthly waste collection charges per unit"
      actions={<Link to="/garbage-bills/new" className="btn btn-primary">+ Add Bill</Link>}
    >
      <Alert type={flash?.type}>{flash?.message}</Alert>

      <div className="card table-card">
        <div className="table-card-head"><h3>Garbage Bills ({bills.length})</h3></div>
        <table>
          <thead>
            <tr><th>Tenant</th><th>Unit</th><th>Period</th><th>Amount</th><th>Due Date</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {!loading && bills.length === 0 && (
              <tr><td colSpan={7} className="empty-state">No garbage bills recorded yet.</td></tr>
            )}
            {bills.map((b) => (
              <tr key={b.id}>
                <td className="cell-strong">{b.tenants?.full_name}</td>
                <td>{b.units?.unit_number}</td>
                <td>{MONTHS[b.billing_month]} {b.billing_year}</td>
                <td>{formatKES(b.amount)}</td>
                <td className="cell-muted">{formatDate(b.due_date)}</td>
                <td>
                  {b.status === 'paid' && <Badge color="green">Paid</Badge>}
                  {b.status === 'overdue' && <Badge color="red">Overdue</Badge>}
                  {b.status === 'pending' && <Badge color="amber">Pending</Badge>}
                </td>
                <td className="row-actions">
                  {b.status !== 'paid' && (
                    <a href="#" className="btn btn-sm btn-outline" onClick={(e) => { e.preventDefault(); markPaid(b.id) }}>Mark Paid</a>
                  )}
                  <a href="#" onClick={(e) => { e.preventDefault(); handleDelete(b.id) }}><Icon name="trash" size={16} /></a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Layout>
  )
}
