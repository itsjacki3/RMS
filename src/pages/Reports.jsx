import { useEffect, useState } from 'react'
import Layout from '../components/Layout'
import Icon from '../components/Icon'
import { supabase } from '../supabaseClient'
import { MONTHS_SHORT, formatKES } from '../lib/constants'

export default function Reports() {
  const [data, setData] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    const { count: totalUnits } = await supabase.from('units').select('*', { count: 'exact', head: true })
    const { count: occupiedUnits } = await supabase.from('units').select('*', { count: 'exact', head: true }).eq('status', 'occupied')
    const occupancyRate = totalUnits ? Math.round((occupiedUnits / totalUnits) * 100) : 0

    const now = new Date()
    const rows = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const m = d.getMonth() + 1
      const y = d.getFullYear()

      const { data: rentData } = await supabase.from('rent_payments').select('amount_paid').eq('status', 'paid').eq('period_month', m).eq('period_year', y)
      const { data: waterData } = await supabase.from('water_bills').select('amount').eq('status', 'paid').eq('billing_month', m).eq('billing_year', y)
      const { data: garbageData } = await supabase.from('garbage_bills').select('amount').eq('status', 'paid').eq('billing_month', m).eq('billing_year', y)

      rows.push({
        label: `${MONTHS_SHORT[m]} ${y}`,
        rent: (rentData || []).reduce((s, r) => s + Number(r.amount_paid || 0), 0),
        water: (waterData || []).reduce((s, r) => s + Number(r.amount || 0), 0),
        garbage: (garbageData || []).reduce((s, r) => s + Number(r.amount || 0), 0),
      })
    }

    const { count: overdueRent } = await supabase.from('rent_payments').select('*', { count: 'exact', head: true }).eq('status', 'overdue')
    const { count: overdueWater } = await supabase.from('water_bills').select('*', { count: 'exact', head: true }).eq('status', 'overdue')
    const { count: overdueGarbage } = await supabase.from('garbage_bills').select('*', { count: 'exact', head: true }).eq('status', 'overdue')
    const { count: openMaintenance } = await supabase.from('maintenance_requests').select('*', { count: 'exact', head: true }).in('status', ['open', 'in_progress'])

    setData({
      occupancyRate,
      overdueRent: overdueRent || 0,
      overdueWater: overdueWater || 0,
      overdueGarbage: overdueGarbage || 0,
      openMaintenance: openMaintenance || 0,
      rows,
    })
  }

  return (
    <Layout title="Reports" subtitle="Monthly collections and occupancy overview">
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
              <div><div className="stat-label">Overdue Rent</div><div className="stat-value">{data.overdueRent}</div></div>
            </div>
            <div className="card stat-card">
              <div className="stat-icon blue"><Icon name="water" /></div>
              <div><div className="stat-label">Overdue Water/Garbage</div><div className="stat-value">{data.overdueWater + data.overdueGarbage}</div></div>
            </div>
            <div className="card stat-card">
              <div className="stat-icon amber"><Icon name="maintenance" /></div>
              <div><div className="stat-label">Open Maintenance</div><div className="stat-value">{data.openMaintenance}</div></div>
            </div>
          </div>

          <div className="card table-card">
            <div className="table-card-head"><h3>Monthly Collections (last 6 months)</h3></div>
            <table>
              <thead>
                <tr><th>Month</th><th>Rent Collected</th><th>Water Collected</th><th>Garbage Collected</th><th>Total</th></tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.label}>
                    <td className="cell-strong">{r.label}</td>
                    <td>{formatKES(r.rent)}</td>
                    <td>{formatKES(r.water)}</td>
                    <td>{formatKES(r.garbage)}</td>
                    <td className="cell-strong">{formatKES(r.rent + r.water + r.garbage)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Layout>
  )
}
