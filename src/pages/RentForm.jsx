import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import Layout from '../components/Layout'
import DateInput from '../components/DateInput'
import { supabase } from '../supabaseClient'
import { useToast } from '../context/ToastContext'
import { useAdminConfirm } from '../context/AdminConfirmContext'
import { ensureCharges, adminUpdatePayment } from '../lib/api'
import { formatKES, formatDate, todayISO } from '../lib/constants'

const METHODS = ['M-Pesa', 'Bank Transfer', 'Cash', 'Cheque']

/** Record a payment (/rent/new) or edit one (/rent/:id/edit — admin password required). */
export default function RentForm() {
  const { id } = useParams()                       // payment id when editing
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const preTenant = searchParams.get('tenant') || ''
  const back = searchParams.get('back')
  const { notify } = useToast()
  const { confirmAsAdmin } = useAdminConfirm()

  const [tenants, setTenants] = useState([])
  const [original, setOriginal] = useState(null)   // the payment as it was before editing
  const [loading, setLoading] = useState(true)
  const [errors, setErrors] = useState([])
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    tenant_id: preTenant, amount: '', payment_date: todayISO(), method: 'M-Pesa', notes: '',
  })

  useEffect(() => {
    let active = true
    async function init() {
      await ensureCharges()

      let keepTenant = preTenant
      if (isEdit) {
        const { data, error } = await supabase.from('payments').select('*').eq('id', id).single()
        if (!active) return
        if (error || !data) { notify('That payment no longer exists.', 'error'); navigate('/rent'); return }
        setOriginal(data)
        keepTenant = String(data.tenant_id)
        setForm({
          tenant_id: keepTenant,
          amount: data.amount,
          payment_date: data.payment_date,
          method: METHODS.includes(data.method) ? data.method : 'M-Pesa',
          notes: data.notes || '',
        })
      }

      const { data } = await supabase.from('tenant_balances').select('*').order('full_name')
      if (!active) return
      setTenants((data || []).filter((r) =>
        r.tenant_status === 'active' || Number(r.balance) !== 0 || String(r.tenant_id) === keepTenant))
      setLoading(false)
    }
    init()
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, preTenant])

  function update(field, value) { setForm((f) => ({ ...f, [field]: value })) }

  const selected = tenants.find((t) => String(t.tenant_id) === String(form.tenant_id))
  const amount = Number(form.amount) || 0
  // When editing, work from the balance WITHOUT the payment being edited
  const balance = selected ? Number(selected.balance) + (isEdit && original ? Number(original.amount) : 0) : 0
  const after = balance - amount
  const destination = back === 'profile' && form.tenant_id ? `/tenants/${form.tenant_id}` : '/rent'

  async function handleSubmit(e) {
    e.preventDefault()
    const errs = []
    if (!form.tenant_id) errs.push('Please select a tenant.')
    if (!(amount > 0)) errs.push('Enter the amount received (more than zero).')
    if (!form.payment_date) errs.push('Enter a valid payment date (dd/mm/yy).')
    setErrors(errs)
    if (errs.length) return

    const fields = {
      amount,
      payment_date: form.payment_date,
      method: form.method,
      notes: form.notes.trim() || null,
    }

    /* ---------- edit: admin password, then confirm ---------- */
    if (isEdit) {
      const done = await confirmAsAdmin({
        title: 'Edit payment',
        message: `Change ${selected?.full_name}'s payment from ${formatKES(original.amount)} on ${formatDate(original.payment_date)} `
               + `to ${formatKES(amount)} on ${formatDate(form.payment_date)}? Their balance will be recalculated.`,
        confirmLabel: 'Yes, save changes',
        run: (password) => adminUpdatePayment(id, fields, password),
      })
      if (done) {
        notify(`Payment updated — now ${formatKES(amount)} for ${selected?.full_name}.`)
        navigate(destination)
      }
      return
    }

    /* ---------- add ---------- */
    setSaving(true)
    const { error } = await supabase.from('payments').insert({ tenant_id: Number(form.tenant_id), ...fields })
    setSaving(false)
    if (error) { setErrors(['Could not save payment: ' + error.message]); notify('Could not save payment.', 'error'); return }

    notify(`Payment of ${formatKES(amount)} added for ${selected?.full_name}.`)
    navigate(destination)
  }

  if (loading) return <Layout title={isEdit ? 'Edit Payment' : 'Record Payment'}><div className="empty-state">Loading…</div></Layout>

  return (
    <Layout
      title={isEdit ? 'Edit Payment' : 'Record Payment'}
      subtitle={isEdit
        ? 'Editing a payment needs the admin password. The tenant’s balance is recalculated afterwards.'
        : 'Payments are applied to the oldest unpaid month first. Any extra becomes credit for the next bill.'}
    >
      <div className="card form-card">
        {errors.length > 0 && <div className="alert alert-error">{errors.join(' ')}</div>}

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-grid">
            <div className="field">
              <label>Tenant</label>
              <select value={form.tenant_id} onChange={(e) => update('tenant_id', e.target.value)} required disabled={isEdit}>
                <option value="">— Select tenant —</option>
                {tenants.map((t) => (
                  <option key={t.tenant_id} value={t.tenant_id}>
                    {t.full_name}{t.unit_number ? ` — ${t.unit_number}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Amount Received (KES)</label>
              <input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => update('amount', e.target.value)} required />
            </div>
            <div className="field">
              <label>Payment Date</label>
              <DateInput value={form.payment_date} onChange={(v) => update('payment_date', v)} />
            </div>
            <div className="field">
              <label>Payment Method</label>
              <select value={form.method} onChange={(e) => update('method', e.target.value)}>
                {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>

          {selected && (
            <div className="balance-box">
              <div>
                {isEdit && <>Without this payment, the account would be at </>}
                {!isEdit && balance > 0 && <>Currently owes </>}
                {!isEdit && balance < 0 && <>Currently has credit of </>}
                {!isEdit && balance === 0 && <>Account is up to date</>}
                {(isEdit || balance !== 0) && <strong>{formatKES(Math.abs(balance))}{isEdit ? (balance > 0 ? ' owed' : balance < 0 ? ' credit' : '') : ''}</strong>}
                {!isEdit && balance > 0 && Number(selected.months_overdue) > 0 && (
                  <> ({selected.months_overdue} month{selected.months_overdue > 1 ? 's' : ''} overdue)</>
                )}
                {balance > 0 && (
                  <button type="button" className="btn btn-outline btn-sm pay-full-btn"
                          onClick={() => update('amount', balance)}>Pay full balance</button>
                )}
              </div>
              {amount > 0 && (
                <div className="balance-after">
                  After this payment:{' '}
                  {after > 0 && <strong>{formatKES(after)} still due</strong>}
                  {after === 0 && <strong>fully paid up</strong>}
                  {after < 0 && <strong>{formatKES(-after)} credit, applied to the next bill automatically</strong>}
                </div>
              )}
            </div>
          )}

          <div className="field">
            <label>Notes</label>
            <textarea value={form.notes} onChange={(e) => update('notes', e.target.value)} placeholder="e.g. M-Pesa code"></textarea>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Save Payment'}
            </button>
            <Link to={destination} className="btn btn-outline">Cancel</Link>
          </div>
        </form>
      </div>
    </Layout>
  )
}
