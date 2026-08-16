export default function Alert({ type = 'success', children }) {
  if (!children) return null
  return <div className={`alert alert-${type}`}>{children}</div>
}
