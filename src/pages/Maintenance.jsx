import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Layout from '../components/Layout'
import Badge from '../components/Badge'
import Alert from '../components/Alert'
import Icon from '../components/Icon'
import { supabase } from '../supabaseClient'
import { formatDate } from '../lib/constants'

function truncate(str, n) {
  if (!str) return ''
  return str.length > n ? str.slice(0, n) + '…' : str
}

export default function Maintenance() {
  const [searchParams, setSearchParams] = useSearchParams()
  const statusFilter = searchParams.get('status') || ''
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [flash, setFlash] = useState(null)

  useEffect(() => { load() }, [statusFilter])

  async function load() {
    setLoading(true)
    let query = supabase
      .from('maintenance_requests')
      .select('*, tenants(full_name), units(unit_number)')
      .order('date_reported', { ascending: false })

    if (statusFilter) query = query.eq('status', statusFilter)
    const { data } = await query

    // priority=high first, matching the original ordering
    const sorted = (data || []).slice().sort((a, b) => {
      const ah = a.priority === 'high' ? 1 : 0
      const bh = b.priority === 'high' ? 1 : 0
      return bh - ah
    })
    setRequests(sorted)
    setLoading(false)
  }

  async function updateStatus(id, status) {
    const payload = { status }
    if (status === 'resolved') payload.date_resolved = new Date().toISOString().slice(0, 10)
    await supabase.from('maintenance_requests').update(payload).eq('id', id)
    setFlash({ type: 'success', message: 'Request status updated.' })
    load()
  }

  async function updateCost(id, amount) {
  const numericCost = amount === '' ? null : Number(amount)

  if (numericCost !== null && (Number.isNaN(numericCost) || numericCost < 0)) {
    setFlash({ type: 'error', message: 'Please enter a valid cost.' })
    return
  }

  const { error } = await supabase
    .from('maintenance_requests')
    .update({ amount: numericCost })
    .eq('id', id)

  if (error) {
    setFlash({ type: 'error', message: error.message })
    return
  }

  setFlash({ type: 'success', message: 'Maintenance cost updated.' })
  load()
}

  async function handleDelete(id) {
    if (!window.confirm('Delete this request?')) return
    await supabase.from('maintenance_requests').delete().eq('id', id)
    setFlash({ type: 'success', message: 'Request deleted.' })
    load()
  }

  return (
    <Layout
      title="Maintenance Complaints"
      subtitle="Repair and maintenance requests from tenants"
      actions={<Link to="/maintenance/new" className="btn btn-primary">+ Log Request</Link>}
    >
      <Alert type={flash?.type}>{flash?.message}</Alert>

      <div className="card table-card">
        <div className="table-card-head"><h3>Requests ({requests.length})</h3></div>
        <form className="filter-bar">
          <select value={statusFilter} onChange={(e) => setSearchParams(e.target.value ? { status: e.target.value } : {})}>
            <option value="">All statuses</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
          </select>
        </form>
        <table>
          <thead>
            <tr><th>Tenant</th><th>Unit</th><th>Category</th><th>Description</th><th>Priority</th><th>Reported</th><th>Status</th><th>Cost</th><th></th></tr>
          </thead>
          <tbody>
            {!loading && requests.length === 0 && (
              <tr><td colSpan={9} className="empty-state">No maintenance requests logged.</td></tr>
            )}
            {requests.map((r) => (
              <tr key={r.id}>
                <td className="cell-strong">{r.tenants?.full_name}</td>
                <td>{r.units?.unit_number}</td>
                <td>{r.category?.charAt(0).toUpperCase() + r.category?.slice(1)}</td>
                <td className="cell-muted" style={{ maxWidth: 260 }}>{truncate(r.description, 70)}</td>
                <td>
                  {r.priority === 'high' && <Badge color="red">High</Badge>}
                  {r.priority === 'medium' && <Badge color="amber">Medium</Badge>}
                  {r.priority === 'low' && <Badge color="gray">Low</Badge>}
                </td>
                <td className="cell-muted">{formatDate(r.date_reported)}</td>
                <td>
                  {r.status === 'resolved' && <Badge color="green">Resolved</Badge>}
                  {r.status === 'in_progress' && <Badge color="blue">In Progress</Badge>}
                  {r.status === 'open' && <Badge color="amber">Open</Badge>}
                </td>
                <td>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={r.cost ?? ''}
                    placeholder="0.00"
                    onBlur={(e) => updateCost(r.id, e.target.value)}
                    style={{
                      width: 100,
                      padding: '7px 9px',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      background: '#fbfcfe',
                      fontSize: 13
                    }}
                  />
                </td>
                <td className="row-actions">
                  {r.status !== 'resolved' && (
                    r.status === 'open'
                      ? <a href="#" className="btn btn-sm btn-outline" onClick={(e) => { e.preventDefault(); updateStatus(r.id, 'in_progress') }}>Start</a>
                      : <a href="#" className="btn btn-sm btn-outline" onClick={(e) => { e.preventDefault(); updateStatus(r.id, 'resolved') }}>Resolve</a>
                  )}
                  <a href="#" onClick={(e) => { e.preventDefault(); handleDelete(r.id) }}><Icon name="trash" size={16} /></a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Layout>
  )
}
