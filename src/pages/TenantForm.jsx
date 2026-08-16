import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Layout from '../components/Layout'
import { supabase } from '../supabaseClient'

const EMPTY = {
  unit_id: '', full_name: '', phone: '', email: '',
  id_number: '', move_in_date: '', move_out_date: '', status: 'active',
}

export default function TenantForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [tenant, setTenant] = useState(EMPTY)
  const [units, setUnits] = useState([])
  const [errors, setErrors] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [id])

  async function load() {
    let currentTenant = EMPTY
    if (id) {
      const { data, error } = await supabase.from('tenants').select('*').eq('id', id).single()
      if (error || !data) { navigate('/tenants'); return }
      currentTenant = data
    }

    // Units available: currently vacant, plus the tenant's own current unit (if editing)
    const { data: unitsData } = await supabase.from('units').select('id, unit_number, status').order('unit_number')
    const filtered = (unitsData || []).filter((u) => u.status === 'vacant' || u.id === currentTenant.unit_id)

    setUnits(filtered)
    setTenant({ ...EMPTY, ...currentTenant, unit_id: currentTenant.unit_id || '' })
    setLoading(false)
  }

  function update(field, value) { setTenant((t) => ({ ...t, [field]: value })) }

  async function handleSubmit(e) {
    e.preventDefault()
    const errs = []
    if (!tenant.full_name?.trim()) errs.push('Full name is required.')
    setErrors(errs)
    if (errs.length) return

    const payload = {
      unit_id: tenant.unit_id || null,
      full_name: tenant.full_name.trim(),
      phone: tenant.phone || null,
      email: tenant.email || null,
      id_number: tenant.id_number || null,
      move_in_date: tenant.move_in_date || null,
      move_out_date: tenant.move_out_date || null,
      status: tenant.status,
    }

    // A database trigger keeps units.status in sync when a tenant is
    // assigned, reassigned, vacated, or deleted — no extra queries needed here.
    if (id) {
      await supabase.from('tenants').update(payload).eq('id', id)
    } else {
      await supabase.from('tenants').insert(payload)
    }
    navigate('/tenants')
  }

  if (loading) return <Layout title="Edit Tenant"><div className="empty-state">Loading…</div></Layout>

  return (
    <Layout title={id ? 'Edit Tenant' : 'Add Tenant'}>
      <div className="card form-card">
        {errors.length > 0 && <div className="alert alert-error">{errors.join(' ')}</div>}

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-grid">
            <div className="field">
              <label>Full Name</label>
              <input type="text" value={tenant.full_name} onChange={(e) => update('full_name', e.target.value)} required />
            </div>
            <div className="field">
              <label>Assign Unit</label>
              <select value={tenant.unit_id} onChange={(e) => update('unit_id', e.target.value)}>
                <option value="">— Unassigned —</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>{u.unit_number}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Phone</label>
              <input type="text" value={tenant.phone || ''} onChange={(e) => update('phone', e.target.value)} placeholder="07XXXXXXXX" />
            </div>
            <div className="field">
              <label>Email</label>
              <input type="email" value={tenant.email || ''} onChange={(e) => update('email', e.target.value)} />
            </div>
            <div className="field">
              <label>National ID Number</label>
              <input type="text" value={tenant.id_number || ''} onChange={(e) => update('id_number', e.target.value)} />
            </div>
            <div className="field">
              <label>Status</label>
              <select value={tenant.status} onChange={(e) => update('status', e.target.value)}>
                <option value="active">Active</option>
                <option value="vacated">Vacated</option>
              </select>
            </div>
            <div className="field">
              <label>Move-in Date</label>
              <input type="date" value={tenant.move_in_date || ''} onChange={(e) => update('move_in_date', e.target.value)} />
            </div>
            <div className="field">
              <label>Move-out Date</label>
              <input type="date" value={tenant.move_out_date || ''} onChange={(e) => update('move_out_date', e.target.value)} />
            </div>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary">{id ? 'Save Changes' : 'Add Tenant'}</button>
            <Link to="/tenants" className="btn btn-outline">Cancel</Link>
          </div>
        </form>
      </div>
    </Layout>
  )
}
