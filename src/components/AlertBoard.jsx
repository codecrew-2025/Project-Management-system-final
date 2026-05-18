function alertToneClass(tone) {
  if (tone === 'critical') return 'critical'
  if (tone === 'medium') return 'medium'
  return 'high'
}

function priorityBadgeClass(priority) {
  if (priority === 'Critical') return 'badge-red'
  if (priority === 'High') return 'badge-amber'
  return 'badge-green'
}

function formatValue(value) {
  if (value === null || value === undefined || value === '') return '—'
  return String(value)
}

function MetaRow({ label, value }) {
  return (
    <div className="alert-meta-item">
      <span className="alert-meta-label">{label}</span>
      <span className="alert-meta-value">{formatValue(value)}</span>
    </div>
  )
}

function AlertCard({ alert }) {
  return (
    <article className={`alert-card alert-card-${alertToneClass(alert.priority === 'Critical' ? 'critical' : alert.priority === 'High' ? 'high' : 'medium')}`}>
      <div className="alert-card-top">
        <div>
          <div className="alert-card-type">{alert.alertType}</div>
          <div className="alert-card-message">{alert.message}</div>
        </div>
        <span className={`badge ${priorityBadgeClass(alert.priority)}`}>{alert.priority}</span>
      </div>

      <div className="alert-meta-grid">
        <MetaRow label="Team Member Name" value={alert.student_name} />
        <MetaRow label="Register Number" value={alert.register_number} />
        <MetaRow label="Project Title" value={alert.project_title} />
        <MetaRow label="Faculty / Coordinator" value={alert.coordinator_name} />
        <MetaRow label="Deadline" value={alert.deadline} />
        <MetaRow label="Current Progress" value={alert.current_progress} />
      </div>
    </article>
  )
}

function SectionCard({ section }) {
  const count = Array.isArray(section.alerts) ? section.alerts.length : 0

  return (
    <section className={`alert-section alert-section-${alertToneClass(section.tone)}`}>
      <div className="alert-section-head">
        <div>
          <h3 className="alert-section-title">{section.title}</h3>
          {section.subtitle && <p className="alert-section-subtitle">{section.subtitle}</p>}
        </div>
        <span className={`badge ${section.tone === 'critical' ? 'badge-red' : section.tone === 'medium' ? 'badge-amber' : 'badge-green'}`}>{count}</span>
      </div>

      {count === 0 ? (
        <div className="alert-empty-state">No alerts in this category.</div>
      ) : (
        <div className="alert-list">
          {section.alerts.map((alert) => (
            <AlertCard key={alert.id} alert={alert} />
          ))}
        </div>
      )}
    </section>
  )
}

export default function AlertBoard({ title, subtitle, sections = [], history = [], emptyMessage = 'No alerts available.' }) {
  const totalAlerts = sections.reduce((sum, section) => sum + (Array.isArray(section.alerts) ? section.alerts.length : 0), 0)
  const historyItems = Array.isArray(history) ? history : []

  return (
    <section className="card alert-board">
      <div className="card-head alert-board-head">
        <div>
          <h2 className="card-title">{title}</h2>
          {subtitle && <p className="page-sub" style={{ marginTop: 4 }}>{subtitle}</p>}
        </div>
        <span className={`badge ${totalAlerts > 0 ? 'badge-red' : 'badge-green'}`}>{totalAlerts} Active</span>
      </div>

      <div className="alert-board-grid">
        {sections.map((section) => (
          <SectionCard key={section.key} section={section} />
        ))}
      </div>

      {historyItems.length > 0 ? (
        <div className="alert-history">
          <div className="alert-history-head">
            <h3 className="alert-section-title">Auto-generated Alert History</h3>
            <span className="alert-history-count">{historyItems.length} entries</span>
          </div>
          <div className="alert-history-list">
            {historyItems.slice(0, 8).map((alert) => (
              <div className="alert-history-item" key={alert.id}>
                <div>
                  <strong>{alert.alertType}</strong>
                  <span>{alert.project_title} · {alert.student_name}</span>
                </div>
                <span className={`badge ${priorityBadgeClass(alert.priority)}`}>{alert.priority}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="alert-empty-history">{emptyMessage}</div>
      )}
    </section>
  )
}
