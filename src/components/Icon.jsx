// Small inline-SVG icon set, ported 1:1 from the original PHP views.
const paths = {
  dashboard: 'M4 12l8-8 8 8M6 10v10h12V10',
  tenants: 'M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
  units: 'M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6',
  rent: 'M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6',
  water: 'M12 2s7 7.58 7 12a7 7 0 11-14 0c0-4.42 7-12 7-12z',
  garbage: 'M3 6h18M8 6V4h8v2m-9 0l1 14h8l1-14',
  maintenance: 'M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.1-3.1a5 5 0 01-6.6 6.6L5.4 21.5a2 2 0 01-2.8-2.8L11.9 9.9a5 5 0 016.6-6.6l-3.1 3.1z',
  reports: 'M3 3v18h18M7 15l4-6 3 3 5-8',
  edit: 'M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7|M18.5 2.5a2.1 2.1 0 013 3L12 15l-4 1 1-4 9.5-9.5z',
  trash: 'M3 6h18M8 6V4h8v2m-9 0l1 14h8l1-14',
  logout: 'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9',
  clock: 'M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z',
  check: 'M20 6L9 17l-5-5',
  circleClock: 'M12 7v5l3 3|M22 12a10 10 0 11-20 0 10 10 0 0120 0z',
}

export default function Icon({ name, size = 20 }) {
  const d = paths[name]
  if (!d) return null
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {d.split('|').map((seg, i) => <path key={i} d={seg} />)}
    </svg>
  )
}
