import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Layout from '../components/Layout'
import Badge from '../components/Badge'
import Icon from '../components/Icon'
import ExportButtons from '../components/ExportButtons'
import Pagination, { usePaged } from '../components/Pagination'
import { supabase } from '../supabaseClient'
import { useToast } from '../context/ToastContext'
import { formatDate, formatKES, sum, todayISO } from '../lib/constants'
import { tableDoc } from '../lib/exporter'

function truncate(str, n) {
  if (!str) return ''
  return str.length > n ? str.slice(0, n) + '…' : str
}

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '')
const STATUS_LABEL = { open: 'Open', in_progress: 'In Progress', resolved: 'Resolved' }

export default function Maintenance() {
  const { notify } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const statusFilter = searchParams.get('status') || ''
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [statusFilter])

  async function load() {
    setLoading(true)
    let query = supabase
      .from('maintenance_requests')
      .select('*, tenants(full_name), units(unit_number)')
      .order('date_reported', { ascending: false })
      .order('id', { ascending: false })

    if (statusFilter) query = query.eq('status', statusFilter)
    const { data } = await query

    // priority=high first, matching the original ordering (sort is stable)
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
    if (status === 'resolved') payload.date_resolved = todayISO()
    await supabase.from('maintenance_requests').update(payload).eq('id', id)
    notify('Request status updated.')
    load()
  }

  async function handleDelete(r) {
    const billed = r.bill_to_tenant && Number(r.cost) > 0
    const msg = billed
      ? `Delete this request? Its ${formatKES(r.cost)} charge will also be removed from ${r.tenants?.full_name}'s account.`
      : 'Delete this request?'
    if (!window.confirm(msg)) return
    await supabase.from('maintenance_requests').delete().eq('id', r.id)
    notify('Request deleted.')
    load()
  }

  const { pageRows, ...pager } = usePaged(requests, 10, statusFilter)

  const getDoc = useMemo(() => () => tableDoc({
    title: 'Maintenance Requests',
    subtitle: statusFilter ? `Status: ${STATUS_LABEL[statusFilter]}` : 'All statuses',
    summary: [
      ['Requests', String(requests.length)],
      ['Total cost', formatKES(sum(requests, 'cost'))],
      ['Charged to tenants', formatKES(sum(requests.filter((r) => r.bill_to_tenant), 'cost'))],
    ],
    columns: [
      { header: 'Reported' }, { header: 'Tenant' }, { header: 'Unit' }, { header: 'Category' }, { header: 'Description' },
      { header: 'Priority' }, { header: 'Status' }, { header: 'Cost', align: 'right' }, { header: 'Billing' },
    ],
    rows: requests.map((r) => [
      formatDate(r.date_reported), r.tenants?.full_name || '', r.units?.unit_number || '', cap(r.category), r.description,
      cap(r.priority), STATUS_LABEL[r.status] || r.status,
      Number(r.cost) > 0 ? formatKES(r.cost) : '—',
      r.bill_to_tenant && Number(r.cost) > 0 ? 'Charged to tenant' : Number(r.cost) > 0 ? 'Landlord expense' : '—',
    ]),
  }), [requests, statusFilter])

  return (
    <Layout
      title="Maintenance Complaints"
      subtitle="Repair and maintenance requests from tenants"
      actions={<Link to="/maintenance/new" className="btn btn-primary">+ Log Request</Link>}
    >

      <div className="card table-card">
        <div className="table-card-head">
          <h3>Requests ({requests.length})</h3>
          <div className="head-tools">
            <ExportButtons getDoc={getDoc} filename="maintenance-requests" disabled={requests.length === 0} />
          </div>
        </div>
        <form className="filter-bar" onSubmit={(e) => e.preventDefault()}>
          <select value={statusFilter} onChange={(e) => setSearchParams(e.target.value ? { status: e.target.value } : {})}>
            <option value="">All statuses</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
          </select>
        </form>
        <div className="table-scroll">
          <table>
            <thead>
              <tr><th>Tenant</th><th>Unit</th><th>Category</th><th>Description</th><th>Priority</th><th>Reported</th><th>Status</th><th>Cost</th><th></th></tr>
            </thead>
            <tbody>
              {!loading && requests.length === 0 && (
                <tr><td colSpan={9} className="empty-state">No maintenance requests logged.</td></tr>
              )}
              {pageRows.map((r) => (
                <tr key={r.id}>
                  <td className="cell-strong">{r.tenants?.full_name}</td>
                  <td>{r.units?.unit_number}</td>
                  <td>{cap(r.category)}</td>
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
                    {Number(r.cost) > 0 ? (
                      <>
                        <div className="cell-strong">{formatKES(r.cost)}</div>
                        <div className="cell-muted" style={{ fontSize: 12 }}>{r.bill_to_tenant ? 'Charged to tenant' : 'Landlord expense'}</div>
                      </>
                    ) : <span className="cell-muted">—</span>}
                  </td>
                  <td className="row-actions">
                    {r.status !== 'resolved' && (
                      r.status === 'open'
                        ? <a href="#" className="btn btn-sm btn-outline" onClick={(e) => { e.preventDefault(); updateStatus(r.id, 'in_progress') }}>Start</a>
                        : <a href="#" className="btn btn-sm btn-outline" onClick={(e) => { e.preventDefault(); updateStatus(r.id, 'resolved') }}>Resolve</a>
                    )}
                    <Link to={`/maintenance/${r.id}/edit`} title="Edit / add cost"><Icon name="edit" size={16} /></Link>
                    <a href="#" title="Delete" onClick={(e) => { e.preventDefault(); handleDelete(r) }}><Icon name="trash" size={16} /></a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination {...pager} />
      </div>
    </Layout>
  )
}
