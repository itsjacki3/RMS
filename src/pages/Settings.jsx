import { useEffect, useState } from 'react'
import Layout from '../components/Layout'
import { supabase } from '../supabaseClient'
import { useToast } from '../context/ToastContext'
import { getSettings } from '../lib/api'

export default function Settings() {
  const { notify } = useToast()
  const [form, setForm] = useState(null)
  const [errors, setErrors] = useState([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getSettings().then((s) => {
      if (s) {
        setForm({
          water_rate_per_unit: s.water_rate_per_unit,
          garbage_enabled: s.garbage_enabled,
          garbage_amount: s.garbage_amount,
          rent_due_day: s.rent_due_day,
        })
      }
    })
  }, [])

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const errs = []
    if (form.water_rate_per_unit === '' || Number(form.water_rate_per_unit) < 0) errs.push('Water price per unit must be 0 or more.')
    if (form.garbage_enabled && !(Number(form.garbage_amount) > 0)) errs.push('Enter the monthly garbage amount.')
    const day = Number(form.rent_due_day)
    if (!Number.isInteger(day) || day < 1 || day > 28) errs.push('Rent due day must be between 1 and 28.')
    setErrors(errs)
    if (errs.length) return

    setSaving(true)
    const { error } = await supabase.from('settings').update({
      water_rate_per_unit: Number(form.water_rate_per_unit),
      garbage_enabled: form.garbage_enabled,
      garbage_amount: Number(form.garbage_amount) || 0,
      rent_due_day: day,
      updated_at: new Date().toISOString(),
    }).eq('id', 1)
    setSaving(false)

    if (error) notify('Could not save settings: ' + error.message, 'error')
    else notify('Settings saved.')
  }

  if (!form) return <Layout title="Settings"><div className="empty-state">Loading…</div></Layout>

  return (
    <Layout title="Settings" subtitle="Control how tenant bills are calculated">
      {errors.length > 0 && <div className="alert alert-error">{errors.join(' ')}</div>}

      <form onSubmit={handleSubmit} noValidate>
        <div className="card form-card settings-section">
          <h3>Water</h3>
          <p className="stat-sub">
            Each reading you enter on a tenant&rsquo;s profile is billed as
            (current reading &minus; previous reading) &times; this price, and added to that month&rsquo;s amount due.
          </p>
          <div className="form-grid">
            <div className="field">
              <label>Price per water unit (KES)</label>
              <input type="number" step="0.01" min="0" value={form.water_rate_per_unit}
                     onChange={(e) => update('water_rate_per_unit', e.target.value)} />
            </div>
          </div>
          <p className="stat-sub">A new price applies to readings entered from now on. Readings already recorded keep the price they were billed at.</p>
        </div>

        <div className="card form-card settings-section">
          <h3>Garbage collection</h3>
          <p className="stat-sub">
            When switched on, a flat charge is added to every tenant&rsquo;s monthly amount due alongside the rent.
          </p>
          <label className="switch-row">
            <span className="switch">
              <input type="checkbox" checked={form.garbage_enabled}
                     onChange={(e) => update('garbage_enabled', e.target.checked)} />
              <span className="switch-track"></span>
            </span>
            <span>{form.garbage_enabled ? 'Garbage charge is ON' : 'Garbage charge is OFF'}</span>
          </label>
          <div className="form-grid">
            <div className="field">
              <label>Monthly garbage charge (KES)</label>
              <input type="number" step="0.01" min="0" value={form.garbage_amount} disabled={!form.garbage_enabled}
                     onChange={(e) => update('garbage_amount', e.target.value)} />
            </div>
          </div>
          <p className="stat-sub">Changes apply to months billed from now on &mdash; months already billed are not rewritten.</p>
        </div>

        <div className="card form-card settings-section">
          <h3>Rent schedule</h3>
          <div className="form-grid">
            <div className="field">
              <label>Rent due on day of month (1&ndash;28)</label>
              <input type="number" min="1" max="28" value={form.rent_due_day}
                     onChange={(e) => update('rent_due_day', e.target.value)} />
            </div>
          </div>
          <p className="stat-sub">
            A month becomes <strong>overdue</strong> once its due day has passed and it isn&rsquo;t fully paid.
            Tenants are billed from their move-in month.
          </p>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Settings'}</button>
        </div>
      </form>
    </Layout>
  )
}
