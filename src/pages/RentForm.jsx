import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import { supabase } from '../supabaseClient'
import { MONTHS, todayISO } from '../lib/constants'

const now = new Date()

export default function RentForm() {
  const navigate = useNavigate()
  const [tenants, setTenants] = useState([])
  const [errors, setErrors] = useState([])
  const [form, setForm] = useState({
    tenant_id: '', period_month: now.getMonth() + 1, period_year: now.getFullYear(),
    amount_due: '', amount_paid: '', payment_date: todayISO(),
    method: 'M-Pesa', status: 'paid', notes: '',
  })

  useEffect(() => {
    supabase
      .from('tenants')
      .select('id, full_name, unit_id, units(unit_number, rent_amount)')
      .eq('status', 'active')
      .order('full_name')
      .then(({ data }) => setTenants(data || []))
  }, [])

  function update(field, value) { setForm((f) => ({ ...f, [field]: value })) }

  function handleTenantChange(id) {
    update('tenant_id', id)
    const t = tenants.find((t) => String(t.id) === String(id))
    if (t?.units?.rent_amount && !form.amount_due) {
      update('amount_due', t.units.rent_amount)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const errs = []
    if (!form.tenant_id) errs.push('Please select a tenant.')
    if (!(Number(form.amount_due) > 0)) errs.push('Amount due must be greater than zero.')
    setErrors(errs)
    if (errs.length) return

    const tenantRow = tenants.find((t) => String(t.id) === String(form.tenant_id))
    const unitId = tenantRow?.unit_id || null

    const payload = {
      tenant_id: form.tenant_id,
      unit_id: unitId,
      period_month: Number(form.period_month),
      period_year: Number(form.period_year),
      amount_due: Number(form.amount_due),
      amount_paid: form.status === 'paid' ? Number(form.amount_due) : Number(form.amount_paid || 0),
      payment_date: form.status === 'paid' ? (form.payment_date || todayISO()) : null,
      method: form.method,
      status: form.status,
      notes: form.notes || null,
    }

    await supabase.from('rent_payments').insert(payload)
    navigate('/rent')
  }

  return (
    <Layout title="Record Rent Payment">
      <div className="card form-card">
        {errors.length > 0 && <div className="alert alert-error">{errors.join(' ')}</div>}

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-grid">
            <div className="field">
              <label>Tenant</label>
              <select value={form.tenant_id} onChange={(e) => handleTenantChange(e.target.value)} required>
                <option value="">— Select tenant —</option>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.full_name}{t.units?.unit_number ? ` — ${t.units.unit_number}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Amount Due (KES)</label>
              <input type="number" step="0.01" value={form.amount_due} onChange={(e) => update('amount_due', e.target.value)} required />
            </div>
            <div className="field">
              <label>Period Month</label>
              <select value={form.period_month} onChange={(e) => update('period_month', e.target.value)}>
                {MONTHS.slice(1).map((name, i) => <option key={i + 1} value={i + 1}>{name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Period Year</label>
              <input type="number" value={form.period_year} onChange={(e) => update('period_year', e.target.value)} />
            </div>
            <div className="field">
              <label>Status</label>
              <select value={form.status} onChange={(e) => update('status', e.target.value)}>
                <option value="paid">Paid</option>
                <option value="pending">Pending</option>
                <option value="overdue">Overdue</option>
              </select>
            </div>
            <div className="field">
              <label>Payment Method</label>
              <select value={form.method} onChange={(e) => update('method', e.target.value)}>
                {['M-Pesa', 'Bank Transfer', 'Cash', 'Cheque'].map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Payment Date</label>
              <input type="date" value={form.payment_date} onChange={(e) => update('payment_date', e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>Notes</label>
            <textarea value={form.notes} onChange={(e) => update('notes', e.target.value)}></textarea>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary">Save Payment</button>
            <Link to="/rent" className="btn btn-outline">Cancel</Link>
          </div>
        </form>
      </div>
    </Layout>
  )
}
