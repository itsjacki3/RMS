import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import { supabase } from '../supabaseClient'
import { MONTHS } from '../lib/constants'

const now = new Date()
function defaultDueDate() {
  const d = new Date()
  d.setDate(d.getDate() + 14)
  return d.toISOString().slice(0, 10)
}

export default function WaterBillForm() {
  const navigate = useNavigate()
  const [tenants, setTenants] = useState([])
  const [errors, setErrors] = useState([])
  const [form, setForm] = useState({
    tenant_id: '', billing_month: now.getMonth() + 1, billing_year: now.getFullYear(),
    previous_reading: '', current_reading: '', rate_per_unit: 150,
    due_date: defaultDueDate(), status: 'pending',
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
    if (Number(form.current_reading) < Number(form.previous_reading)) {
      errs.push('Current reading cannot be less than the previous reading.')
    }
    setErrors(errs)
    if (errs.length) return

    const tenantRow = tenants.find((t) => String(t.id) === String(form.tenant_id))
    const unitId = tenantRow?.unit_id || null
    const units = Number(form.current_reading) - Number(form.previous_reading)
    const amount = units * Number(form.rate_per_unit)

    await supabase.from('water_bills').insert({
      tenant_id: form.tenant_id,
      unit_id: unitId,
      billing_month: Number(form.billing_month),
      billing_year: Number(form.billing_year),
      previous_reading: Number(form.previous_reading),
      current_reading: Number(form.current_reading),
      rate_per_unit: Number(form.rate_per_unit),
      amount,
      due_date: form.due_date || null,
      status: form.status,
    })
    navigate('/water-bills')
  }

  return (
    <Layout title="Add Water Bill">
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
              <label>Billing Month</label>
              <select value={form.billing_month} onChange={(e) => update('billing_month', e.target.value)}>
                {MONTHS.slice(1).map((name, i) => <option key={i + 1} value={i + 1}>{name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Billing Year</label>
              <input type="number" value={form.billing_year} onChange={(e) => update('billing_year', e.target.value)} />
            </div>
            <div className="field">
              <label>Rate per Unit (KES)</label>
              <input type="number" step="0.01" value={form.rate_per_unit} onChange={(e) => update('rate_per_unit', e.target.value)} />
            </div>
            <div className="field">
              <label>Previous Reading</label>
              <input type="number" step="0.01" value={form.previous_reading} onChange={(e) => update('previous_reading', e.target.value)} required />
            </div>
            <div className="field">
              <label>Current Reading</label>
              <input type="number" step="0.01" value={form.current_reading} onChange={(e) => update('current_reading', e.target.value)} required />
            </div>
            <div className="field">
              <label>Due Date</label>
              <input type="date" value={form.due_date} onChange={(e) => update('due_date', e.target.value)} />
            </div>
            <div className="field">
              <label>Status</label>
              <select value={form.status} onChange={(e) => update('status', e.target.value)}>
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
              </select>
            </div>
          </div>
          <p className="stat-sub">Amount is calculated automatically as (current reading − previous reading) × rate per unit.</p>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary">Save Bill</button>
            <Link to="/water-bills" className="btn btn-outline">Cancel</Link>
          </div>
        </form>
      </div>
    </Layout>
  )
}
