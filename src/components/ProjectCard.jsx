import { useState, useRef, useEffect } from 'react'

export default function ProjectCard({ project, stats, onClick, onDownloadReport, loadingProjectId }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    function onDoc(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])
  const completion = stats?.completionPercent ?? 0
  const studentCount = stats?.studentCount ?? 0
  const totalTasks = stats?.totalTasks ?? 0
  const badge = statusToBadge(project.status)
  const projectDriveUrl = normalizeExternalLink(project?.drive_folder_link || '')

  return (
    <div
      className="card"
      onClick={() => onClick?.(project)}
      style={{
        cursor: 'pointer',
        transition: 'transform 0.2s',
        border: '1px solid var(--royal-border)',
      }}
      onMouseOver={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.borderColor = 'var(--royal)'
        e.currentTarget.style.boxShadow = '0 8px 24px rgba(9,30,66,0.06)'
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.transform = 'none'
        e.currentTarget.style.borderColor = 'var(--royal-border)'
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(9,30,66,0.05)'
      }}
    >
      <div className="card-head" style={{ alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <h2 className="card-title" style={{ marginBottom: 6 }}>{project.title}</h2>
          <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {project.description || '—'}
          </p>
          <p style={{ margin: '6px 0 0', fontSize: '0.8rem', color: 'var(--text-hint)' }}>
            Created at: {project?.created_at ? formatDateTime(project.created_at) : '—'}
          </p>
        </div>
        <span className={`badge ${badge}`}>{String(project.status || 'active').toUpperCase()}</span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4,1fr)',
          gap: 16,
          padding: 16,
          background: 'var(--page-bg)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--royal-border)',
        }}
      >
        <Stat label="Team members" value={studentCount} />
        <Stat label="Deadline" value={project.deadline ? formatDate(project.deadline) : 'TBD'} />
        <Stat label="Tasks" value={totalTasks} />
        <div>
          <span style={labelStyle}>Completion</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="progress-bar" style={{ flex: 1, height: 8 }}>
              <div className="progress-fill" style={{ width: `${completion}%`, background: completion >= 80 ? 'var(--green)' : completion >= 40 ? 'var(--amber)' : 'var(--royal)' }} />
            </div>
            <strong style={{ fontSize: '0.9rem', color: 'var(--text-head)' }}>{completion}%</strong>
          </div>
        </div>
      </div>
        <div style={{ marginTop: '1rem', display: 'flex', gap: 10, flexWrap: 'wrap', position: 'relative' }} ref={menuRef}>
          <button
            type="button"
            className="btn-primary"
            style={{ flex: 1, minWidth: 160, padding: '8px 12px', fontSize: '0.85rem' }}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen(!menuOpen) }}
            disabled={!onDownloadReport || loadingProjectId === project.id}
          >
            {loadingProjectId === project.id ? 'Generating...' : 'Download Report ▾'}
          </button>
          {menuOpen && (
            <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 60, background: '#fff', border: '1px solid var(--royal-border)', borderRadius: 8, boxShadow: '0 8px 24px rgba(9,30,66,0.08)', overflow: 'hidden' }}>
              <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen(false); onDownloadReport?.(project, { format: 'pdf' }) }} className="dropdown-item" style={{ display: 'block', padding: '8px 12px', width: 220 }}>Download PDF</button>
              <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen(false); onDownloadReport?.(project, { format: 'excel' }) }} className="dropdown-item" style={{ display: 'block', padding: '8px 12px', width: 220 }}>Download Excel</button>
              <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen(false); onDownloadReport?.(project, { format: 'csv' }) }} className="dropdown-item" style={{ display: 'block', padding: '8px 12px', width: 220 }}>Download CSV</button>
            </div>
          )}
        {projectDriveUrl && (
          <button type="button" onClick={(e) => { e.stopPropagation(); openExternalLink(projectDriveUrl) }} className="btn-outline" style={{ minWidth: 140, padding: '8px 12px', fontSize: '0.85rem' }}>
            Project Drive
          </button>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div>
      <span style={labelStyle}>{label}</span>
      <strong style={{ fontSize: '0.9rem', color: 'var(--text-head)' }}>{value}</strong>
    </div>
  )
}

const labelStyle = {
  display: 'block',
  fontSize: '0.72rem',
  textTransform: 'uppercase',
  color: 'var(--text-hint)',
  marginBottom: 6,
  letterSpacing: '0.05em',
}

function statusToBadge(status) {
  if (status === 'completed') return 'badge-green'
  if (status === 'paused') return 'badge-amber'
  return 'badge-green'
}

function formatDate(value) {
  try {
    const d = new Date(value)
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return String(value)
  }
}

function formatDateTime(value) {
  try {
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return String(value)
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
  } catch {
    return String(value)
  }
}

function normalizeExternalLink(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const candidate = /^https?:\/\//i.test(raw)
    ? raw
    : /^\/\//.test(raw)
      ? `https:${raw}`
      : `https://${raw}`

  try {
    const parsed = new URL(candidate)
    const host = String(parsed.hostname || '').toLowerCase()
    const looksValidHost = host === 'localhost' || host.includes('.')
    return looksValidHost ? parsed.toString() : ''
  } catch {
    return ''
  }
}

function openExternalLink(url) {
  const safeUrl = normalizeExternalLink(url)
  if (!safeUrl) return
  window.open(safeUrl, '_blank', 'noopener,noreferrer')
}
