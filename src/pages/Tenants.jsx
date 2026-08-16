import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Layout from '../components/Layout'
import Badge from '../components/Badge'
import Alert from '../components/Alert'
import Icon from '../components/Icon'
import { supabase } from '../supabaseClient'
import { formatDate } from '../lib/constants'

export default function Tenants() {
  const [searchParams, setSearchParams] = useSearchParams()
  const search = searchParams.get('q') || ''
  const [tenants, setTenants] = useState([])
  const [loading, setLoading] = useState(true)
  const [flash, setFlash] = useState(null)
  const [q, setQ] = useState(search)

  useEffect(() => { load() }, [search])

  async function load() {
    setLoading(true)
    let query = supabase
      .from('tenants')
      .select('*, units(unit_number)')
      .order('status', { ascending: true })
      .order('full_name', { ascending: true })

    if (search) {
      query = query.or(`full_name.ilike.%${search}%,phone.ilike.%${search}%`)
    }

    const { data } = await query
    setTenants(data || [])
    setLoading(false)
  }

  function handleSearch(e) {
    e.preventDefault()
    setSearchParams(q ? { q } : {})
  }

  async function handleDelete(id, unitId) {
    if (!window.confirm('Remove this tenant record?')) return
    await supabase.from('tenants').delete().eq('id', id)
    setFlash({ type: 'success', message: 'Tenant removed.' })
    load()
  }

  return (
    <Layout
      title="Tenants"
      subtitle="Everyone currently or previously renting a unit"
      actions={<Link to="/tenants/new" className="btn btn-primary">+ Add Tenant</Link>}
    >
      <Alert type={flash?.type}>{flash?.message}</Alert>

      <div className="card table-card">
        <div className="table-card-head">
          <h3>All Tenants ({tenants.length})</h3>
          <form onSubmit={handleSearch} className="filter-bar" style={{ padding: 0 }}>
            <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone, unit..." />
            <button className="btn btn-outline btn-sm" type="submit">Search</button>
          </form>
        </div>
        <table>
          <thead>
            <tr><th>Name</th><th>Unit</th><th>Phone</th><th>Email</th><th>Move-in</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {!loading && tenants.length === 0 && (
              <tr><td colSpan={7} className="empty-state">No tenants found.</td></tr>
            )}
            {tenants.map((t) => (
              <tr key={t.id}>
                <td className="cell-strong">{t.full_name}</td>
                <td>{t.units?.unit_number ? t.units.unit_number : <span className="cell-muted">Unassigned</span>}</td>
                <td>{t.phone}</td>
                <td className="cell-muted">{t.email}</td>
                <td>{formatDate(t.move_in_date)}</td>
                <td>{t.status === 'active' ? <Badge color="green">Active</Badge> : <Badge color="gray">Vacated</Badge>}</td>
                <td className="row-actions">
                  <Link to={`/tenants/${t.id}/edit`} title="Edit"><Icon name="edit" size={16} /></Link>
                  <a href="#" title="Delete" onClick={(e) => { e.preventDefault(); handleDelete(t.id, t.unit_id) }}>
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
