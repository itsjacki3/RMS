import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Chart from 'chart.js/auto'
import Layout from '../components/Layout'
import Icon from '../components/Icon'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { MONTHS_SHORT, formatKES } from '../lib/constants'

export default function Dashboard() {
  const { profile } = useAuth()
  const [stats, setStats] = useState(null)
  const [chartData, setChartData] = useState(null)
  const canvasRef = useRef(null)
  const chartRef = useRef(null)

  useEffect(() => {
    loadDashboard()
  }, [])

  useEffect(() => {
    if (!chartData || !canvasRef.current) return
    if (chartRef.current) chartRef.current.destroy()

    chartRef.current = new Chart(canvasRef.current, {
      type: 'bar',
      data: {
        labels: chartData.labels,
        datasets: [
          { label: 'Rent', data: chartData.rent, backgroundColor: '#23c7b7', borderRadius: 6, maxBarThickness: 22 },
          { label: 'Water & Garbage', data: chartData.bills, backgroundColor: '#ff7a50', borderRadius: 6, maxBarThickness: 22 },
        ],
      },
      options: {
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false } },
          y: { grid: { color: '#f0f2f7' }, ticks: { callback: (v) => 'KES ' + v } },
        },
      },
    })

    return () => chartRef.current?.destroy()
  }, [chartData])

  async function loadDashboard() {
    const [totalUnits, occupiedUnits, vacantUnits] = await Promise.all([
      supabase.from('units').select('*', { count: 'exact', head: true }),
      supabase.from('units').select('*', { count: 'exact', head: true }).eq('status', 'occupied'),
      supabase.from('units').select('*', { count: 'exact', head: true }).eq('status', 'vacant'),
    ])

    const [overdueRent, overdueWater, overdueGarbage] = await Promise.all([
      supabase.from('rent_payments').select('*', { count: 'exact', head: true }).eq('status', 'overdue'),
      supabase.from('water_bills').select('*', { count: 'exact', head: true }).eq('status', 'overdue'),
      supabase.from('garbage_bills').select('*', { count: 'exact', head: true }).eq('status', 'overdue'),
    ])

    const [openMaintenance, highPriorityOpen, activeTenants] = await Promise.all([
      supabase.from('maintenance_requests').select('*', { count: 'exact', head: true }).in('status', ['open', 'in_progress']),
      supabase.from('maintenance_requests').select('*', { count: 'exact', head: true }).in('status', ['open', 'in_progress']).eq('priority', 'high'),
      supabase.from('tenants').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    ])

    const now = new Date()
    const thisMonth = now.getMonth() + 1
    const thisYear = now.getFullYear()

    const { data: rentRows } = await supabase
      .from('rent_payments')
      .select('amount_paid')
      .eq('status', 'paid')
      .eq('period_month', thisMonth)
      .eq('period_year', thisYear)
    const rentThisMonth = (rentRows || []).reduce((sum, r) => sum + Number(r.amount_paid || 0), 0)

    setStats({
      totalUnits: totalUnits.count || 0,
      occupiedUnits: occupiedUnits.count || 0,
      vacantUnits: vacantUnits.count || 0,
      overdueCount: (overdueRent.count || 0) + (overdueWater.count || 0) + (overdueGarbage.count || 0),
      openMaintenance: openMaintenance.count || 0,
      highPriorityOpen: highPriorityOpen.count || 0,
      activeTenants: activeTenants.count || 0,
      rentThisMonth,
    })

    // Last 6 months revenue chart
    const labels = []
    const rentSeries = []
    const billsSeries = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const m = d.getMonth() + 1
      const y = d.getFullYear()
      labels.push(MONTHS_SHORT[m])

      const { data: rentData } = await supabase
        .from('rent_payments').select('amount_paid').eq('status', 'paid').eq('period_month', m).eq('period_year', y)
      rentSeries.push(Math.round((rentData || []).reduce((s, r) => s + Number(r.amount_paid || 0), 0)))

      const { data: waterData } = await supabase
        .from('water_bills').select('amount').eq('status', 'paid').eq('billing_month', m).eq('billing_year', y)
      const { data: garbageData } = await supabase
        .from('garbage_bills').select('amount').eq('status', 'paid').eq('billing_month', m).eq('billing_year', y)
      const waterSum = (waterData || []).reduce((s, r) => s + Number(r.amount || 0), 0)
      const garbageSum = (garbageData || []).reduce((s, r) => s + Number(r.amount || 0), 0)
      billsSeries.push(Math.round(waterSum + garbageSum))
    }

    setChartData({ labels, rent: rentSeries, bills: billsSeries })
  }

  return (
    <Layout title="Dashboard" subtitle={`Welcome back, ${profile?.full_name || 'there'}! Here's what's happening with your property.`}>
      {!stats ? (
        <div className="empty-state">Loading dashboard…</div>
      ) : (
        <>
          <div className="stat-grid">
            <div className="card stat-card">
              <div className="stat-icon coral"><Icon name="units" /></div>
              <div><div className="stat-label">Total Units</div><div className="stat-value">{stats.totalUnits}</div></div>
            </div>
            <div className="card stat-card">
              <div className="stat-icon violet"><Icon name="check" /></div>
              <div><div className="stat-label">Occupied Units</div><div className="stat-value">{stats.occupiedUnits}</div></div>
            </div>
            <div className="card stat-card">
              <div className="stat-icon blue"><Icon name="circleClock" /></div>
              <div><div className="stat-label">Vacant Units</div><div className="stat-value">{stats.vacantUnits}</div></div>
            </div>
            <div className="card stat-card">
              <div className="stat-icon pink"><Icon name="clock" /></div>
              <div><div className="stat-label">Overdue Bills</div><div className="stat-value">{stats.overdueCount}</div></div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 18 }}>
            <div className="stat-icon amber"><Icon name="maintenance" /></div>
            <div>
              <div className="stat-label">Open Maintenance Requests</div>
              <div className="stat-value">{stats.openMaintenance}</div>
              <div className="stat-sub">{stats.highPriorityOpen} marked high priority</div>
            </div>
            <Link to="/maintenance" className="btn btn-outline" style={{ marginLeft: 'auto' }}>View all</Link>
          </div>

          <div className="dash-row">
            <div className="card mini-stat">
              <div className="stat-icon violet"><Icon name="tenants" /></div>
              <div className="stat-label">Active Tenants</div>
              <div className="stat-value">{stats.activeTenants}</div>
            </div>

            <div className="card mini-stat">
              <div className="stat-icon teal"><Icon name="rent" /></div>
              <div className="stat-label">Rent Collected This Month</div>
              <div className="stat-value">{formatKES(stats.rentThisMonth)}</div>
            </div>

            <div className="card chart-card">
              <div className="chart-head">
                <div>
                  <h3>Revenue</h3>
                  <div className="legend">
                    <span><span className="dot teal"></span>Rent</span>
                    <span><span className="dot coral"></span>Water &amp; Garbage</span>
                  </div>
                </div>
              </div>
              <canvas ref={canvasRef} height="140"></canvas>
            </div>
          </div>
        </>
      )}
    </Layout>
  )
}
