import { useEffect, useState } from 'react'
import Layout from '../components/Layout'
import Icon from '../components/Icon'
import { supabase } from '../supabaseClient'
import { ensureCharges } from '../lib/api'
import { formatKES, lastMonths, sum } from '../lib/constants'

export default function Reports() {
  const [data, setData] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    await ensureCharges()
    const months = lastMonths(6)
    const start = `${months[0].key}-01`
    const count = (q) => q.then((r) => r.count || 0)

    const [totalUnits, occupiedUnits, openMaintenance, balances, ledger, payments] = await Promise.all([
      count(supabase.from('units').select('*', { count: 'exact', head: true })),
      count(supabase.from('units').select('*', { count: 'exact', head: true }).eq('status', 'occupied')),
      count(supabase.from('maintenance_requests').select('*', { count: 'exact', head: true }).in('status', ['open', 'in_progress'])),
      supabase.from('tenant_balances').select('months_overdue, overdue_amount'),
      supabase.from('tenant_ledger').select('period_start, rent_amount, water_amount, garbage_amount, total_charge').gte('period_start', start),
      supabase.from('payments').select('amount, payment_date').gte('payment_date', start),
    ])

    const rows = months.map((m) => {
      const l = (ledger.data || []).filter((r) => r.period_start.startsWith(m.key))
      const p = (payments.data || []).filter((r) => r.payment_date.startsWith(m.key))
      return {
        label: `${m.label} ${m.year}`,
        rent: sum(l, 'rent_amount'),
        water: sum(l, 'water_amount'),
        garbage: sum(l, 'garbage_amount'),
        billed: sum(l, 'total_charge'),
        collected: sum(p, 'amount'),
      }
    })

    const overdue = (balances.data || []).filter((b) => Number(b.months_overdue) > 0)
    setData({
      occupancyRate: totalUnits ? Math.round((occupiedUnits / totalUnits) * 100) : 0,
      overdueTenants: overdue.length,
      overdueAmount: sum(overdue, 'overdue_amount'),
      openMaintenance,
      rows,
    })
  }

  return (
    <Layout title="Reports" subtitle="Monthly billing, collections and occupancy overview">
      {!data ? (
        <div className="empty-state">Loading report…</div>
      ) : (
        <>
          <div className="stat-grid">
            <div className="card stat-card">
              <div className="stat-icon coral"><Icon name="units" /></div>
              <div><div className="stat-label">Occupancy Rate</div><div className="stat-value">{data.occupancyRate}%</div></div>
            </div>
            <div className="card stat-card">
              <div className="stat-icon pink"><Icon name="clock" /></div>
              <div><div className="stat-label">Overdue Tenants</div><div className="stat-value">{data.overdueTenants}</div></div>
            </div>
            <div className="card stat-card">
              <div className="stat-icon blue"><Icon name="rent" /></div>
              <div><div className="stat-label">Overdue Amount</div><div className="stat-value">{formatKES(data.overdueAmount)}</div></div>
            </div>
            <div className="card stat-card">
              <div className="stat-icon amber"><Icon name="maintenance" /></div>
              <div><div className="stat-label">Open Maintenance</div><div className="stat-value">{data.openMaintenance}</div></div>
            </div>
          </div>

          <div className="card table-card">
            <div className="table-card-head"><h3>Monthly Billing &amp; Collections (last 6 months)</h3></div>
            <div className="table-scroll"><table>
              <thead>
                <tr><th>Month</th><th>Rent Billed</th><th>Water Billed</th><th>Garbage Billed</th><th>Total Billed</th><th>Collected</th></tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.label}>
                    <td className="cell-strong">{r.label}</td>
                    <td>{formatKES(r.rent)}</td>
                    <td>{formatKES(r.water)}</td>
                    <td>{formatKES(r.garbage)}</td>
                    <td className="cell-strong">{formatKES(r.billed)}</td>
                    <td className="cell-strong">{formatKES(r.collected)}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>
        </>
      )}
    </Layout>
  )
}
