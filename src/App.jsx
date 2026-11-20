import { Routes, Route } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Units from './pages/Units'
import UnitForm from './pages/UnitForm'
import Tenants from './pages/Tenants'
import TenantForm from './pages/TenantForm'
import TenantProfile from './pages/TenantProfile'
import Rent from './pages/Rent'
import RentForm from './pages/RentForm'
import Maintenance from './pages/Maintenance'
import MaintenanceForm from './pages/MaintenanceForm'
import Reports from './pages/Reports'
import Settings from './pages/Settings'

function withAuth(Component) {
  return (
    <ProtectedRoute>
      <Component />
    </ProtectedRoute>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route path="/" element={withAuth(Dashboard)} />

      <Route path="/units" element={withAuth(Units)} />
      <Route path="/units/new" element={withAuth(UnitForm)} />
      <Route path="/units/:id/edit" element={withAuth(UnitForm)} />

      <Route path="/tenants" element={withAuth(Tenants)} />
      <Route path="/tenants/new" element={withAuth(TenantForm)} />
      <Route path="/tenants/:id" element={withAuth(TenantProfile)} />
      <Route path="/tenants/:id/edit" element={withAuth(TenantForm)} />

      <Route path="/rent" element={withAuth(Rent)} />
      <Route path="/rent/new" element={withAuth(RentForm)} />
      <Route path="/rent/:id/edit" element={withAuth(RentForm)} />

      <Route path="/maintenance" element={withAuth(Maintenance)} />
      <Route path="/maintenance/new" element={withAuth(MaintenanceForm)} />

      <Route path="/reports" element={withAuth(Reports)} />
      <Route path="/settings" element={withAuth(Settings)} />
    </Routes>
  )
}
