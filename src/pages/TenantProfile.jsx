import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Layout from '../components/Layout'
import Badge from '../components/Badge'
import Icon from '../components/Icon'
import { supabase } from '../supabaseClient'
import { useToast } from '../context/ToastContext'
import { useAdminConfirm } from '../context/AdminConfirmContext'
import { ensureCharges, getSettings, adminDeletePayment } from '../lib/api'
import { formatKES, formatNumber, formatDate, formatPeriod } from '../lib/constants'

function LedgerBadge({ status }) {
  if (status === 'paid') return <Badge color="green">Paid</Badge>
  if (status === 'overdue') return <Badge color="red">Overdue</Badge>
  if (status === 'partial') return <Badge color="amber">Part-paid</Badge>
  return <Badge color="blue">Due</Badge>
}

export default function TenantProfile() {
  const { notify } = useToast()
  const { confirmAsAdmin } = useAdminConfirm()
  const { id } = useParams()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('statement')

  const [tenant, setTenant] = useState(null)
  const [balance, setBalance] = useState(null)
  const [ledger, setLedger] = useState([])
  const [readings, setReadings] = useState([])
  const [payments, setPayments] = useState([])
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)

  // water-reading form
  const [period, setPeriod] = useState('')
  const [prevOverride, setPrevOverride] = useState(null)
  const [current, setCurrent] = useState('')
  const [waterError, setWaterError] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    await ensureCharges()
    const [t, b, l, w, p, s] = await Promise.all([
      supabase.from('tenants').select('*, units(unit_number)').eq('id', id).single(),
      supabase.from('tenant_balances').select('*').eq('tenant_id', id).maybeSingle(),
      supabase.from('tenant_ledger').select('*').eq('tenant_id', id).order('period_start', { ascending: false }),
      supabase.from('water_readings').select('*').eq('tenant_id', id).order('period_start', { ascending: false }),
      supabase.from('payments').select('*').eq('tenant_id', id)
        .order('payment_date', { ascending: false }).order('id', { ascending: false }),
      getSettings(),
    ])
    if (t.error || !t.data) { navigate('/tenants'); return }
    setTenant(t.data)
    setBalance(b.data)
    setLedger(l.data || [])
    setReadings(w.data || [])
    setPayments(p.data || [])
    setSettings(s)
    setLoading(false)
  }, [id, navigate])

  useEffect(() => { load() }, [load])

  /* ----- water-reading form: derived values ----- */
  const available = ledger.filter((r) => !readings.some((w) => w.period_start === r.period_start))
  const effectivePeriod = available.some((r) => r.period_start === period) ? period : (available[0]?.period_start || '')
  // previous reading defaults to the closest earlier reading's "current", else 0
  const earlier = readings.find((w) => w.period_start < effectivePeriod)
  const defaultPrev = earlier ? Number(earlier.current_reading) : 0
  const prevValue = prevOverride ?? defaultPrev
  const rate = Number(settings?.water_rate_per_unit || 0)
  const unitsUsed = current === '' ? 0 : Number(current) - Number(prevValue)
  const previewAmount = unitsUsed > 0 ? unitsUsed * rate : 0

  async function addReading(e) {
    e.preventDefault()
    setWaterError('')
    if (!effectivePeriod) { setWaterError('There is no billed month left to add a reading to.'); return }
    if (current === '') { setWaterError('Enter the current meter reading.'); return }
    if (Number(current) < Number(prevValue)) { setWaterError('Current reading cannot be less than the previous reading.'); return }

    setSaving(true)
    const { error } = await supabase.from('water_readings').insert({
      tenant_id: Number(id),
      period_start: effectivePeriod,
      previous_reading: Number(prevValue),
      current_reading: Number(current),
      rate_per_unit: rate,
    })
    setSaving(false)

    if (error) {
      setWaterError(error.code === '23505'
        ? 'A reading for that month already exists. Delete it first to enter a new one.'
        : 'Could not save reading: ' + error.message)
      return
    }
    setCurrent('')
    setPrevOverride(null)
    setPeriod('')
    notify(`Water reading added — ${formatKES(previewAmount)} added to ${formatPeriod(effectivePeriod)}.`)
    load()
  }

  async function deleteReading(w) {
    if (!window.confirm(`Delete the ${formatPeriod(w.period_start)} water reading? Its charge will be removed from the amount due.`)) return
    await supabase.from('water_readings').delete().eq('id', w.id)
    notify('Water reading deleted.')
    load()
  }

  async function deletePayment(p) {
    const done = await confirmAsAdmin({
      title: 'Delete payment',
      message: `Delete the ${formatKES(p.amount)} payment from ${formatDate(p.payment_date)}? ${tenant.full_name}'s balance will be recalculated and this cannot be undone.`,
      confirmLabel: 'Yes, delete payment',
      danger: true,
      run: (password) => adminDeletePayment(p.id, password),
    })
    if (done) {
      notify(`Payment of ${formatKES(p.amount)} deleted.`)
      load()
    }
  }

  if (loading) return <Layout title="Tenant"><div className="empty-state">Loading…</div></Layout>

  const b = balance || {}
  const monthsOverdue = Number(b.months_overdue || 0)

  return (
    <Layout
      title={tenant.full_name}
      subtitle={tenant.units?.unit_number ? `Unit ${tenant.units.unit_number}` : 'No unit assigned'}
      actions={
        <div className="topbar-actions">
          <Link to={`/tenants/${id}/edit`} className="btn btn-outline">Edit</Link>
          <Link to={`/rent/new?tenant=${id}&back=profile`} className="btn btn-primary">+ Record Payment</Link>
        </div>
      }
    >
      <Link to="/tenants" className="back-link"><Icon name="arrowLeft" size={15} /> All tenants</Link>

      {/* ---------- Balance summary ---------- */}
      <div className="stat-grid cols-3">
        <div className="card stat-card">
          <div className="stat-icon coral"><Icon name="rent" /></div>
          <div>
            <div className="stat-label">Amount Due</div>
            <div className="stat-value">{formatKES(b.amount_due)}</div>
            <div className="stat-sub">Rent + water{settings?.garbage_enabled ? ' + garbage' : ''}, billed to date</div>
          </div>
        </div>
        <div className="card stat-card">
          <div className="stat-icon pink"><Icon name="clock" /></div>
          <div>
            <div className="stat-label">Overdue</div>
            <div className="stat-value">{formatKES(b.overdue_amount)}</div>
            <div className="stat-sub">{monthsOverdue === 0 ? 'Nothing overdue' : `${monthsOverdue} month${monthsOverdue > 1 ? 's' : ''} overdue`}</div>
          </div>
        </div>
        <div className="card stat-card">
          <div className="stat-icon teal"><Icon name="check" /></div>
          <div>
            <div className="stat-label">Credit on Account</div>
            <div className="stat-value">{formatKES(b.credit)}</div>
            <div className="stat-sub">{Number(b.credit) > 0 ? 'Used automatically against the next bill' : 'No over-payment'}</div>
          </div>
        </div>
      </div>

      {/* ---------- Tenant details ---------- */}
      <div className="card profile-info">
        <div><span>Phone</span>{tenant.phone || '—'}</div>
        <div><span>Email</span>{tenant.email || '—'}</div>
        <div><span>National ID</span>{tenant.id_number || '—'}</div>
        <div><span>Move-in</span>{formatDate(tenant.move_in_date)}</div>
        <div><span>Move-out</span>{formatDate(tenant.move_out_date)}</div>
        <div><span>Status</span>{tenant.status === 'active' ? <Badge color="green">Active</Badge> : <Badge color="gray">Vacated</Badge>}</div>
      </div>

      {/* ---------- Tenant records tabs ---------- */}
      <div className="tenant-tabs">
        <button
          className={`tenant-tab ${activeTab === 'statement' ? 'active' : ''}`}
          onClick={() => setActiveTab('statement')}
        >
          <Icon name="fileText" size={16} />
          Monthly Statement
        </button>

        <button
          className={`tenant-tab ${activeTab === 'water' ? 'active' : ''}`}
          onClick={() => setActiveTab('water')}
        >
          <Icon name="droplet" size={16} />
          Water Readings
        </button>

        <button
          className={`tenant-tab ${activeTab === 'payments' ? 'active' : ''}`}
          onClick={() => setActiveTab('payments')}
        >
          <Icon name="wallet" size={16} />
          Payments ({payments.length})
        </button>
      </div>

      {/* ---------- Monthly statement ---------- */}

      {activeTab === 'statement' && (

      <div className="card table-card">
        <div className="table-card-head"><h3>Monthly Statement</h3></div>
        <div className="table-scroll"><table>
          <thead>
            <tr><th>Month</th><th>Due Date</th><th>Rent</th><th>Water</th><th>Garbage</th><th>Total</th><th>Paid</th><th>Outstanding</th><th>Status</th></tr>
          </thead>
          <tbody>
            {ledger.length === 0 && (
              <tr><td colSpan={9} className="empty-state">
                No bills yet. Bills start from the tenant&rsquo;s move-in month (or the &ldquo;billing starts from&rdquo; date in Settings, whichever is later) and need an assigned unit.
              </td></tr>
            )}
            {ledger.map((r) => (
              <tr key={r.period_start}>
                <td className="cell-strong">{formatPeriod(r.period_start)}</td>
                <td className="cell-muted">{formatDate(r.due_date)}</td>
                <td>{formatNumber(r.rent_amount)}</td>
                <td>{Number(r.water_amount) > 0 ? formatNumber(r.water_amount) : <span className="cell-muted">—</span>}</td>
                <td>{Number(r.garbage_amount) > 0 ? formatNumber(r.garbage_amount) : <span className="cell-muted">—</span>}</td>
                <td className="cell-strong">{formatNumber(r.total_charge)}</td>
                <td>{formatNumber(r.paid_amount)}</td>
                <td className="cell-strong">{formatNumber(r.outstanding)}</td>
                <td><LedgerBadge status={r.status} /></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
      )}

      {/* ---------- Water readings ---------- */}

      {activeTab === 'water' && (

      <div className="card table-card">
        <div className="table-card-head">
          <h3>Water Readings</h3>
          <span className="stat-sub" style={{ margin: 0 }}>
            KES {formatNumber(rate, 2)} per unit &middot; <Link to="/settings" className="text-link">change in Settings</Link>
          </span>
        </div>

        <form onSubmit={addReading} className="inline-form" noValidate>
          <div className="field">
            <label>Billing month</label>
            <select value={effectivePeriod} onChange={(e) => { setPeriod(e.target.value); setPrevOverride(null) }} disabled={available.length === 0}>
              {available.length === 0 && <option value="">No month available</option>}
              {available.map((r) => <option key={r.period_start} value={r.period_start}>{formatPeriod(r.period_start)}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Previous reading</label>
            <input type="number" step="0.01" min="0" value={prevValue} onChange={(e) => setPrevOverride(e.target.value)} />
          </div>
          <div className="field">
            <label>Current reading</label>
            <input type="number" step="0.01" min="0" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="e.g. 128" />
          </div>
          <div className="field">
            <label>Bill</label>
            <div className="bill-preview">
              {current === '' ? '—' : unitsUsed < 0 ? 'Check readings' : `${formatNumber(unitsUsed, 1)} units = ${formatKES(previewAmount)}`}
            </div>
          </div>
          <button type="submit" className="btn btn-primary" disabled={saving || available.length === 0}>
            {saving ? 'Saving…' : 'Add Reading'}
          </button>
        </form>
        {waterError && <div className="alert alert-error" style={{ margin: '0 20px 14px' }}>{waterError}</div>}

        <div className="table-scroll"><table>
          <thead>
            <tr><th>Month</th><th>Previous</th><th>Current</th><th>Units Used</th><th>Price / Unit</th><th>Amount</th><th></th></tr>
          </thead>
          <tbody>
            {readings.length === 0 && (
              <tr><td colSpan={7} className="empty-state">No water readings yet.</td></tr>
            )}
            {readings.map((w) => (
              <tr key={w.id}>
                <td className="cell-strong">{formatPeriod(w.period_start)}</td>
                <td className="cell-muted">{formatNumber(w.previous_reading, 1)}</td>
                <td className="cell-muted">{formatNumber(w.current_reading, 1)}</td>
                <td>{formatNumber(w.units_used, 1)}</td>
                <td>{formatNumber(w.rate_per_unit, 2)}</td>
                <td className="cell-strong">{formatKES(w.amount)}</td>
                <td className="row-actions">
                  <a href="#" title="Delete reading" onClick={(e) => { e.preventDefault(); deleteReading(w) }}>
                    <Icon name="trash" size={16} />
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
      )}

      {/* ---------- Payments ---------- */}

      {activeTab === 'payments' && (

      <div className="card table-card">
        <div className="table-card-head">
          <h3>Payments ({payments.length})</h3>
          <Link to={`/rent/new?tenant=${id}&back=profile`} className="btn btn-outline btn-sm">+ Record Payment</Link>
        </div>
        <div className="table-scroll"><table>
          <thead>
            <tr><th>Date</th><th>Amount</th><th>Method</th><th>Notes</th><th></th></tr>
          </thead>
          <tbody>
            {payments.length === 0 && (
              <tr><td colSpan={5} className="empty-state">No payments recorded yet.</td></tr>
            )}
            {payments.map((p) => (
              <tr key={p.id}>
                <td>{formatDate(p.payment_date)}</td>
                <td className="cell-strong">{formatKES(p.amount)}</td>
                <td>{p.method}</td>
                <td className="cell-muted">{p.notes}</td>
                <td className="row-actions">
                  <Link to={`/rent/${p.id}/edit?back=profile`} title="Edit payment"><Icon name="edit" size={16} /></Link>
                  <a href="#" title="Delete payment" onClick={(e) => { e.preventDefault(); deletePayment(p) }}>
                    <Icon name="trash" size={16} />
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
      )}
    </Layout>
  )
}
