import { Routes, Route, Navigate } from 'react-router-dom'
import InstallBanner from '@/components/InstallBanner'
import Login from '@/routes/Login'
import AuthCallback from '@/routes/AuthCallback'
import Tracker from '@/routes/Tracker'
import AdminLayout from '@/routes/admin/AdminLayout'
import AdminOverview from '@/routes/admin/Overview'
import AdminLive from '@/routes/admin/Live'
import AdminEmployees from '@/routes/admin/Employees'
import AdminReview from '@/routes/admin/Review'
import AdminExport from '@/routes/admin/Export'
import AdminAudit from '@/routes/admin/Audit'
import AdminTrash from '@/routes/admin/Trash'
import { RequireAuth, RequireAdmin } from '@/auth/AuthContext'

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />

        <Route element={<RequireAuth />}>
          <Route path="/app" element={<Tracker />} />
          <Route element={<RequireAdmin />}>
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<AdminOverview />} />
              <Route path="live" element={<AdminLive />} />
              <Route path="employees" element={<AdminEmployees />} />
              <Route path="review" element={<AdminReview />} />
              <Route path="export" element={<AdminExport />} />
              <Route path="audit" element={<AdminAudit />} />
              <Route path="trash" element={<AdminTrash />} />
            </Route>
          </Route>
        </Route>

        <Route path="/" element={<Navigate to="/app" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <InstallBanner />
    </>
  )
}
