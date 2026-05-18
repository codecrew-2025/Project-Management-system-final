import { useEffect, useState } from 'react'

const AlertModal = ({ isOpen, onClose }) => {
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ priority: 'All', category: 'All', read: 'All' })

  useEffect(() => {
    if (!isOpen) return

    const fetchAlerts = async () => {
      try {
        setLoading(true)
        const res = await fetch('/api/alerts-all')
        if (res.ok) {
          setAlerts(await res.json())
        }
      } catch (e) {
        console.error('Failed to fetch alerts:', e)
      } finally {
        setLoading(false)
      }
    }

    fetchAlerts()
  }, [isOpen])

  if (!isOpen) return null

  const priorityOrder = { Critical: 0, High: 1, Medium: 2 }
  const filteredAlerts = alerts
    .filter(alert => {
      const priorityMatch = filters.priority === 'All' || alert.priority === filters.priority
      const categoryMatch = filters.category === 'All' || alert.category === filters.category
      const readMatch = filters.read === 'All' || 
        (filters.read === 'Unread' && !alert.read) ||
        (filters.read === 'Read' && alert.read)
      return priorityMatch && categoryMatch && readMatch
    })
    .sort((a, b) => {
      const aPriority = priorityOrder[a.priority] || 3
      const bPriority = priorityOrder[b.priority] || 3
      if (aPriority !== bPriority) return aPriority - bPriority
      return new Date(b.timestamp || 0) - new Date(a.timestamp || 0)
    })

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#fff',
          borderRadius: '12px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
          maxWidth: '800px',
          width: '90%',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h2 style={{ margin: '0 0 4px 0', fontSize: '1.25rem', fontWeight: 700 }}>
              🚨 All Alerts
            </h2>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#6b7280' }}>
              {filteredAlerts.length} alert{filteredAlerts.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: '#6b7280',
              padding: '0',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>

        {/* Filters */}
        <div
          style={{
            padding: '16px 20px',
            backgroundColor: '#f9fafb',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          <select
            value={filters.priority}
            onChange={(e) => setFilters({ ...filters, priority: e.target.value })}
            style={{
              padding: '6px 10px',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
              fontSize: '0.85rem',
              backgroundColor: '#fff',
              cursor: 'pointer',
            }}
          >
            {['All', 'Critical', 'High', 'Medium'].map(p => <option key={p} value={p}>{p}</option>)}
          </select>

          <select
            value={filters.category}
            onChange={(e) => setFilters({ ...filters, category: e.target.value })}
            style={{
              padding: '6px 10px',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
              fontSize: '0.85rem',
              backgroundColor: '#fff',
              cursor: 'pointer',
            }}
          >
            {['All', 'Overdue Projects', 'Deadline Risk', 'Low Progress', 'Frequent Delays'].map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <select
            value={filters.read}
            onChange={(e) => setFilters({ ...filters, read: e.target.value })}
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

        {/* Content */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 20px',
          }}
        >
          {loading && (
            <div style={{ textAlign: 'center', padding: '24px', color: '#6b7280' }}>
              Loading alerts...
            </div>
          )}

          {!loading && filteredAlerts.length === 0 && (
            <div style={{ textAlign: 'center', padding: '32px 24px', color: '#6b7280' }}>
              <div style={{ fontSize: '2rem', marginBottom: '8px' }}>✨</div>
              <div style={{ fontWeight: 600 }}>No alerts found</div>
            </div>
          )}

          {!loading && filteredAlerts.length > 0 && (
            <div style={{ display: 'grid', gap: '12px' }}>
              {filteredAlerts.map((alert, idx) => {
                const severity = alert.priority === 'Critical' ? '#dc2626' : alert.priority === 'High' ? '#f59e0b' : '#3b82f6'
                const bgColor = alert.priority === 'Critical' ? '#fef2f2' : alert.priority === 'High' ? '#fffbeb' : '#f0f9ff'

                return (
                  <div
                    key={alert.id || idx}
                    style={{
                      padding: '12px',
                      borderLeft: `4px solid ${severity}`,
                      backgroundColor: bgColor,
                      borderRadius: '6px',
                      fontSize: '0.9rem',
                    }}
                  >
                    <div style={{ fontWeight: 600, marginBottom: '4px', color: '#1f2937' }}>
                      {alert.title}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '6px' }}>
                      {alert.description}
                    </div>
                    <div style={{ display: 'flex', gap: '12px', fontSize: '0.75rem', color: '#9ca3af', flexWrap: 'wrap' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        backgroundColor: severity,
                        color: '#fff',
                        fontWeight: 600,
                      }}>
                        {alert.priority}
                      </span>
                      {alert.timestamp && <span>📅 {new Date(alert.timestamp).toLocaleDateString()}</span>}
                      {alert.category && <span>🏷️ {alert.category}</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 20px',
            borderTop: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '8px',
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
              backgroundColor: '#fff',
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontWeight: 500,
              color: '#374151',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export default AlertModal
