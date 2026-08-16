import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../components/Layout'
import Badge from '../components/Badge'
import Alert from '../components/Alert'
import Icon from '../components/Icon'
import { supabase } from '../supabaseClient'
import { formatNumber } from '../lib/constants'

export default function Units() {
  const [units, setUnits] = useState([])
  const [loading, setLoading] = useState(true)
  const [flash, setFlash] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data: unitsData } = await supabase.from('units').select('*').order('unit_number')
    const { data: tenantsData } = await supabase.from('tenants').select('unit_id, full_name').eq('status', 'active')

    const tenantByUnit = {}
    ;(tenantsData || []).forEach((t) => { if (t.unit_id) tenantByUnit[t.unit_id] = t.full_name })

    setUnits((unitsData || []).map((u) => ({ ...u, tenant_name: tenantByUnit[u.id] || null })))
    setLoading(false)
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this unit?')) return
    const { count } = await supabase
      .from('tenants').select('*', { count: 'exact', head: true }).eq('unit_id', id).eq('status', 'active')

    if (count > 0) {
      setFlash({ type: 'error', message: 'Cannot delete a unit that has an active tenant.' })
      return
    }
    await supabase.from('units').delete().eq('id', id)
    setFlash({ type: 'success', message: 'Unit removed.' })
    load()
  }

  return (
    <Layout
      title="Units"
      subtitle="Manage the apartment units in your property"
      actions={<Link to="/units/new" className="btn btn-primary">+ Add Unit</Link>}
    >
      <Alert type={flash?.type}>{flash?.message}</Alert>

      <div className="card table-card">
        <div className="table-card-head"><h3>All Units ({units.length})</h3></div>
        <table>
          <thead>
            <tr><th>Unit</th><th>Floor</th><th>Bedrooms</th><th>Rent (KES)</th><th>Status</th><th>Current Tenant</th><th></th></tr>
          </thead>
          <tbody>
            {!loading && units.length === 0 && (
              <tr><td colSpan={7} className="empty-state">No units yet. Click "Add Unit" to create one.</td></tr>
            )}
            {units.map((u) => (
              <tr key={u.id}>
                <td className="cell-strong">{u.unit_number}</td>
                <td>{u.floor}</td>
                <td>{u.bedrooms}</td>
                <td>{formatNumber(u.rent_amount)}</td>
                <td>
                  {u.status === 'occupied' && <Badge color="green">Occupied</Badge>}
                  {u.status === 'vacant' && <Badge color="amber">Vacant</Badge>}
                  {u.status === 'maintenance' && <Badge color="gray">Maintenance</Badge>}
                </td>
                <td className="cell-muted">{u.tenant_name || '—'}</td>
                <td className="row-actions">
                  <Link to={`/units/${u.id}/edit`} title="Edit"><Icon name="edit" size={16} /></Link>
                  <a href="#" title="Delete" onClick={(e) => { e.preventDefault(); handleDelete(u.id) }}>
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
