import { useEffect, useRef } from 'react'
import Chart from 'chart.js/auto'

/**
 * Small wrapper around Chart.js.
 *   <BarChart labels={['Jan','Feb']} datasets={[{ label:'Billed', data:[1,2], color:'#ff7a50' }]} money />
 * Pass `type="line"` for a line chart.
 */
export default function BarChart({ labels, datasets, money = false, type = 'bar' }) {
  const canvasRef = useRef(null)
  const signature = JSON.stringify([labels, datasets, money, type])

  useEffect(() => {
    if (!canvasRef.current) return undefined
    const chart = new Chart(canvasRef.current, {
      type,
      data: {
        labels,
        datasets: datasets.map((d) => ({
          label: d.label,
          data: d.data,
          backgroundColor: d.color,
          borderColor: d.color,
          borderRadius: type === 'bar' ? 6 : 0,
          maxBarThickness: 26,
          tension: 0.3,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: datasets.length > 1, position: 'bottom' } },
        scales: {
          x: { grid: { display: false } },
          y: {
            beginAtZero: true,
            grid: { color: '#f0f2f7' },
            ticks: { precision: 0, callback: (v) => (money ? 'KES ' + Number(v).toLocaleString('en-KE') : v) },
          },
        },
      },
    })
    return () => chart.destroy()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature])

  return <canvas ref={canvasRef} />
}
