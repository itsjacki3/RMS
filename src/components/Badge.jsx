const COLORS = {
  green: 'badge-green',
  amber: 'badge-amber',
  red: 'badge-red',
  gray: 'badge-gray',
  blue: 'badge-blue',
}

export default function Badge({ color = 'gray', children }) {
  return <span className={`badge ${COLORS[color] || COLORS.gray}`}>{children}</span>
}
