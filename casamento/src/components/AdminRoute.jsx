import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAdminAuth } from '../context/adminAuth'
import { isSupabaseConfigured } from '../lib/supabase'

function AdminRoute() {
  const { session, isAdmin, loading } = useAdminAuth()
  const location = useLocation()

  if (!isSupabaseConfigured) return <Navigate to="/admin/login" replace state={{ from: location }} />
  if (loading) return <main className="admin-loading" aria-live="polite">Carregando área dos noivos…</main>
  if (!session) return <Navigate to="/admin/login" replace state={{ from: location }} />
  if (!isAdmin) return <Navigate to="/admin/login" replace state={{ accessDenied: true }} />

  return <Outlet />
}

export default AdminRoute
