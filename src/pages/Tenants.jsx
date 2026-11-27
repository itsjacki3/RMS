import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Layout from '../components/Layout'
import Badge from '../components/Badge'
import Icon from '../components/Icon'
import ExportButtons from '../components/ExportButtons'
import Pagination, { usePaged } from '../components/Pagination'
import { supabase } from '../supabaseClient'
import { useToast } from '../context/ToastContext'
import { useAdminConfirm } from '../context/AdminConfirmContext'
import { adminDeleteTenant } from '../lib/api'
import { formatDate, formatKES } from '../lib/constants'
import { tableDoc } from '../lib/exporter'

export default function Tenants() {
  const { notify } = useToast()
  const { confirmAsAdmin } = useAdminConfirm()
  const [searchParams, setSearchParams] = useSearchParams()
  const search = searchParams.get('q') || ''
  const view = searchParams.get('view') === 'vacated' ? 'vacated' : 'active'
  const [tenants, setTenants] = useState([])
  const [owing, setOwing] = useState({})       // tenant_id -> balance row (for vacated tenants)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState(search)

  useEffect(() => { load() }, [search])

  async function load() {
    setLoading(true)
    let query = supabase
      .from('tenants')
      .select('*, units(unit_number)')
      .order('full_name', { ascending: true })

    if (search) {
      query = query.or(`full_name.ilike.%${search}%,phone.ilike.%${search}%`)
    }

    const [{ data }, bal] = await Promise.all([
      query,
      supabase.from('tenant_balances').select('tenant_id, balance, amount_due, credit').eq('tenant_status', 'vacated'),
    ])
    const map = {}
    ;(bal.data || []).forEach((b) => { map[b.tenant_id] = b })
    setOwing(map)
    setTenants(data || [])
    setLoading(false)
  }

  function setParams(next) {
    const params = {}
    if (next.q) params.q = next.q
    if (next.view === 'vacated') params.view = 'vacated'
    setSearchParams(params)
  }

  function handleSearch(e) {
    e.preventDefault()
    setParams({ q, view })
  }

  async function handleDelete(t) {
    const done = await confirmAsAdmin({
      title: 'Delete tenant',
      message: `Delete ${t.full_name}? This also permanently removes their payments, water readings and monthly bills, and cannot be undone.`,
      confirmLabel: 'Yes, delete tenant',
      danger: true,
      run: (password) => adminDeleteTenant(t.id, password),
    })
    if (done) {
      notify(`Tenant "${t.full_name}" deleted.`)
      load()
    }
  }

  const active = tenants.filter((t) => t.status === 'active')
  const vacated = tenants
    .filter((t) => t.status !== 'active')
    .sort((a, b) => (b.move_out_date || '').localeCompare(a.move_out_date || '') || a.full_name.localeCompare(b.full_name))
  const rows = view === 'vacated' ? vacated : active
  const pager = usePaged(rows, 10, `${view}|${search}`)

  const getDoc = () => view === 'vacated'
    ? tableDoc({
        title: 'Vacated Tenants',
        subtitle: search ? `Search: ${search}` : 'Former tenants, most recent move-out first',
        columns: [
          { header: 'Name' }, { header: 'Last Unit' }, { header: 'Phone' }, { header: 'Move-in' },
          { header: 'Move-out' }, { header: 'Balance', align: 'right' },
        ],
        rows: vacated.map((t) => {
          const b = owing[t.id]
          const bal = b ? Number(b.balance) : 0
          return [t.full_name, t.units?.unit_number || '—', t.phone || '', formatDate(t.move_in_date), formatDate(t.move_out_date),
            bal > 0 ? `${formatKES(bal)} owing` : bal < 0 ? `${formatKES(-bal)} credit` : 'Settled']
        }),
      })
    : tableDoc({
        title: 'Active Tenants',
        subtitle: search ? `Search: ${search}` : 'Tenants currently renting',
        columns: [{ header: 'Name' }, { header: 'Unit' }, { header: 'Phone' }, { header: 'Email' }, { header: 'Move-in' }],
        rows: active.map((t) => [t.full_name, t.units?.unit_number || 'Unassigned', t.phone || '', t.email || '', formatDate(t.move_in_date)]),
      })

  return (
    <Layout
      title="Tenants"
      subtitle="Current tenants, with former tenants kept separately"
      actions={<Link to="/tenants/new" className="btn btn-primary">+ Add Tenant</Link>}
    >

      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={view === 'active'} className={`tab${view === 'active' ? ' active' : ''}`}
          onClick={() => setParams({ q: search, view: 'active' })}>
          Active<span className="tab-count">{active.length}</span>
        </button>
        <button type="button" role="tab" aria-selected={view === 'vacated'} className={`tab${view === 'vacated' ? ' active' : ''}`}
          onClick={() => setParams({ q: search, view: 'vacated' })}>
          Vacated<span className="tab-count">{vacated.length}</span>
        </button>
      </div>

      <div className="card table-card">
        <div className="table-card-head">
          <h3>{view === 'vacated' ? 'Vacated Tenants' : 'Active Tenants'} ({rows.length})</h3>
          <div className="head-tools">
            <form onSubmit={handleSearch} className="filter-bar" style={{ padding: 0 }}>
              <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or phone..." />
              <button className="btn btn-outline btn-sm" type="submit">Search</button>
            </form>
            <ExportButtons getDoc={getDoc} filename={view === 'vacated' ? 'vacated-tenants' : 'active-tenants'} disabled={rows.length === 0} />
          </div>
        </div>

        <div className="table-scroll">
          {view === 'active' ? (
            <table>
              <thead>
                <tr><th>Name</th><th>Unit</th><th>Phone</th><th>Email</th><th>Move-in</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {!loading && rows.length === 0 && (
                  <tr><td colSpan={7} className="empty-state">{search ? 'No active tenants match your search.' : 'No active tenants.'}</td></tr>
                )}
                {pager.pageRows.map((t) => (
                  <tr key={t.id}>
                    <td className="cell-strong"><Link to={`/tenants/${t.id}`} className="text-link">{t.full_name}</Link></td>
                    <td>{t.units?.unit_number ? t.units.unit_number : <span className="cell-muted">Unassigned</span>}</td>
                    <td>{t.phone}</td>
                    <td className="cell-muted">{t.email}</td>
                    <td>{formatDate(t.move_in_date)}</td>
                    <td><Badge color="green">Active</Badge></td>
                    <td className="row-actions">
                      <Link to={`/tenants/${t.id}`} title="Profile"><Icon name="user" size={16} /></Link>
                      <Link to={`/tenants/${t.id}/edit`} title="Edit"><Icon name="edit" size={16} /></Link>
                      <a href="#" title="Delete" onClick={(e) => { e.preventDefault(); handleDelete(t) }}>
                        <Icon name="trash" size={16} />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table>
              <thead>
                <tr><th>Name</th><th>Last Unit</th><th>Phone</th><th>Move-in</th><th>Move-out</th><th>Balance</th><th></th></tr>
              </thead>
              <tbody>
                {!loading && rows.length === 0 && (
                  <tr><td colSpan={7} className="empty-state">{search ? 'No vacated tenants match your search.' : 'No vacated tenants yet.'}</td></tr>
                )}
                {pager.pageRows.map((t) => {
                  const bal = owing[t.id] ? Number(owing[t.id].balance) : 0
                  return (
                    <tr key={t.id}>
                      <td className="cell-strong"><Link to={`/tenants/${t.id}`} className="text-link">{t.full_name}</Link></td>
                      <td>{t.units?.unit_number || <span className="cell-muted">—</span>}</td>
                      <td>{t.phone}</td>
                      <td>{formatDate(t.move_in_date)}</td>
                      <td>{formatDate(t.move_out_date)}</td>
                      <td>
                        {bal > 0 ? <Badge color="red">{formatKES(bal)} owing</Badge>
                          : bal < 0 ? <Badge color="blue">{formatKES(-bal)} credit</Badge>
                          : <Badge color="green">Settled</Badge>}
                      </td>
                      <td className="row-actions">
                        {bal > 0 && <Link to={`/rent/new?tenant=${t.id}&back=profile`} className="btn btn-sm btn-outline">Record Payment</Link>}
                        <Link to={`/tenants/${t.id}`} title="Profile"><Icon name="user" size={16} /></Link>
                        <Link to={`/tenants/${t.id}/edit`} title="Edit"><Icon name="edit" size={16} /></Link>
                        <a href="#" title="Delete" onClick={(e) => { e.preventDefault(); handleDelete(t) }}>
                          <Icon name="trash" size={16} />
                        </a>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
        <Pagination {...pager} />
      </div>
    </Layout>
  )
}
