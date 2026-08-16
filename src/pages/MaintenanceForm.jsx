import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import { supabase } from '../supabaseClient'
import { todayISO } from '../lib/constants'

const CATEGORIES = { plumbing: 'Plumbing', electrical: 'Electrical', structural: 'Structural', appliance: 'Appliance', general: 'General' }

export default function MaintenanceForm() {
  const navigate = useNavigate()
  const [tenants, setTenants] = useState([])
  const [errors, setErrors] = useState([])
  const [form, setForm] = useState({
    tenant_id: '', category: 'plumbing', description: '', priority: 'medium', date_reported: todayISO(),
  })

  useEffect(() => {
    supabase
      .from('tenants')
      .select('id, full_name, unit_id, units(unit_number)')
      .eq('status', 'active')
      .order('full_name')
      .then(({ data }) => setTenants(data || []))
  }, [])

  function update(field, value) { setForm((f) => ({ ...f, [field]: value })) }

  async function handleSubmit(e) {
    e.preventDefault()
    const errs = []
    if (!form.tenant_id) errs.push('Please select a tenant.')
    if (!form.description.trim()) errs.push('Please describe the issue.')
    setErrors(errs)
    if (errs.length) return

    const tenantRow = tenants.find((t) => String(t.id) === String(form.tenant_id))
    const unitId = tenantRow?.unit_id || null

    await supabase.from('maintenance_requests').insert({
      tenant_id: form.tenant_id,
      unit_id: unitId,
      category: form.category,
      description: form.description.trim(),
      priority: form.priority,
      date_reported: form.date_reported,
    })
    navigate('/maintenance')
  }

  return (
    <Layout title="Log Maintenance Request">
      <div className="card form-card">
        {errors.length > 0 && <div className="alert alert-error">{errors.join(' ')}</div>}

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-grid">
            <div className="field">
              <label>Tenant</label>
              <select value={form.tenant_id} onChange={(e) => update('tenant_id', e.target.value)} required>
                <option value="">— Select tenant —</option>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.full_name}{t.units?.unit_number ? ` — ${t.units.unit_number}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Category</label>
              <select value={form.category} onChange={(e) => update('category', e.target.value)}>
                {Object.entries(CATEGORIES).map(([val, label]) => <option key={val} value={val}>{label}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Priority</label>
              <select value={form.priority} onChange={(e) => update('priority', e.target.value)}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <div className="field">
              <label>Date Reported</label>
              <input type="date" value={form.date_reported} onChange={(e) => update('date_reported', e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>Description of Issue</label>
            <textarea
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
              required
              placeholder="e.g. Kitchen sink is leaking under the cabinet..."
            ></textarea>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary">Log Request</button>
            <Link to="/maintenance" className="btn btn-outline">Cancel</Link>
          </div>
        </form>
      </div>
    </Layout>
  )
}
