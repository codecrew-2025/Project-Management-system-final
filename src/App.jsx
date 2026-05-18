import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import DirectorDashboard from './pages/DirectorDashboard'
import CoordinatorDashboard from './pages/CoordinatorDashboard'
import StudentDashboard from './pages/StudentDashboard'
import NotificationsPage from './pages/NotificationsPage'
import ReportsPage from './pages/ReportsPage'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'

function getStoredUser() {
  try {
    const raw = sessionStorage.getItem('pf_user') || localStorage.getItem('pf_user')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function getRolePath(role) {
  const normalizedRole = String(role || '').trim().toLowerCase()
  if (normalizedRole === 'director') return '/director'
  if (normalizedRole === 'coordinator') return '/coordinator'
  if (normalizedRole === 'student') return '/student'
  return '/'
}

function ProtectedRoute({ children, allowedRoles = [] }) {
  const user = getStoredUser()
  if (!user) return <Navigate to="/" replace />

  if (allowedRoles.length > 0 && !allowedRoles.includes(String(user.role || '').toLowerCase())) {
    return <Navigate to={getRolePath(user.role)} replace />
  }

  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/director" element={<ProtectedRoute allowedRoles={['director']}><DirectorDashboard /></ProtectedRoute>} />
        <Route path="/coordinator" element={<ProtectedRoute allowedRoles={['coordinator']}><CoordinatorDashboard /></ProtectedRoute>} />
        <Route path="/student" element={<ProtectedRoute allowedRoles={['student']}><StudentDashboard /></ProtectedRoute>} />
        <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
        <Route path="/reports" element={<ProtectedRoute allowedRoles={['director','coordinator']}><ReportsPage /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
