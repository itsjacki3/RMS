import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Layout from '../components/Layout'
import { supabase } from '../supabaseClient'
import { useToast } from '../context/ToastContext'
import { useAdminConfirm } from '../context/AdminConfirmContext'
import { setUnitRent } from '../lib/api'
import { formatKES, formatPeriod, todayISO } from '../lib/constants'

const EMPTY = { unit_number: '', floor: '', bedrooms: 1, rent_amount: '', status: 'vacant' }

export default function UnitForm() {
  const { notify } = useToast()
  const { confirmAsAdmin } = useAdminConfirm()
  const { id } = useParams()
  const navigate = useNavigate()
  const [unit, setUnit] = useState(EMPTY)
  const [errors, setErrors] = useState([])
  const [loading, setLoading] = useState(!!id)
  const thisMonth = todayISO().slice(0, 7)                 // 'YYYY-MM'
  const [originalRent, setOriginalRent] = useState(null)    // rent when the form opened
  const [effectiveMonth, setEffectiveMonth] = useState(thisMonth)

  useEffect(() => {
    if (!id) return
    supabase.from('units').select('*').eq('id', id).single().then(({ data, error }) => {
      if (error || !data) { navigate('/units'); return }
      setUnit(data)
      setOriginalRent(Number(data.rent_amount))
      setLoading(false)
    })
  }, [id])

  function update(field, value) { setUnit((u) => ({ ...u, [field]: value })) }

  const rentChanged = !!id && originalRent !== null && Number(unit.rent_amount) > 0
    && Number(unit.rent_amount) !== originalRent

  async function handleSubmit(e) {
    e.preventDefault()
    const errs = []
    if (!unit.unit_number?.trim()) errs.push('Unit number is required.')
    if (!(Number(unit.rent_amount) > 0)) errs.push('Rent amount must be greater than zero.')
    setErrors(errs)
    if (errs.length) return

    const payload = {
      unit_number: unit.unit_number.trim(),
      floor: unit.floor || null,
      bedrooms: Number(unit.bedrooms) || 0,
      status: unit.status,
    }

    if (!id) {
      const { error } = await supabase.from('units').insert({ ...payload, rent_amount: Number(unit.rent_amount) })
      if (error) {
        notify(error.code === '23505' ? `A unit numbered "${payload.unit_number}" already exists.` : 'Could not save unit: ' + error.message, 'error')
        return
      }
      notify(`Unit ${payload.unit_number} saved.`)
      navigate('/units')
      return
    }

    // Rent changes go through set_unit_rent so the unit's bills are recalculated.
    if (rentChanged) {
      if (!effectiveMonth) { setErrors(['Choose the month the new rent starts from.']); return }
      const effectiveFrom = `${effectiveMonth}-01`
      const backdated = effectiveMonth < thisMonth
      const newRent = Number(unit.rent_amount)

      let ok = false
      if (backdated) {
        ok = await confirmAsAdmin({
          title: 'Restate past bills',
          message: `Setting the rent to ${formatKES(newRent)} from ${formatPeriod(effectiveFrom)} recalculates the bills already issued from that month on for this unit's tenants. Their balances will change (an over-payment shows as credit). Enter the admin password to continue.`,
          confirmLabel: 'Yes, restate bills',
          danger: true,
          run: (password) => setUnitRent(id, newRent, effectiveFrom, password),
        })
      } else {
        const res = await setUnitRent(id, newRent, effectiveFrom)
        ok = res.ok
        if (!ok) notify('Could not change the rent: ' + res.error, 'error')
      }
      if (!ok) return
    }

    const { error } = await supabase.from('units').update(payload).eq('id', id)
    if (error) {
      notify(error.code === '23505' ? `A unit numbered "${payload.unit_number}" already exists.` : 'Could not save unit: ' + error.message, 'error')
      return
    }
    notify(rentChanged
      ? `Unit ${payload.unit_number} updated. New rent applies from ${formatPeriod(`${effectiveMonth}-01`)}.`
      : `Unit ${payload.unit_number} updated.`)
    navigate('/units')
  }

  if (loading) return <Layout title="Edit Unit"><div className="empty-state">Loading…</div></Layout>

  return (
    <Layout title={id ? 'Edit Unit' : 'Add Unit'}>
      <div className="card form-card">
        {errors.length > 0 && <div className="alert alert-error">{errors.join(' ')}</div>}

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-grid">
            <div className="field">
              <label>Unit Number</label>
              <input type="text" value={unit.unit_number} onChange={(e) => update('unit_number', e.target.value)} placeholder="e.g. A1" required />
            </div>
            <div className="field">
              <label>Floor</label>
              <input type="text" value={unit.floor || ''} onChange={(e) => update('floor', e.target.value)} placeholder="e.g. Ground, 1st Floor" />
            </div>
            <div className="field">
              <label>Bedrooms</label>
              <input type="number" min="0" value={unit.bedrooms} onChange={(e) => update('bedrooms', e.target.value)} />
            </div>
            <div className="field">
              <label>Monthly Rent (KES)</label>
              <input type="number" step="0.01" value={unit.rent_amount} onChange={(e) => update('rent_amount', e.target.value)} required />
            </div>
            {rentChanged && (
              <div className="field">
                <label>New rent applies from</label>
                <input type="month" value={effectiveMonth} onChange={(e) => setEffectiveMonth(e.target.value)} required />
                <small className="cell-muted">
                  Bills from this month onward are recalculated at the new rent; earlier bills stay as they are.
                  {effectiveMonth && effectiveMonth < thisMonth && ' This is a past month, so you will be asked for the admin password.'}
                </small>
              </div>
            )}
            <div className="field">
              <label>Status</label>
              <select value={unit.status} onChange={(e) => update('status', e.target.value)}>
                <option value="vacant">Vacant</option>
                <option value="occupied">Occupied</option>
                <option value="maintenance">Under Maintenance</option>
              </select>
            </div>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary">{id ? 'Save Changes' : 'Add Unit'}</button>
            <Link to="/units" className="btn btn-outline">Cancel</Link>
          </div>
        </form>
      </div>
    </Layout>
  )
}
