import { useMemo, useState } from 'react'

const CATEGORY_LABELS = {
  'overdue-project': 'Overdue Projects',
  'low-progress-project': 'Low Progress',
  'deadline-risk-project': 'Deadline Risk',
  'frequent-delay': 'Frequent Delays',
}

function normalizeAlert(alert, index) {
  const title = alert?.title || alert?.alertType || 'Alert'
  const description = alert?.description || alert?.message || ''
  const category = CATEGORY_LABELS[alert?.category] || alert?.category || 'Other'
  const timestamp = alert?.timestamp || alert?.created_at || null
  const priority = alert?.priority || 'Medium'
  const details = alert?.details || [
    alert?.project_title ? `Project: ${alert.project_title}` : '',
    alert?.student_name ? `Team member: ${alert.student_name}` : '',
    alert?.progress_value !== undefined ? `Progress: ${alert.progress_value}%` : '',
    alert?.deadline ? `Deadline: ${alert.deadline}` : '',
    alert?.days_left !== null && alert?.days_left !== undefined ? `Days Left: ${alert.days_left}` : '',
  ].filter(Boolean).join('\n')

  return {
    id: alert?.id || `alert-${index}`,
    title,
    description,
    category,
    timestamp,
    priority,
    details,
  }
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
        padding: '14px',
        borderLeft: `4px solid ${severity === 3 ? '#dc2626' : severity === 2 ? '#f59e0b' : '#3b82f6'}`,
        backgroundColor: severity === 3 ? '#fef2f2' : severity === 2 ? '#fffbeb' : '#f0f9ff',
        borderRadius: '8px',
        marginBottom: '10px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
      }}
      onClick={() => setExpanded(!expanded)}
      onMouseEnter={(e) => e.currentTarget.style.transform = 'translateX(4px)'}
      onMouseLeave={(e) => e.currentTarget.style.transform = 'translateX(0)'}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
        <div style={{ flex: 1 }}>
          <h4 style={{ margin: '0 0 4px 0', fontSize: '0.9rem', fontWeight: 600, color: '#1f2937' }}>
            {alert.title}
          </h4>
          <p style={{ margin: '0 0 6px 0', fontSize: '0.8rem', color: '#6b7280', lineHeight: 1.4 }}>
            {alert.description}
          </p>
          <div style={{ display: 'flex', gap: '10px', fontSize: '0.75rem', color: '#9ca3af', flexWrap: 'wrap' }}>
            {alert.timestamp && (
              <span>
                📅 {new Date(alert.timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}
              </span>
            )}
            {alert.category && <span>🏷️ {alert.category}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
          <AlertPriorityBadge priority={alert.priority} />
        </div>
      </div>

      {expanded && alert.details && (
        <div style={{
          marginTop: '10px',
          paddingTop: '10px',
          borderTop: `1px solid ${severity === 3 ? '#fecaca' : severity === 2 ? '#fde68a' : '#bfdbfe'}`,
        }}>
          <div style={{ fontSize: '0.75rem', color: '#6b7280', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
            {alert.details}
          </div>
        </div>
      )}
    </article>
  )
}

export default function CoordinatorAlertsPanel({ alerts = [], loading = false, errorMessage = '' }) {
  const [filters, setFilters] = useState({ priority: 'All', category: 'All' })

  const allAlerts = useMemo(() => (Array.isArray(alerts) ? alerts : []).map(normalizeAlert), [alerts])

  const filteredAlerts = allAlerts
    .filter(alert => {
      const priorityMatch = filters.priority === 'All' || alert.priority === filters.priority
      const categoryMatch = filters.category === 'All' || alert.category === filters.category
      return priorityMatch && categoryMatch
    })
    .sort((a, b) => {
      const priorityOrder = { Critical: 0, High: 1, Medium: 2 }
      const aOrder = priorityOrder[a.priority] || 3
      const bOrder = priorityOrder[b.priority] || 3
      if (aOrder !== bOrder) return aOrder - bOrder
      return new Date(b.timestamp || 0) - new Date(a.timestamp || 0)
    })

  return (
    <div style={{ padding: '20px' }}>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ margin: '0 0 4px 0', fontSize: '1.5rem', fontWeight: 700 }}>🚨 Alerts</h2>
        <p style={{ margin: 0, fontSize: '0.9rem', color: '#6b7280' }}>
          {filteredAlerts.length} alert{filteredAlerts.length !== 1 ? 's' : ''} found
        </p>
      </div>

      <div style={{
        display: 'flex',
        gap: '12px',
        marginBottom: '16px',
        flexWrap: 'wrap',
      }}>
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
          {['All', 'Critical', 'High', 'Medium'].map(p => <option key={p} value={p}>Priority: {p}</option>)}
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
          {['All', 'Overdue Projects', 'Deadline Risk', 'Low Progress', 'Frequent Delays'].map(c => <option key={c} value={c}>Category: {c}</option>)}
        </select>
      </div>

      {loading && <div style={{ textAlign: 'center', padding: '20px', color: '#6b7280' }}>⏳ Loading alerts...</div>}

      {Boolean(errorMessage) && (
        <div style={{
          padding: '12px',
          backgroundColor: '#fee2e2',
          color: '#991b1b',
          borderRadius: '6px',
          marginBottom: '12px',
          fontSize: '0.9rem',
          border: '1px solid #fca5a5',
        }}>
          ⚠️ {errorMessage}
        </div>
      )}

      {!loading && filteredAlerts.length === 0 && (
        <div style={{ textAlign: 'center', padding: '30px 20px', color: '#6b7280' }}>
          <div style={{ fontSize: '2rem', marginBottom: '8px' }}>✨</div>
          <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>No alerts found</div>
        </div>
      )}

      {!loading && filteredAlerts.length > 0 && (
        <div>
          {filteredAlerts.map((alert, idx) => (
            <AlertCard key={alert.id || idx} alert={alert} />
          ))}
        </div>
      )}
    </div>
  )
}
