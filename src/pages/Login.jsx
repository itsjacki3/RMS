import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { session, loading, signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  if (!loading && session) {
    const dest = location.state?.from?.pathname || '/'
    return <Navigate to={dest} replace />
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!email.trim() || !password) {
      setError('Please enter both email and password.')
      return
    }
    setSubmitting(true)
    const { error: signInError } = await signIn(email.trim(), password)
    setSubmitting(false)
    if (signInError) {
      setError('Incorrect email or password.')
      return
    }
    navigate('/', { replace: true })
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="brand">
          <div className="brand-mark">
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 11.5L12 4l9 7.5" /><path d="M5 10v10h14V10" />
            </svg>
          </div>
          <div className="brand-name">casa<span>.care</span></div>
        </div>
        <h2>Welcome back</h2>
        <p className="hint">Sign in to manage your rental property</p>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              name="email"
              placeholder="admin@casa.care"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              name="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="demo-note">
          Sign in with the staff account created for your property in Supabase Auth.
          <br />Ask your admin to add you under Authentication → Users if you don&rsquo;t have one yet.
        </div>
      </div>
    </div>
  )
}
