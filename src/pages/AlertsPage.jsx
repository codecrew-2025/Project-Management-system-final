import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import '../assets/dashboard.css'

function useAllAlerts() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchAlerts = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/alerts-all')
      if (res.ok) {
        setData(await res.json())
        setError(null)
      } else {
        setError(`Failed to load alerts: ${res.status}`)
      }
    } catch (e) {
      console.error('alerts-all fetch error:', e)
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAlerts() }, [fetchAlerts])
  return [data, loading, error, fetchAlerts]
}

const AlertPriorityBadge = ({ priority }) => {
  const colors = {
    Critical: { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
    High: { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' },
    Medium: { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
  }
  const style = colors[priority] || colors.Medium
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '4px 10px',
        borderRadius: '6px',
        fontSize: '0.75rem',
        fontWeight: 600,
        backgroundColor: style.bg,
        color: style.text,
        border: `1px solid ${style.border}`,
      }}
    >
      {priority}
    </span>
  )
}

const AlertCard = ({ alert }) => {
  const [expanded, setExpanded] = useState(false)
  
  const tonerClass = alert.priority?.toLowerCase() || 'medium'
  const severityMap = {
    critical: 3,
    high: 2,
    medium: 1,
  }
  const severity = severityMap[tonerClass] || 0

  return (
    <article
      style={{
        padding: '16px',
        borderLeft: `4px solid ${severity === 3 ? '#dc2626' : severity === 2 ? '#f59e0b' : '#3b82f6'}`,
        backgroundColor: severity === 3 ? '#fef2f2' : severity === 2 ? '#fffbeb' : '#f0f9ff',
        borderRadius: '8px',
        marginBottom: '12px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
      }}
      onClick={() => setExpanded(!expanded)}
      onMouseEnter={(e) => e.currentTarget.style.transform = 'translateX(4px)'}
      onMouseLeave={(e) => e.currentTarget.style.transform = 'translateX(0)'}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
        <div style={{ flex: 1 }}>
          <h4 style={{ margin: '0 0 6px 0', fontSize: '0.95rem', fontWeight: 600, color: '#1f2937' }}>
            {alert.title}
          </h4>
          <p style={{ margin: '0 0 8px 0', fontSize: '0.85rem', color: '#6b7280', lineHeight: 1.4 }}>
            {alert.description}
          </p>
          <div style={{ display: 'flex', gap: '12px', fontSize: '0.8rem', color: '#9ca3af', flexWrap: 'wrap' }}>
            {alert.timestamp && (
              <span>
                📅 {new Date(alert.timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}
              </span>
            )}
            {alert.affectedCount && <span>👥 {alert.affectedCount} item{alert.affectedCount !== 1 ? 's' : ''}</span>}
            {alert.category && <span>🏷️ {alert.category}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
          <AlertPriorityBadge priority={alert.priority} />
          <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
            {expanded ? '▼' : '▶'}
          </span>
        </div>
      </div>

      {expanded && alert.details && (
        <div style={{
          marginTop: '12px',
          paddingTop: '12px',
          borderTop: `1px solid ${severity === 3 ? '#fecaca' : severity === 2 ? '#fde68a' : '#bfdbfe'}`,
        }}>
          <div style={{ fontSize: '0.8rem', color: '#6b7280', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
            {alert.details}
          </div>
        </div>
      )}
    </article>
  )
}

const AlertFilter = ({ filters, onFilterChange }) => {
  const priorities = ['All', 'Critical', 'High', 'Medium']
  const categories = ['All', 'Overdue Projects', 'Deadline Risk', 'Low Progress', 'Frequent Delays']

  return (
    <div style={{
      display: 'flex',
      gap: '16px',
      flexWrap: 'wrap',
      padding: '16px',
      backgroundColor: '#f9fafb',
      borderRadius: '8px',
      marginBottom: '16px',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#374151' }}>Priority</label>
        <select
          value={filters.priority}
          onChange={(e) => onFilterChange({ ...filters, priority: e.target.value })}
          style={{
            padding: '6px 10px',
            borderRadius: '6px',
            border: '1px solid #d1d5db',
            fontSize: '0.85rem',
            backgroundColor: '#fff',
            cursor: 'pointer',
          }}
        >
          {priorities.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#374151' }}>Category</label>
        <select
          value={filters.category}
          onChange={(e) => onFilterChange({ ...filters, category: e.target.value })}
          style={{
            padding: '6px 10px',
            borderRadius: '6px',
            border: '1px solid #d1d5db',
            fontSize: '0.85rem',
            backgroundColor: '#fff',
            cursor: 'pointer',
          }}
        >
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#374151' }}>Status</label>
        <select
          value={filters.read}
          onChange={(e) => onFilterChange({ ...filters, read: e.target.value })}
          style={{
            padding: '6px 10px',
            borderRadius: '6px',
            border: '1px solid #d1d5db',
            fontSize: '0.85rem',
            backgroundColor: '#fff',
            cursor: 'pointer',
          }}
        >
          <option value="All">All</option>
          <option value="Unread">Unread Only</option>
          <option value="Read">Read Only</option>
        </select>
      </div>
    </div>
  )
}

export default function AlertsPage() {
  const navigate = useNavigate()
  const user = JSON.parse(sessionStorage.getItem('pf_user') || localStorage.getItem('pf_user') || '{}')
  const role = sessionStorage.getItem('role') || localStorage.getItem('role') || 'director'
  
  const [allAlerts, loading, error, refetch] = useAllAlerts()
  const [filters, setFilters] = useState({ priority: 'All', category: 'All', read: 'All' })
  const [activeNav, setActiveNav] = useState(0)

  const roleNavItems = {
    director: [
      { label: 'Overview' },
      { label: 'All Projects' },
      { label: 'Alerts' },
      { label: 'Teams' },
      { label: 'Analytics' },
    ],
    coordinator: [
      { label: 'Overview' },
      { label: 'My Projects' },
      { label: 'Alerts' },
      { label: 'Team members' },
      { label: 'Teams' },
    ],
    student: [
      { label: 'Dashboard' },
      { label: 'My Tasks' },
      { label: 'Alerts' },
      { label: 'Submissions' },
    ],
  }

  const navItems = roleNavItems[role] || roleNavItems.director

  const handleNavChange = (index) => {
    setActiveNav(index)
    const label = navItems[index]?.label
    if (label === 'Overview' || label === 'Dashboard') {
      navigate(role === 'director' ? '/director' : role === 'coordinator' ? '/coordinator' : '/student')
    }
  }

  // Filter alerts
  const filteredAlerts = allAlerts ? allAlerts.filter(alert => {
    const priorityMatch = filters.priority === 'All' || alert.priority === filters.priority
    const categoryMatch = filters.category === 'All' || alert.category === filters.category
    const readMatch = filters.read === 'All' || 
      (filters.read === 'Unread' && !alert.read) ||
      (filters.read === 'Read' && alert.read)
    return priorityMatch && categoryMatch && readMatch
  }) : []

  // Sort by priority (Critical > High > Medium) and by timestamp
  const sortedAlerts = [...filteredAlerts].sort((a, b) => {
    const priorityOrder = { Critical: 0, High: 1, Medium: 2 }
    const aOrder = priorityOrder[a.priority] || 3
    const bOrder = priorityOrder[b.priority] || 3
    if (aOrder !== bOrder) return aOrder - bOrder
    return new Date(b.timestamp || 0) - new Date(a.timestamp || 0)
  })

  return (
    <div style={{ display: 'flex', height: '100vh', backgroundColor: '#f3f4f6' }}>
      <Sidebar
        role={role}
        userName={user.name || 'User'}
        userInitials={user.name?.split(' ').map(n => n[0]).join('').toUpperCase() || 'U'}
        navItems={navItems}
        activeNav={activeNav}
        onNavChange={handleNavChange}
      />

      <main style={{
        flex: 1,
        overflowY: 'auto',
        padding: '24px',
        maxWidth: '1200px',
        margin: '0 auto',
        width: '100%',
      }}>
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ margin: '0 0 8px 0', fontSize: '2rem', fontWeight: 700, color: '#1f2937' }}>
            🚨 All Alerts
          </h1>
          <p style={{ margin: 0, fontSize: '0.95rem', color: '#6b7280' }}>
            {sortedAlerts.length} alert{sortedAlerts.length !== 1 ? 's' : ''} found
          </p>
        </div>

        <AlertFilter filters={filters} onFilterChange={setFilters} />

        {loading && (
          <div style={{
            textAlign: 'center',
            padding: '48px 24px',
            color: '#6b7280',
          }}>
            <div style={{ fontSize: '1rem', marginBottom: '8px' }}>⏳ Loading alerts...</div>
          </div>
        )}

        {error && (
          <div style={{
            padding: '16px',
            backgroundColor: '#fee2e2',
            color: '#991b1b',
            borderRadius: '8px',
            marginBottom: '16px',
            border: '1px solid #fca5a5',
          }}>
            ⚠️ {error}
            <button
              onClick={refetch}
              style={{
                marginLeft: '12px',
                padding: '6px 12px',
                backgroundColor: '#991b1b',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.8rem',
              }}
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && sortedAlerts.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: '48px 24px',
            color: '#6b7280',
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '12px' }}>✨</div>
            <div style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '8px' }}>No alerts found</div>
            <div style={{ fontSize: '0.9rem' }}>All systems are running smoothly!</div>
          </div>
        )}

        {!loading && sortedAlerts.length > 0 && (
          <div style={{
            display: 'grid',
            gap: '12px',
          }}>
            {sortedAlerts.map((alert, idx) => (
              <AlertCard key={alert.id || idx} alert={alert} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
