import { useState, useEffect } from 'react'
import Modal, { SkeletonBlock } from './Modal'
import { fetchProjectReport } from '../lib/api'

/* ── Inline <style> for table cells inside this modal ── */
const modalTableCSS = `
.pdm-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 0.84rem;
  text-align: left;
}
.pdm-table th {
  padding: 10px 14px;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-hint, #6b7a90);
  background: var(--page-bg, #f4f6fb);
  border-bottom: 2px solid var(--royal-border, #dce3f0);
  white-space: nowrap;
}
.pdm-table th:first-child { border-radius: 8px 0 0 0; }
.pdm-table th:last-child  { border-radius: 0 8px 0 0; }
.pdm-table td {
  padding: 10px 14px;
  color: var(--text-body, #3d4f63);
  border-bottom: 1px solid var(--royal-border, #dce3f0);
  vertical-align: middle;
}
.pdm-table tbody tr:last-child td { border-bottom: none; }
.pdm-table tbody tr:hover td {
  background: rgba(26, 63, 170, 0.03);
}
`

export default function ProjectDetailsModal({ isOpen, projectId, onClose }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)

  useEffect(() => {
    if (!isOpen || !projectId) return

    async function loadDetails() {
      try {
        setLoading(true)
        setError('')
        const report = await fetchProjectReport(projectId)
        setData(report)
      } catch (err) {
        console.error(err)
        setError(err.message || 'Failed to load project details.')
      } finally {
        setLoading(false)
      }
    }

    loadDetails()
  }, [isOpen, projectId])

  if (!isOpen) return null

  const project = data?.project
  const projectStudents = data?.projectStudents || []
  const tasks = data?.tasks || []
  const modules = data?.modules || []
  const submissions = data?.submissions || []
  const usersById = data?.usersById || {}

  const getStudentName = (student) => {
    const derivedId = `student-${student.student_email.replace(/[^a-z0-9]+/gi, '-')}`
    const user = usersById[student.student_id] || usersById[derivedId]
    return user?.name || student.student_email.split('@')[0]
  }

  const getStudentRole = (student) => student.role || 'Developer'
  const getStudentModuleName = (student) => student.module_name || 'General'

  const formatDeadline = (dl) => {
    if (!dl) return 'TBD'
    try {
      return new Date(dl).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    } catch {
      return dl
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={project?.title || 'Project Details'} width={860}>
      <style>{modalTableCSS}</style>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '12px 0' }}>
          <SkeletonBlock height={32} width="60%" />
          <SkeletonBlock height={20} width="40%" />
          <SkeletonBlock height={80} />
          <SkeletonBlock height={140} />
          <SkeletonBlock height={140} />
        </div>
      ) : error ? (
        <div style={S.errorBox}>
          <div style={{ fontSize: '1.2rem', marginBottom: 8 }}>⚠ Error</div>
          <div>{error}</div>
        </div>
      ) : (
        <div style={S.container}>
          {/* ─── Metadata Row ─── */}
          <div style={S.metaRow}>
            <MetaChip label="Domain" value={project?.domain || 'General'} />
            <MetaChip label="Status">
              <span className={`badge ${project?.status === 'completed' ? 'badge-green' : 'badge-amber'}`} style={{ fontSize: '0.82rem' }}>
                {(project?.status || 'active').toUpperCase()}
              </span>
            </MetaChip>
            <MetaChip label="Deadline" value={formatDeadline(project?.deadline)} valueColor="#b91c1c" />
            <MetaChip label="Coordinator" value={project?.coordinator_name || 'Coordinator'} />
          </div>

          {/* ─── Description ─── */}
          <Section title="Project Description">
            <p style={S.bodyText}>{project?.description || 'No description provided.'}</p>
          </Section>

          {/* ─── Client Notes ─── */}
          {project?.client_notes && (
            <Section title="Client Notes">
              <p style={S.bodyText}>{project.client_notes}</p>
            </Section>
          )}

          {/* ─── Links ─── */}
          {(project?.drive_folder_link || project?.google_form_link) && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {project?.drive_folder_link && (
                <a href={project.drive_folder_link} target="_blank" rel="noreferrer" style={S.linkBtn}>📁 Drive Folder</a>
              )}
              {project?.google_form_link && (
                <a href={project.google_form_link} target="_blank" rel="noreferrer" style={S.linkBtn}>📝 Google Form</a>
              )}
            </div>
          )}

          {/* ─── Team Members ─── */}
          <Section title={`Team Members (${projectStudents.length})`}>
            {projectStudents.length === 0 ? (
              <p style={S.emptyText}>No students assigned to this project yet.</p>
            ) : (
              <div style={S.tableBox}>
                <table className="pdm-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Roll No</th>
                      <th>Role</th>
                      <th>Module</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projectStudents.map((s, idx) => (
                      <tr key={idx}>
                        <td style={{ fontWeight: 600, color: 'var(--royal)' }}>{getStudentName(s)}</td>
                        <td>{s.student_email}</td>
                        <td>{s.roll_no || '—'}</td>
                        <td><span className="badge badge-indigo" style={{ fontSize: '0.72rem' }}>{getStudentRole(s)}</span></td>
                        <td>{getStudentModuleName(s)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* ─── Modules ─── */}
          {modules.length > 0 && (
            <Section title="Project Modules">
              <div style={S.modulesGrid}>
                {modules.map((m, idx) => (
                  <div key={idx} style={S.moduleChip}>
                    <div style={{ fontWeight: 600, color: 'var(--text-head)' }}>{m.name}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 3 }}>Deadline: {formatDeadline(m.deadline)}</div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* ─── Tasks ─── */}
          <Section title={`Tasks & Progress (${tasks.length})`}>
            {tasks.length === 0 ? (
              <p style={S.emptyText}>No tasks created for this project yet.</p>
            ) : (
              <div style={S.tableBox}>
                <table className="pdm-table">
                  <thead>
                    <tr>
                      <th>Task</th>
                      <th>Assigned Student</th>
                      <th>Deadline</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map((t, idx) => {
                      const studentUser = usersById[t.assigned_student_id] || usersById[`student-${t.assigned_student_email?.replace(/[^a-z0-9]+/gi, '-')}`]
                      const studentName = studentUser?.name || t.assigned_student_email?.split('@')[0] || 'Unassigned'
                      const statusBadge = t.status === 'completed' ? 'badge-green' : t.status === 'in_progress' ? 'badge-amber' : 'badge-gray'
                      return (
                        <tr key={idx}>
                          <td style={{ fontWeight: 500 }}>{t.title}</td>
                          <td>{studentName}</td>
                          <td>{formatDeadline(t.deadline)}</td>
                          <td><span className={`badge ${statusBadge}`} style={{ fontSize: '0.72rem' }}>{(t.status || 'todo').replace('_', ' ').toUpperCase()}</span></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* ─── Submissions ─── */}
          <Section title={`Recent Submissions (${submissions.length})`}>
            {submissions.length === 0 ? (
              <p style={S.emptyText}>No work submissions found.</p>
            ) : (
              <div style={S.tableBox}>
                <table className="pdm-table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Task</th>
                      <th>Submitted At</th>
                      <th>Links</th>
                      <th>Review</th>
                    </tr>
                  </thead>
                  <tbody>
                    {submissions.slice(0, 5).map((sub, idx) => {
                      const studentUser = usersById[sub.student_id] || usersById[`student-${sub.student_email?.replace(/[^a-z0-9]+/gi, '-')}`]
                      const studentName = studentUser?.name || sub.student_email?.split('@')[0] || 'Student'
                      const reviewBadge = sub.review_status === 'approved' ? 'badge-green' : sub.review_status === 'rejected' ? 'badge-red' : 'badge-amber'
                      return (
                        <tr key={idx}>
                          <td style={{ fontWeight: 500 }}>{studentName}</td>
                          <td>{sub.task || 'General work'}</td>
                          <td>{formatDeadline(sub.submitted_at)}</td>
                          <td>
                            <div style={{ display: 'flex', gap: 8 }}>
                              {sub.github_link && <a href={sub.github_link} target="_blank" rel="noreferrer" style={S.iconLink}>🔗 GitHub</a>}
                              {sub.screenshot_link && <a href={sub.screenshot_link} target="_blank" rel="noreferrer" style={S.iconLink}>🖼 Screen</a>}
                            </div>
                          </td>
                          <td><span className={`badge ${reviewBadge}`} style={{ fontSize: '0.72rem' }}>{(sub.review_status || 'pending').toUpperCase()}</span></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </div>
      )}
    </Modal>
  )
}

/* ── Helper sub-components ──────────────────────── */

function MetaChip({ label, value, valueColor, children }) {
  return (
    <div style={S.metaChip}>
      <span style={S.metaLabel}>{label}</span>
      {children || <span style={{ ...S.metaValue, ...(valueColor ? { color: valueColor } : {}) }}>{value}</span>}
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div style={S.section}>
      <h3 style={S.sectionHeading}>{title}</h3>
      {children}
    </div>
  )
}

/* ── Styles ────────────────────────────────────────── */
const S = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
    color: 'var(--text-body)',
  },

  /* Meta row at top */
  metaRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 12,
    padding: '14px 18px',
    background: 'var(--page-bg, #f4f6fb)',
    borderRadius: 10,
    border: '1.5px solid var(--royal-border, #dce3f0)',
  },
  metaChip: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    flex: '1 1 140px',
    minWidth: 0,
  },
  metaLabel: {
    fontSize: '0.7rem',
    textTransform: 'uppercase',
    color: 'var(--text-hint, #6b7a90)',
    fontWeight: 700,
    letterSpacing: '0.06em',
  },
  metaValue: {
    fontSize: '0.92rem',
    fontWeight: 600,
    color: 'var(--text-head, #1a2233)',
  },

  /* Sections */
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  sectionHeading: {
    margin: 0,
    fontSize: '0.82rem',
    fontWeight: 700,
    color: 'var(--text-head, #1a2233)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    paddingBottom: 6,
    borderBottom: '2px solid var(--royal-border, #dce3f0)',
  },

  bodyText: {
    margin: 0,
    fontSize: '0.88rem',
    lineHeight: 1.6,
    color: 'var(--text-body, #3d4f63)',
    whiteSpace: 'pre-line',
  },

  /* Table wrapper — single clean border, no double nesting */
  tableBox: {
    overflowX: 'auto',
    borderRadius: 10,
    border: '1.5px solid var(--royal-border, #dce3f0)',
    background: '#fff',
  },

  /* Modules grid */
  modulesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: 10,
  },
  moduleChip: {
    padding: '10px 14px',
    background: 'var(--page-bg, #f4f6fb)',
    borderRadius: 8,
    border: '1px solid var(--royal-border, #dce3f0)',
  },

  /* Links */
  linkBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '7px 14px',
    fontSize: '0.82rem',
    fontWeight: 600,
    color: 'var(--royal, #1a3faa)',
    background: '#fff',
    border: '1.5px solid var(--royal-border, #dce3f0)',
    borderRadius: 8,
    textDecoration: 'none',
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
  iconLink: {
    fontSize: '0.78rem',
    color: 'var(--royal, #1a3faa)',
    textDecoration: 'none',
    fontWeight: 500,
  },

  emptyText: {
    margin: '8px 0',
    fontSize: '0.84rem',
    color: 'var(--text-hint, #6b7a90)',
    fontStyle: 'italic',
  },

  errorBox: {
    padding: '20px 24px',
    background: '#FFEBE6',
    border: '1.5px solid #FF5630',
    color: '#BF2600',
    borderRadius: 8,
    fontSize: '0.9rem',
    lineHeight: 1.5,
  },
}
