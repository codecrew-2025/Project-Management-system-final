import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import LayoutMenu from '../components/LayoutMenu'
import { getNotifications, markNotificationsRead } from '../lib/api'
import '../assets/dashboard.css'

function getRolePath(role) {
  const normalized = String(role || '').trim().toLowerCase()
  if (normalized === 'director') return '/director'
  if (normalized === 'coordinator') return '/coordinator'
  if (normalized === 'student') return '/student'
  return '/'
}

export default function NotificationsPage() {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)

  const role = String(user?.role || '').toLowerCase()

  const notificationContext = useMemo(() => ({
    ...(role === 'coordinator' ? {
      coordinator_id: user?.id || '',
      coordinator_email: user?.email || '',
    } : {}),
    ...(role === 'student' ? {
      student_id: user?.id || '',
      student_email: user?.email || '',
    } : {}),
  }), [role, user?.email, user?.id])

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('pf_user') || localStorage.getItem('pf_user')
      setUser(raw ? JSON.parse(raw) : null)
    } catch {
      setUser(null)
    }
  }, [])

  useEffect(() => {
    if (!role) return

    let alive = true
    const fetchNotifications = async () => {
      setLoading(true)
      try {
        const data = await getNotifications(role, notificationContext)
        if (!alive) return
        setNotifications(Array.isArray(data) ? data : [])
        await markNotificationsRead(role, notificationContext)
      } catch {
        if (alive) setNotifications([])
      } finally {
        if (alive) setLoading(false)
      }
    }

    fetchNotifications()
    return () => { alive = false }
  }, [notificationContext, user])

  return (
    <div data-role="notifications" style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar
        mode="expanded"
        role={role || 'director'}
        userName={user?.name || 'User'}
        userInitials={(user?.name || 'U').charAt(0).toUpperCase()}
        userSub={user?.email || ''}
        navItems={[]}
        activeNav={-1}
        onNavChange={() => {}}
        onToggleMode={() => {}}
        notificationContext={notificationContext}
      />

      <main className="main-content">
        <header className="topbar">
          <div>
            <button className="btn-ghost" onClick={() => navigate(getRolePath(user?.role))} style={{ marginBottom: 6 }}>
              ← Back to Dashboard
            </button>
            <h1 className="page-title">Notifications</h1>
            <p className="page-sub">All alerts, updates, and reminders in one place</p>
          </div>
          <div className="topbar-actions">
            <LayoutMenu sidebarMode="expanded" setSidebarMode={() => {}} />
          </div>
        </header>

        <div className="card">
          <div className="card-head">
            <h2 className="card-title">Recent Notifications</h2>
          </div>

          {loading ? (
            <div style={{ color: 'var(--text-muted)', padding: '20px 0' }}>Loading notifications...</div>
          ) : notifications.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', padding: '20px 0' }}>No notifications found.</div>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {notifications.map((notification, index) => (
                <div
                  key={notification.id || index}
                  style={{
                    display: 'flex',
                    gap: 14,
                    alignItems: 'flex-start',
                    padding: 16,
                    border: '1px solid var(--royal-border)',
                    borderRadius: 12,
                    background: notification.read ? '#fff' : '#eef6ff',
                    boxShadow: 'var(--shadow-sm)',
                  }}
                >
                  <div style={{ fontSize: '1.3rem', lineHeight: 1 }}>{notification.icon || '🔔'}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                      <div style={{ fontWeight: 800, color: 'var(--text-head)' }}>{notification.title || 'Notification'}</div>
                      {!notification.read && <span className="badge badge-amber">Unread</span>}
                    </div>
                    <div style={{ color: 'var(--text-body)', marginTop: 6, lineHeight: 1.5 }}>{notification.body || ''}</div>
                    <div style={{ color: 'var(--text-hint)', fontSize: '0.75rem', marginTop: 8 }}>{notification.time || ''}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}