import { useEffect, useMemo, useState } from 'react'
import Sidebar from '../components/Sidebar'
import LayoutMenu from '../components/LayoutMenu'
import { useDashboardData } from '../lib/useDashboardData'
import ActionModal from '../components/ActionModal'
import {
  getCoordinatorProjectLinks,
} from '../lib/projectRepositoryStore'
import { changePassword } from '../lib/api'
import '../assets/dashboard.css'

const navItems = [
  { label: 'Workspace' },
  { label: 'My Project' },
  { label: 'Tasks' },
  { label: 'Submissions' },
  { label: 'Messages' },
]

const emptyStudentDashboard = {
  profile: {
    name: '',
    role: 'Team member',
    subtitle: '',
    initials: '',
  },
  header: {
    title: 'My Workspace',
    subtitle: '',
  },
  kpis: [],
  project: {
    id: '',
    title: '',
    status: '',
    desc: '',
    coordinator: '',
    deadline: '',
    teamSize: '',
    department: '',
    progress: 0,
    milestones: [],
    drive_folder_link: null,
  },
  epicMilestones: [],
  tasks: [],
  announcements: [],
  submissions: [],
  messages: [],
}

export default function StudentDashboard() {
  const [selectedProjectId, setSelectedProjectId] = useState(null)
  const [dashboard, refetch] = useDashboardData('student', emptyStudentDashboard, { projectId: selectedProjectId })
  const [activeNav, setActiveNav] = useState(0)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalAction, setModalAction] = useState('')
  const [sidebarMode, setSidebarMode] = useState('expanded')

  const user = useMemo(() => {
    try {
      const raw = sessionStorage.getItem('pf_user') || localStorage.getItem('pf_user')
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  }, [])

  const displayName = user?.name || dashboard.profile.name
  const displayRole = user?.role || dashboard.profile.role
  const displaySubtitle = user?.email || dashboard.profile.subtitle
  const displayInitials =
    displayName
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join('') || dashboard.profile.initials
  const notificationContext = useMemo(() => ({
    student_id: user?.id || '',
    student_email: user?.email || '',
  }), [user?.email, user?.id])

  const openModal = (action) => { setModalAction(action); setModalOpen(true) }

  const projectRef = useMemo(
    () => ({ id: dashboard?.project?.id || dashboard?.project_id || '', title: dashboard?.project?.title || '' }),
    [dashboard]
  )

  const coordinatorLinks = useMemo(() => {
    const localLinks = getCoordinatorProjectLinks(projectRef) || {}
    return {
      project_title: localLinks.project_title || dashboard?.project?.title || '',
      google_drive_link: localLinks.google_drive_link || '',
      main_project_drive_link: localLinks.main_project_drive_link || dashboard?.project?.drive_folder_link || '',
      shared_folder_link: localLinks.shared_folder_link || '',
      reference_materials_link: localLinks.reference_materials_link || '',
    }
  }, [projectRef, dashboard])

  useEffect(() => {
    const handleFocus = () => {
      refetch()
    }

    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [refetch])

  const assignedTaskOptions = useMemo(
    () =>
      (Array.isArray(dashboard?.tasks) ? dashboard.tasks : [])
        .map((task) => {
          const label = String(task?.title || '').trim()
          if (!label) return null
          const taskId = String(task?.source_task_id || '').trim()
          return {
            label,
            value: taskId || label,
            task_id: taskId || '',
          }
        })
        .filter(Boolean),
    [dashboard]
  )

  return (
    <div data-role="student" style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <ActionModal isOpen={modalOpen} onClose={() => setModalOpen(false)} actionName={modalAction} onSuccess={refetch} taskOptions={assignedTaskOptions} />
      <Sidebar
        mode={sidebarMode}
        role={displayRole}
        userName={displayName}
        userInitials={displayInitials}
        userSub={displaySubtitle}
        navItems={navItems}
        activeNav={activeNav}
        onNavChange={setActiveNav}
        onToggleMode={() => setSidebarMode(prev => prev === 'mini' ? 'expanded' : 'mini')}
        notificationContext={notificationContext}
      />
      <main className="main-content">
        {/* Project switcher — shown when student has multiple projects */}
        {Array.isArray(dashboard?.allProjects) && dashboard.allProjects.length > 1 && (
          <div style={{ padding: '10px 20px 0', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', borderBottom: '1px solid var(--royal-border)', background: '#fff' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Project:</span>
            {dashboard.allProjects.map(p => (
              <button
                key={p.id}
                onClick={() => setSelectedProjectId(p.id)}
                style={{
                  padding: '4px 12px',
                  borderRadius: 999,
                  border: '1px solid var(--royal-border)',
                  background: (selectedProjectId === p.id || (!selectedProjectId && p.id === dashboard.project?.id)) ? 'var(--royal)' : '#fff',
                  color: (selectedProjectId === p.id || (!selectedProjectId && p.id === dashboard.project?.id)) ? '#fff' : 'var(--text-head)',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                }}
              >
                {p.title}
              </button>
            ))}
          </div>
        )}
        {activeNav === 0 && <StudentWorkspace dashboard={dashboard} coordinatorLinks={coordinatorLinks} openModal={openModal} sidebarMode={sidebarMode} setSidebarMode={setSidebarMode} />}
        {activeNav === 1 && <StudentProject dashboard={dashboard} coordinatorLinks={coordinatorLinks} sidebarMode={sidebarMode} setSidebarMode={setSidebarMode} />}
        {activeNav === 2 && <StudentTasks dashboard={dashboard} refetch={refetch} sidebarMode={sidebarMode} setSidebarMode={setSidebarMode} />}
        {activeNav === 3 && <StudentSubmissions dashboard={dashboard} openModal={openModal} sidebarMode={sidebarMode} setSidebarMode={setSidebarMode} />}
        {activeNav === 4 && <StudentMessages dashboard={dashboard} openModal={openModal} sidebarMode={sidebarMode} setSidebarMode={setSidebarMode} />}
        {activeNav === 5 && <StudentSettings user={user} />}
      </main>
    </div>
  )
}

/* ─── Workspace Overview ──────────────────────────────── */
function StudentWorkspace({ dashboard, coordinatorLinks, openModal, sidebarMode, setSidebarMode }) {
  const epicMilestones = Array.isArray(dashboard?.epicMilestones) && dashboard.epicMilestones.length > 0
    ? dashboard.epicMilestones
    : dashboard.project.milestones
  const projectDriveUrl = normalizeExternalLink(coordinatorLinks?.main_project_drive_link || dashboard?.project?.drive_folder_link || '')
  const googleDriveUrl = normalizeExternalLink(coordinatorLinks?.google_drive_link || '')
  const sharedFolderUrl = normalizeExternalLink(coordinatorLinks?.shared_folder_link || '')
  const referencesUrl = normalizeExternalLink(coordinatorLinks?.reference_materials_link || '')

  return (
    <>
      <header className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {sidebarMode === 'hidden' && (
             <div className="logo-icon" style={{ cursor: 'pointer' }} onClick={() => setSidebarMode('expanded')}>
                <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: 32, height: 32 }}>
                  <path d="M10 6C10 4.89543 10.8954 4 12 4H22C23.1046 4 24 4.89543 24 6V11C24 12.1046 23.1046 13 22 13H12C10.8954 13 10 12.1046 10 11V6Z" fill="var(--royal)"/>
                  <path d="M10 16C10 14.8954 10.8954 14 12 14H17C18.1046 14 19 14.8954 19 16V26C19 27.1046 18.1046 28 17 28H12C10.8954 28 10 27.1046 10 26V16Z" fill="var(--royal)" fillOpacity="0.6"/>
                  <circle cx="23" cy="21" r="5" fill="var(--royal)" fillOpacity="0.4" />
                </svg>
             </div>
          )}
          <div>
            <h1 className="page-title">{dashboard.header.title}</h1>
            {dashboard.header.subtitle ? <p className="page-sub">{dashboard.header.subtitle}</p> : null}
          </div>
        </div>
        <div className="topbar-actions">
          <button className="btn-outline" onClick={() => openModal('Send Message')}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight:6,verticalAlign:'middle'}}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            Message
          </button>
          <button className="btn-primary" onClick={() => openModal('Submit Pull Request')}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{marginRight:6,verticalAlign:'middle'}}><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/></svg>
            Submit Work
          </button>
          <LayoutMenu sidebarMode={sidebarMode} setSidebarMode={setSidebarMode} />
        </div>
      </header>

      <section className="kpi-grid">
        {dashboard.kpis.map((k, i) => (
          <div className="kpi-card" key={i}>
            <div className="kpi-icon" style={{ background: k.bg, color: k.color }}>{k.icon}</div>
            <div className="kpi-body">
              <span className="kpi-label">{k.label}</span>
              <span className="kpi-value">{k.value}</span>
            </div>
            <span className={`kpi-trend ${k.trend}`}>{k.trendTxt}</span>
          </div>
        ))}
      </section>

      <div className="content-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        <div className="card wide-card" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <h2 className="card-title" style={{ fontSize: '1.3rem' }}>{dashboard.project.title}</h2>
              <span className="badge badge-green">{dashboard.project.status.toUpperCase()}</span>
            </div>
            <p style={{ color: 'var(--text-body)', fontSize: '0.9rem', lineHeight: 1.6 }}>{dashboard.project.desc}</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, padding: 16, background: 'var(--page-bg)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--royal-border)' }}>
            {[['Assignee', dashboard.project.coordinator],['Due Date', dashboard.project.deadline],['Team', dashboard.project.teamSize],['Dept.', dashboard.project.department]].map(([l,v],i) => (
              <div key={i}>
                <span style={{ display: 'block', fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-hint)', marginBottom: 4 }}>{l}</span>
                <strong style={{ fontSize: '0.875rem', color: 'var(--text-head)' }}>{v}</strong>
              </div>
            ))}
          </div>
          {projectDriveUrl && (
            <div style={{ marginTop: '1rem' }}>
              <button
                type="button"
                className="btn-primary"
                style={{ width: '100%' }}
                onClick={() => openExternalLink(projectDriveUrl)}
              >
                Project Drive
              </button>
            </div>
          )}
          <div className="card" style={{ margin: 0, padding: 14, background: 'var(--page-bg)' }}>
            <div className="card-head" style={{ marginBottom: 10 }}>
              <h3 className="card-title" style={{ fontSize: '1rem', margin: 0 }}>Coordinator Project Links</h3>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {googleDriveUrl && <button type="button" onClick={() => openExternalLink(googleDriveUrl)} className="btn-outline" style={{ padding: '6px 10px' }}>Open Google Drive</button>}
              {projectDriveUrl && <button type="button" onClick={() => openExternalLink(projectDriveUrl)} className="btn-outline" style={{ padding: '6px 10px' }}>Open Project Drive</button>}
              {sharedFolderUrl && <button type="button" onClick={() => openExternalLink(sharedFolderUrl)} className="btn-outline" style={{ padding: '6px 10px' }}>Open Shared Folder</button>}
              {referencesUrl && <button type="button" onClick={() => openExternalLink(referencesUrl)} className="btn-outline" style={{ padding: '6px 10px' }}>Open References</button>}
              {!googleDriveUrl && !projectDriveUrl && !sharedFolderUrl && !referencesUrl && (
                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Coordinator has not published project links yet.</span>
              )}
            </div>
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-head)', margin: 0 }}>Sprint Tasks</h3>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {dashboard.tasks.filter(t=>t.cls==='done').length}/{dashboard.tasks.length} done
              </span>
            </div>
            <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {dashboard.tasks.map((t, i) => (
                <li key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', border: '1px solid var(--royal-border)', borderRadius: 'var(--radius-lg)', background: t.cls === 'done' ? '#f0fdf4' : '#fff', transition: 'background 0.2s' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.7rem', flexShrink: 0, background: t.cls==='done'?'var(--green)':t.cls==='active'?'var(--royal)':'var(--royal-border)' }}>
                      {t.check}
                    </span>
                    <strong style={{ fontSize: '0.875rem', color: t.cls==='done'?'var(--text-hint)':'var(--text-head)', textDecoration: t.cls==='done'?'line-through':'none' }}>{t.title}</strong>
                  </div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '3px 8px', borderRadius: 4, background: t.urgent?'#fee2e2':'var(--royal-faint)', color: t.urgent?'var(--red)':'var(--text-muted)' }}>{t.sub}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div className="card">
            <div className="card-head"><h2 className="card-title">Epic Milestones</h2></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {epicMilestones.map((m, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 16, height: 16, borderRadius: 4, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', color: '#fff', background: m.state==='done'?'var(--green)':m.state==='active'?'var(--royal)':'var(--royal-border)' }}>
                    {m.state==='done'?'✓':m.state==='active'?'⟳':''}
                  </div>
                  <span style={{ fontSize: '0.875rem', fontWeight: m.state==='active'?700:500, color: m.state==='done'?'var(--text-hint)':'var(--text-body)' }}>{m.text}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="card-head"><h2 className="card-title">Announcements</h2></div>
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {dashboard.announcements.map((a, i) => (
                <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--royal-border)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: a.dot, flexShrink: 0, marginTop: 6 }}></span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.875rem', lineHeight: 1.5 }}>{a.text}</div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-hint)', display: 'block', marginTop: 4 }}>{a.time}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="card">
            <div className="card-head"><h2 className="card-title">Upcoming Meetings</h2></div>
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {(!dashboard.meetings || dashboard.meetings.length === 0) ? (
                <p style={{ margin: 0, padding: '12px 0', color: 'var(--text-muted)' }}>No meetings scheduled.</p>
              ) : (
                dashboard.meetings.map((m, i) => (
                  <li key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '12px 0', borderBottom: '1px solid var(--royal-border)' }}>
                    <strong style={{ fontSize: '0.875rem', color: 'var(--text-head)' }}>{m.title}</strong>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', gap: 12 }}>
                      <span>📅 {m.date} {m.time}</span>
                      <span>📍 {m.location || 'Online'}</span>
                    </div>
                    {m.note && <span style={{ fontSize: '0.75rem', color: 'var(--text-hint)', marginTop: 4 }}>{m.note}</span>}
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      </div>
    </>
  )
}

/* ─── My Project Panel ────────────────────────────────── */
function StudentProject({ dashboard, coordinatorLinks }) {
  const projectDriveUrl = normalizeExternalLink(coordinatorLinks?.main_project_drive_link || dashboard?.project?.drive_folder_link || '')
  const googleDriveUrl = normalizeExternalLink(coordinatorLinks?.google_drive_link || '')
  const sharedFolderUrl = normalizeExternalLink(coordinatorLinks?.shared_folder_link || '')
  const referencesUrl = normalizeExternalLink(coordinatorLinks?.reference_materials_link || '')

  return (
    <>
      <header className="topbar">
        <div><h1 className="page-title">My Project</h1><p className="page-sub">Full details and tracking for your assigned project</p></div>
      </header>
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-head">
          <h2 className="card-title" style={{ fontSize: '1.3rem' }}>{dashboard.project.title}</h2>
          <span className="badge badge-green">{dashboard.project.status.toUpperCase()}</span>
        </div>
        <p style={{ color: 'var(--text-body)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 24 }}>{dashboard.project.desc}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', background: 'var(--page-bg)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--royal-border)' }}>
          {[['Coordinator', dashboard.project.coordinator],['Deadline', dashboard.project.deadline],['Team Size', dashboard.project.teamSize],['Department', dashboard.project.department]].map(([l,v],i) => (
            <div key={i}>
              <span style={{ display: 'block', fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-hint)', marginBottom: 4 }}>{l}</span>
              <strong style={{ fontSize: '0.9rem', color: 'var(--text-head)' }}>{v}</strong>
            </div>
          ))}
          {projectDriveUrl && (
            <div style={{ marginLeft: 'auto' }}>
              <button type="button" onClick={() => openExternalLink(projectDriveUrl)} className="btn-primary">
                Project Drive
              </button>
            </div>
          )}
        </div>
        <div style={{ marginTop: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Overall Progress</span>
            <span style={{ fontWeight: 700, color: 'var(--green)' }}>{dashboard.project.progress}%</span>
          </div>
          <div className="progress-bar" style={{ height: 12 }}>
            <div className="progress-fill" style={{ width: `${dashboard.project.progress}%`, background: 'var(--green)' }}></div>
          </div>
        </div>
        <div className="card" style={{ marginTop: 16, marginBottom: 0, padding: 14, background: 'var(--page-bg)' }}>
          <div className="card-head" style={{ marginBottom: 10 }}><h3 className="card-title" style={{ margin: 0, fontSize: '1rem' }}>Coordinator Resource Links</h3></div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {googleDriveUrl && <button type="button" onClick={() => openExternalLink(googleDriveUrl)} className="btn-outline" style={{ padding: '6px 10px' }}>Google Drive</button>}
            {projectDriveUrl && <button type="button" onClick={() => openExternalLink(projectDriveUrl)} className="btn-outline" style={{ padding: '6px 10px' }}>Project Drive</button>}
            {sharedFolderUrl && <button type="button" onClick={() => openExternalLink(sharedFolderUrl)} className="btn-outline" style={{ padding: '6px 10px' }}>Shared Folder</button>}
            {referencesUrl && <button type="button" onClick={() => openExternalLink(referencesUrl)} className="btn-outline" style={{ padding: '6px 10px' }}>Reference Materials</button>}
            {!googleDriveUrl && !projectDriveUrl && !sharedFolderUrl && !referencesUrl && (
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Coordinator links are not available yet.</span>
            )}
          </div>
        </div>
      </div>
      <div className="card">
        <div className="card-head"><h2 className="card-title">Project Milestones</h2></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {dashboard.project.milestones.map((m, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px', border: '1px solid var(--royal-border)', borderRadius: 8, background: m.state==='done'?'#f0fdf4':'#fff' }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700, color: '#fff', background: m.state==='done'?'var(--green)':m.state==='active'?'var(--royal)':'var(--royal-border)' }}>
                {m.state==='done'?'✓':m.state==='active'?'⟳':i+1}
              </div>
              <span style={{ fontSize: '0.9rem', fontWeight: m.state==='active'?700:500, color: m.state==='done'?'var(--text-hint)':'var(--text-head)' }}>{m.text}</span>
              <span style={{ marginLeft: 'auto' }}><span className={`badge ${m.state==='done'?'badge-green':m.state==='active'?'badge-amber':'badge-red'}`}>{m.state.toUpperCase()}</span></span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

/* ─── Tasks Panel ─────────────────────────────────────── */
function StudentTasks({ dashboard, refetch }) {
  const [updating, setUpdating] = useState(null)

  async function updateTaskStatus(taskId, status) {
    if (!taskId) return
    setUpdating(taskId)
    try {
      await fetch(`/api/tasks/${taskId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      refetch()
    } catch (e) {
      console.error('Failed to update task:', e)
    } finally {
      setUpdating(null)
    }
  }

  return (
    <>
      <header className="topbar">
        <div><h1 className="page-title">Tasks</h1><p className="page-sub">Your sprint backlog and assigned issues</p></div>
      </header>
      <div className="kpi-grid">
        <div className="kpi-card"><div className="kpi-icon" style={{background:'#E9F7EF',color:'#1E8449'}}>✅</div><div className="kpi-body"><span className="kpi-label">Completed</span><span className="kpi-value">{dashboard.tasks.filter(t=>t.cls==='done').length}</span></div></div>
        <div className="kpi-card"><div className="kpi-icon" style={{background:'#EBF5FB',color:'#2E86C1'}}>⚡</div><div className="kpi-body"><span className="kpi-label">In Progress</span><span className="kpi-value">{dashboard.tasks.filter(t=>t.cls==='active').length}</span></div></div>
        <div className="kpi-card"><div className="kpi-icon" style={{background:'#FDEDEC',color:'#C0392B'}}>🔥</div><div className="kpi-body"><span className="kpi-label">Critical</span><span className="kpi-value">{dashboard.tasks.filter(t=>t.urgent).length}</span></div></div>
        <div className="kpi-card"><div className="kpi-icon" style={{background:'#FEF9E7',color:'#D4AC0D'}}>📋</div><div className="kpi-body"><span className="kpi-label">Total</span><span className="kpi-value">{dashboard.tasks.length}</span></div></div>
      </div>
      <div className="card">
        <div className="card-head"><h2 className="card-title">Sprint Board</h2></div>
        {dashboard.tasks.length === 0 && <p style={{ color: 'var(--text-muted)', padding: '10px 0' }}>No tasks assigned yet.</p>}
        <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {dashboard.tasks.map((t, i) => (
            <li key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', border: '1px solid var(--royal-border)', borderRadius: 8, background: t.cls==='done'?'#f0fdf4':'#fff' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{ width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', color: '#fff', flexShrink: 0, background: t.cls==='done'?'var(--green)':t.cls==='active'?'var(--royal)':'var(--royal-border)' }}>{t.check}</span>
                <div>
                  <strong style={{ display: 'block', fontSize: '0.9rem', color: t.cls==='done'?'var(--text-hint)':'var(--text-head)', textDecoration: t.cls==='done'?'line-through':'none' }}>{t.title}</strong>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{t.sub}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {t.urgent && <span className="badge badge-red">CRITICAL</span>}
                <span className={`badge ${t.cls==='done'?'badge-green':t.cls==='active'?'badge-amber':'badge-red'}`}>
                  {t.cls==='done'?'DONE':t.cls==='active'?'IN PROGRESS':'TODO'}
                </span>
                {t.source_task_id && t.cls !== 'done' && (
                  <>
                    {t.cls === 'todo' && (
                      <button
                        className="btn-outline"
                        style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                        disabled={updating === t.source_task_id}
                        onClick={() => updateTaskStatus(t.source_task_id, 'in_progress')}
                      >
                        Start
                      </button>
                    )}
                    <button
                      className="btn-primary"
                      style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                      disabled={updating === t.source_task_id}
                      onClick={() => updateTaskStatus(t.source_task_id, 'completed')}
                    >
                      {updating === t.source_task_id ? '…' : 'Mark Done'}
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}

/* ─── Submissions Panel ───────────────────────────────── */
function StudentSubmissions({ dashboard, openModal }) {
  const subs = Array.isArray(dashboard?.submissions) ? dashboard.submissions : []
  return (
    <>
      <header className="topbar">
        <div><h1 className="page-title">Submissions</h1><p className="page-sub">Track your submitted work and received grades</p></div>
        <div className="topbar-actions">
          <button className="btn-primary" onClick={() => openModal('Submit Pull Request')}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{marginRight:6,verticalAlign:'middle'}}><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/></svg>
            Submit New
          </button>
        </div>
      </header>
      <div className="card">
        <div className="card-head"><h2 className="card-title">My Submissions</h2></div>
        {subs.length === 0 ? (
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>No submissions found.</p>
        ) : (
          <table className="data-table">
            <thead><tr><th>Task</th><th>Submitted</th><th>Type</th><th>Links</th><th>Status</th><th>Reason</th></tr></thead>
            <tbody>
              {subs.map((s, i) => {
                const statusValue = String(s.review_status || s.status || s.grade || 'pending').trim().toLowerCase()
                const statusLabel = statusValue === 'approved' || statusValue === 'graded' ? 'Approved' : statusValue === 'rejected' ? 'Rejected' : 'Pending'
                const statusClass = statusValue === 'approved' || statusValue === 'graded' ? 'badge-green' : statusValue === 'rejected' ? 'badge-red' : 'badge-amber'
                return (
                  <tr key={i}>
                    <td style={{ fontWeight: 600, color: 'var(--text-head)' }}>{s.task || '—'}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{s.date || '—'}</td>
                    <td><span className="badge badge-green">{s.type || '—'}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {s.github_link && <a href={s.github_link} target="_blank" rel="noreferrer" className="btn-outline" style={{ padding: '2px 8px', fontSize: '0.72rem' }}>GitHub</a>}
                      {s.screenshot_link && <a href={s.screenshot_link} target="_blank" rel="noreferrer" className="btn-outline" style={{ padding: '2px 8px', fontSize: '0.72rem' }}>Screenshot</a>}
                      {s.video_link && <a href={s.video_link} target="_blank" rel="noreferrer" className="btn-outline" style={{ padding: '2px 8px', fontSize: '0.72rem' }}>Video</a>}
                      {!s.github_link && !s.screenshot_link && !s.video_link && <span style={{ color: 'var(--text-hint)' }}>—</span>}
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${statusClass}`} style={{ minWidth: 88 }}>
                      {statusLabel.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ color: statusValue === 'rejected' ? 'var(--red)' : statusValue === 'approved' ? 'var(--green)' : 'var(--text-muted)', fontWeight: statusValue === 'rejected' || statusValue === 'approved' ? 600 : 400 }}>
                    {statusValue === 'rejected'
                      ? (s.reason || s.coordinator_comment || s.review_reason || s.comment || s.coordinatorComment || 'No reason provided')
                      : (s.reason || s.coordinator_comment || s.review_reason || '—')}
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
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

/* ─── Messages Panel ──────────────────────────────────── */
function StudentMessages({ dashboard, openModal }) {
  const messages = Array.isArray(dashboard?.messages) ? dashboard.messages : []
  const [selectedMessage, setSelectedMessage] = useState(null)
  const [readMessageKeys, setReadMessageKeys] = useState({})

  const messageItems = useMemo(() => {
    return messages.map((m, index) => ({
      ...m,
      _key: `${String(m?.from || 'unknown')}|${String(m?.subject || '')}|${String(m?.time || '')}|${index}`,
    }))
  }, [messages])

  const unreadCount = useMemo(() => {
    return messageItems.filter((m) => !m.read && !readMessageKeys[m._key]).length
  }, [messageItems, readMessageKeys])

  const openMessage = (message) => {
    if (!message?._key) return
    setSelectedMessage(message)
    setReadMessageKeys((prev) => ({ ...prev, [message._key]: true }))
  }

  const closeMessage = () => setSelectedMessage(null)

  return (
    <>
      <header className="topbar">
        <div><h1 className="page-title">Messages</h1><p className="page-sub">Communicate with your coordinator and team</p></div>
        <div className="topbar-actions">
          <button className="btn-primary" onClick={() => openModal('Send Message')}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{marginRight:6,verticalAlign:'middle'}}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New Message
          </button>
        </div>
      </header>
      <div className="card">
        <div className="card-head"><h2 className="card-title">Inbox</h2><span className="badge badge-green">{unreadCount} Unread</span></div>
        {messageItems.length === 0 ? (
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>No messages found.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {messageItems.map((m) => {
              const isRead = Boolean(m.read || readMessageKeys[m._key])
              const preview = String(m.body || '').trim() || String(m.subject || 'No subject').trim()
              const previewText = preview.length > 96 ? `${preview.slice(0, 93)}...` : preview
              return (
              <li key={m._key} onClick={() => openMessage(m)} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 0', borderBottom: '1px solid var(--royal-border)', background: !isRead?'#f0f7ff':'transparent', cursor: 'pointer' }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--royal)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.9rem', flexShrink: 0 }}>
                  {(m.from || 'NA').split(' ').map(w=>w[0]).join('').slice(0,2)}
                </div>
                <div style={{ flex: 1 }}>
                  <strong style={{ display: 'block', fontSize: '0.9rem', color: 'var(--text-head)' }}>{m.from || 'Unknown'}</strong>
                  <span style={{ display: 'block', fontSize: '0.85rem', color: isRead ? 'var(--text-muted)' : 'var(--text-body)', fontWeight: isRead ? 400 : 600 }}>
                    {m.subject || 'No subject'}
                  </span>
                  <span style={{ display: 'block', marginTop: 2, fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                    {previewText}
                  </span>
                </div>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-hint)', flexShrink: 0 }}>{m.time || '—'}</span>
                {!isRead && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--royal)', flexShrink: 0 }}></span>}
              </li>
            )})}
          </ul>
        )}
      </div>

      {selectedMessage && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeMessage()
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(9, 30, 66, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 16,
          }}
        >
          <div
            className="card"
            style={{ width: 'min(700px, 100%)', maxHeight: '80vh', overflowY: 'auto', margin: 0 }}
          >
            <div className="card-head" style={{ borderBottom: '1px solid var(--royal-border)', paddingBottom: 12, marginBottom: 12 }}>
              <h2 className="card-title" style={{ margin: 0 }}>Message</h2>
              <button className="btn-outline" onClick={closeMessage} style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                Close
              </button>
            </div>

            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                <strong style={{ color: 'var(--text-head)' }}>From:</strong> {selectedMessage.from || 'Unknown'}
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                <strong style={{ color: 'var(--text-head)' }}>Type:</strong> {selectedMessage.message_type || 'General Query'}
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                <strong style={{ color: 'var(--text-head)' }}>Time:</strong> {selectedMessage.time || '—'}
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                <strong style={{ color: 'var(--text-head)' }}>Subject:</strong> {selectedMessage.subject || 'No subject'}
              </div>

              <div
                style={{
                  marginTop: 4,
                  background: 'var(--page-bg)',
                  border: '1px solid var(--royal-border)',
                  borderRadius: 'var(--radius-lg)',
                  padding: 14,
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.6,
                  color: 'var(--text-body)',
                }}
              >
                {selectedMessage.body || 'No message content available.'}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/* ─── Settings Panel ──────────────────────────────────── */
function StudentSettings({ user }) {
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [changing, setChanging] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')

  const updatePassword = async () => {
    setStatusMsg('')
    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      setStatusMsg('All password fields are required.')
      return
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setStatusMsg('New passwords do not match.')
      return
    }

    setChanging(true)
    try {
      await changePassword({
        email: user?.email || '',
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      })
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
      setStatusMsg('Password updated successfully.')
    } catch (error) {
      setStatusMsg(error?.message || 'Unable to change password right now.')
    } finally {
      setChanging(false)
    }
  }

  const profileRows = [
    ['Full Name', user?.name || '—'],
    ['Email', user?.email || '—'],
    ['Role', user?.role ? `${user.role.charAt(0).toUpperCase()}${user.role.slice(1)}` : 'Team member'],
    ['Department', user?.department || '—'],
    ['Phone', user?.phone || '—'],
  ]

  return (
    <>
      <header className="topbar">
        <div><h1 className="page-title">Settings</h1><p className="page-sub">Manage your account and profile preferences</p></div>
      </header>
      <div className="content-grid" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
        <div className="card">
          <div className="card-head"><h2 className="card-title">Profile</h2></div>
          {profileRows.map(([l,v],i)=>(
            <div key={i} style={{ display:'flex',justifyContent:'space-between',padding:'12px 0',borderBottom:'1px solid var(--royal-border)' }}>
              <span style={{ fontSize:'0.875rem',color:'var(--text-muted)',fontWeight:500 }}>{l}</span>
              <span style={{ fontSize:'0.875rem',color:'var(--text-head)',fontWeight:600 }}>{v}</span>
            </div>
          ))}
        </div>
        <div className="card">
          <div className="card-head"><h2 className="card-title">Change Password</h2></div>
          <div style={{ display: 'grid', gap: 12 }}>
            <PasswordField label="Current Password" value={passwordForm.currentPassword} onChange={(value) => setPasswordForm(prev => ({ ...prev, currentPassword: value }))} />
            <PasswordField label="New Password" value={passwordForm.newPassword} onChange={(value) => setPasswordForm(prev => ({ ...prev, newPassword: value }))} />
            <PasswordField label="Confirm New Password" value={passwordForm.confirmPassword} onChange={(value) => setPasswordForm(prev => ({ ...prev, confirmPassword: value }))} />
            <button className="btn-primary" onClick={updatePassword} disabled={changing} style={{ width: '100%' }}>
              {changing ? 'Updating...' : 'Update Password'}
            </button>
          </div>
        </div>
      </div>
      {statusMsg && (
        <div style={{ marginTop: 14, color: statusMsg.toLowerCase().includes('unable') || statusMsg.toLowerCase().includes('required') || statusMsg.toLowerCase().includes('match') ? 'var(--red)' : 'var(--green)', fontWeight: 600 }}>
          {statusMsg}
        </div>
      )}
    </>
  )
}

function PasswordField({ label, value, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize:'0.875rem', color:'var(--text-muted)', fontWeight:500 }}>{label}</span>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        style={{
          width: '100%',
          border: '1px solid var(--royal-border)',
          borderRadius: 8,
          padding: '8px 10px',
          fontSize: '0.85rem',
          color: 'var(--text-head)',
        }}
      />
    </div>
  )
}
