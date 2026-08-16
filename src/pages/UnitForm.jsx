import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Layout from '../components/Layout'
import { supabase } from '../supabaseClient'

const EMPTY = { unit_number: '', floor: '', bedrooms: 1, rent_amount: '', status: 'vacant' }

export default function UnitForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [unit, setUnit] = useState(EMPTY)
  const [errors, setErrors] = useState([])
  const [loading, setLoading] = useState(!!id)

  useEffect(() => {
    if (!id) return
    supabase.from('units').select('*').eq('id', id).single().then(({ data, error }) => {
      if (error || !data) { navigate('/units'); return }
      setUnit(data)
      setLoading(false)
    })
  }, [id])

  function update(field, value) { setUnit((u) => ({ ...u, [field]: value })) }

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
      rent_amount: Number(unit.rent_amount),
      status: unit.status,
    }

    if (id) {
      await supabase.from('units').update(payload).eq('id', id)
    } else {
      await supabase.from('units').insert(payload)
    }
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
