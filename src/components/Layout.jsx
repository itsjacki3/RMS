import { useEffect, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Icon from './Icon'

const NAV = [
  ['/', 'Dashboard', 'dashboard'],
  ['/tenants', 'Tenants', 'tenants'],
  ['/units', 'Units', 'units'],
  ['/rent', 'Rent Collection', 'rent'],
  ['/maintenance', 'Maintenance', 'maintenance'],
  ['/reports', 'Reports', 'reports'],
  ['/settings', 'Settings', 'settings'],
]

export default function Layout({ title, subtitle, actions, children }) {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [navOpen, setNavOpen] = useState(false)
  const displayName = profile?.full_name || 'Administrator'

  // Close the drawer on navigation and lock body scroll while it is open
  useEffect(() => { setNavOpen(false) }, [location.pathname])
  useEffect(() => {
    document.body.classList.toggle('nav-open', navOpen)
    return () => document.body.classList.remove('nav-open')
  }, [navOpen])

  async function handleLogout() {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="app-shell">
      <header className="mobile-bar">
        <button className="menu-btn" aria-label="Open menu" aria-expanded={navOpen} onClick={() => setNavOpen(true)}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        </button>
        <div className="brand-name">casa<span>.care</span></div>
      </header>
      {navOpen && <div className="sidebar-backdrop" onClick={() => setNavOpen(false)} />}

      <aside className={'sidebar' + (navOpen ? ' open' : '')}>
        <div className="brand">
          <div className="brand-mark">
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 11.5L12 4l9 7.5" /><path d="M5 10v10h14V10" />
            </svg>
          </div>
          <div className="brand-name">casa<span>.care</span></div>
        </div>

        <div className="nav-group-label">Main</div>
        <ul>
          {NAV.map(([to, label, icon]) => (
            <li key={to}>
              <NavLink to={to} end={to === '/'} className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
                <Icon name={icon} />
                <span>{label}</span>
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="sidebar-footer">
          <div className="avatar">{displayName.charAt(0).toUpperCase()}</div>
          <div>
            <div className="who">{displayName}</div>
            <div className="role">{(profile?.role || 'manager').replace(/^\w/, (c) => c.toUpperCase())}</div>
          </div>
          <button className="logout-btn" title="Log out" onClick={handleLogout}>
            <Icon name="logout" size={18} />
          </button>
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <div>
            <h1>{title}</h1>
            {subtitle && <div className="subtitle">{subtitle}</div>}
          </div>
          {actions}
        </div>

        {children}

        <footer className="page-footer">&copy; {new Date().getFullYear()} casa.care Rental Management</footer>
      </main>
    </div>
  )
}
