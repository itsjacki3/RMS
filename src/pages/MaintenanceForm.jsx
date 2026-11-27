import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Layout from '../components/Layout'
import DateInput from '../components/DateInput'
import { supabase } from '../supabaseClient'
import { useToast } from '../context/ToastContext'
import { formatKES, todayISO } from '../lib/constants'

const CATEGORIES = { plumbing: 'Plumbing', electrical: 'Electrical', structural: 'Structural', appliance: 'Appliance', general: 'General' }

export default function MaintenanceForm() {
  const { notify } = useToast()
  const { id } = useParams()
  const navigate = useNavigate()
  const [tenants, setTenants] = useState([])
  const [tenantLabel, setTenantLabel] = useState('')
  const [errors, setErrors] = useState([])
  const [loading, setLoading] = useState(!!id)
  const [form, setForm] = useState({
    tenant_id: '', category: 'plumbing', description: '', priority: 'medium', status: 'open',
    date_reported: todayISO(), date_resolved: '', cost: '', bill_to_tenant: false,
  })

  useEffect(() => {
    if (id) {
      supabase.from('maintenance_requests').select('*, tenants(full_name), units(unit_number)').eq('id', id).single()
        .then(({ data, error }) => {
          if (error || !data) { navigate('/maintenance'); return }
          setForm({
            tenant_id: data.tenant_id || '',
            category: data.category,
            description: data.description,
            priority: data.priority,
            status: data.status,
            date_reported: data.date_reported || '',
            date_resolved: data.date_resolved || '',
            cost: Number(data.cost) > 0 ? String(data.cost) : '',
            bill_to_tenant: !!data.bill_to_tenant,
          })
          setTenantLabel(`${data.tenants?.full_name || 'Unknown tenant'}${data.units?.unit_number ? ` — ${data.units.unit_number}` : ''}`)
          setLoading(false)
        })
    } else {
      supabase
        .from('tenants')
        .select('id, full_name, unit_id, units(unit_number)')
        .eq('status', 'active')
        .order('full_name')
        .then(({ data }) => setTenants(data || []))
    }
  }, [id])

  function update(field, value) { setForm((f) => ({ ...f, [field]: value })) }

  function changeStatus(status) {
    setForm((f) => ({
      ...f,
      status,
      date_resolved: status === 'resolved' ? (f.date_resolved || todayISO()) : '',
    }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const errs = []
    const cost = Number(form.cost || 0)
    if (!form.tenant_id) errs.push('Please select a tenant.')
    if (!form.description.trim()) errs.push('Please describe the issue.')
    if (!form.date_reported) errs.push('Enter a valid date reported (dd/mm/yy).')
    if (form.status === 'resolved' && !form.date_resolved) errs.push('Enter a valid date resolved (dd/mm/yy).')
    if (cost < 0) errs.push('The cost cannot be negative.')
    if (form.bill_to_tenant && !(cost > 0)) errs.push('Enter the cost to charge it to the tenant.')
    setErrors(errs)
    if (errs.length) return

    const payload = {
      category: form.category,
      description: form.description.trim(),
      priority: form.priority,
      status: form.status,
      date_reported: form.date_reported,
      date_resolved: form.status === 'resolved' ? form.date_resolved : null,
      cost,
      bill_to_tenant: form.bill_to_tenant && cost > 0,
    }

    let error
    if (id) {
      ;({ error } = await supabase.from('maintenance_requests').update(payload).eq('id', id))
    } else {
      const tenantRow = tenants.find((t) => String(t.id) === String(form.tenant_id))
      ;({ error } = await supabase.from('maintenance_requests').insert({
        ...payload,
        tenant_id: form.tenant_id,
        unit_id: tenantRow?.unit_id || null,
      }))
    }
    if (error) { notify('Could not save request: ' + error.message, 'error'); return }

    notify(payload.bill_to_tenant
      ? `Request saved. ${formatKES(cost)} charged to the tenant's account.`
      : id ? 'Request updated.' : 'Maintenance request logged.')
    navigate('/maintenance')
  }

  if (loading) return <Layout title="Edit Maintenance Request"><div className="empty-state">Loading…</div></Layout>

  return (
    <Layout title={id ? 'Edit Maintenance Request' : 'Log Maintenance Request'}>
      <div className="card form-card">
        {errors.length > 0 && <div className="alert alert-error">{errors.join(' ')}</div>}

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-grid">
            <div className="field">
              <label>Tenant</label>
              {id ? (
                <input type="text" value={tenantLabel} disabled />
              ) : (
                <select value={form.tenant_id} onChange={(e) => update('tenant_id', e.target.value)} required>
                  <option value="">— Select tenant —</option>
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.full_name}{t.units?.unit_number ? ` — ${t.units.unit_number}` : ''}
                    </option>
                  ))}
                </select>
              )}
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
              <label>Status</label>
              <select value={form.status} onChange={(e) => changeStatus(e.target.value)}>
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
              </select>
            </div>
            <div className="field">
              <label>Date Reported</label>
              <DateInput value={form.date_reported} onChange={(v) => update('date_reported', v)} />
            </div>
            {form.status === 'resolved' && (
              <div className="field">
                <label>Date Resolved</label>
                <DateInput value={form.date_resolved} onChange={(v) => update('date_resolved', v)} />
              </div>
            )}
            <div className="field">
              <label>Cost of Repair (KES)</label>
              <input type="number" min="0" step="0.01" value={form.cost} onChange={(e) => update('cost', e.target.value)} placeholder="0" />
            </div>
            <div className="field">
              <label>Billing</label>
              <label className="check-row">
                <input type="checkbox" checked={form.bill_to_tenant} onChange={(e) => update('bill_to_tenant', e.target.checked)} />
                <span>Charge this cost to the tenant</span>
              </label>
              <small className="cell-muted">
                {form.bill_to_tenant
                  ? 'It is added to the tenant’s monthly statement and amount due, and is paid like rent.'
                  : 'Left unticked, it is recorded as the landlord’s own expense and not billed.'}
              </small>
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
            <button type="submit" className="btn btn-primary">{id ? 'Save Changes' : 'Log Request'}</button>
            <Link to="/maintenance" className="btn btn-outline">Cancel</Link>
          </div>
        </form>
      </div>
    </Layout>
  )
}
