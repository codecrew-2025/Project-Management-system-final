import { useState, useEffect, useMemo, useRef } from 'react'
import Sidebar from '../components/Sidebar'
import LayoutMenu from '../components/LayoutMenu'
import Modal from '../components/Modal'
import CreateProjectModal from '../components/CreateProjectModal'
import SubmissionModal from '../components/SubmissionModal'
import ProjectCard from '../components/ProjectCard'
import TaskRow from '../components/TaskRow'
import { generateIndividualProjectReportPdf } from '../lib/projectReportPdf'
import {
  getCoordinatorGraph,
  subscribeToTasksAndSubmissions,
  reviewSubmission,
  listSubmissionsByCoordinator,
  createTask,
  addProjectStudent,
  createMeeting,
  updateProjectStudentDriveFolderLink,
  updateProjectDriveLink
} from '../lib/coordinatorApi'
import { getCoordinatorProjectLinks, saveCoordinatorProjectLinks } from '../lib/projectRepositoryStore'
import { changePassword, createManagedUser, fetchProjectReport } from '../lib/api'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import '../assets/dashboard.css'

const navItems = [
  { label: 'Dashboard' },
  { label: 'My Projects' },
  { label: 'Project Links' },
  { label: 'Team members' },
  { label: 'Submissions' },
  { label: 'Analytics' },
  { label: 'Schedule' },
]

function getAssignedOwnerName(task, usersById) {
  return String(usersById?.[task.assigned_student_id]?.name || task.assigned_student_name || task.assigned_student_email || '').trim()
}

function buildProjectReportPayload({ project, modules = [], tasks = [], projectStudents = [], submissions = [], usersById = {} }) {
  const coordinator = usersById?.[project.coordinator_id] ||
    Object.values(usersById || {}).find((user) => String(user.email || '').toLowerCase() === String(project.coordinator_email || '').toLowerCase()) || {}

  const seenTeam = new Set()
  const teamMembers = (Array.isArray(projectStudents) ? projectStudents : []).map((ps) => {
    const user = usersById?.[ps.student_id] || {}
    const name = String(user.name || ps.student_name || ps.student_email || 'Team member').trim()
    const email = String(user.email || ps.student_email || '').trim()
    const role = String(ps.role || 'Member').trim()
    return { key: `${name}|${email}`, name, email, role }
  }).filter((member) => {
    if (!member.name) return false
    if (seenTeam.has(member.key)) return false
    seenTeam.add(member.key)
    return true
  }).map(({ name, email, role }) => ({ name, email, role }))

  const moduleIds = new Set((Array.isArray(modules) ? modules : []).map((m) => String(m.id)))
  const moduleRows = (Array.isArray(modules) ? modules : []).map((module) => {
    const assocTasks = (Array.isArray(tasks) ? tasks : []).filter((task) => String(task.module_id || '') === String(module.id))
    const assignedTo = Array.from(new Set(
      assocTasks.map((task) => getAssignedOwnerName(task, usersById)).filter(Boolean)
    )).join(', ') || 'Unassigned'
    const doneCount = assocTasks.filter((task) => String(task.status || '').toLowerCase() === 'completed').length
    const progress = assocTasks.length ? Math.round((doneCount / assocTasks.length) * 100) : 0
    const status = progress >= 100 ? 'Done' : assocTasks.some((task) => String(task.status || '').toLowerCase().includes('progress')) ? 'Active' : 'Pending'
    return {
      name: String(module.name || module.title || 'Module').trim(),
      assignedTo,
      status,
      progress,
      deadline: module.deadline || module.due_date || module.target_date || '',
    }
  })

  const projectTasks = (Array.isArray(tasks) ? tasks : []).filter((task) =>
    String(task.project_id || '') === String(project.id) || moduleIds.has(String(task.module_id || ''))
  )

  let activities = (Array.isArray(submissions) ? submissions : []).slice(0, 5).map((submission) => ({
    summary: `${String(submission.title || submission.task_name || submission.name || 'Submission')} • ${String(submission.status || 'Pending')}`,
    date: submission.submitted_at || submission.created_at || submission.updated_at || '',
  }))

  if (activities.length === 0) {
    activities = projectTasks
      .slice(0, 5)
      .map((task) => ({
        summary: `${String(task.title || task.name || 'Task')} • ${String(task.status || 'Pending')}`,
        date: task.updated_at || task.created_at || task.deadline || '',
      }))
  }

  const milestones = moduleRows.map((item) => ({
    name: item.name,
    owner: item.assignedTo,
    date: item.deadline,
    progress: item.progress,
  }))

  return {
    project,
    coordinator,
    teamMembers,
    modules: moduleRows,
    milestones,
    activities,
    notes: String(project.client_notes || project.description || project.notes || ''),
    preparedBy: String(coordinator.name || project.coordinator_name || project.coordinator || 'Coordinator'),
    generatedAt: new Date(),
    summary: project.client_notes || project.description || project.summary,
  }
}

export default function CoordinatorDashboard() {
  const [activeNav, setActiveNav] = useState(0)
  const [sidebarMode, setSidebarMode] = useState('expanded')
  
  const [user, setUser] = useState(null)
  const userRef = useRef(null)
  const [graph, setGraph] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const notificationContext = useMemo(() => ({
    coordinator_id: user?.id || '',
    coordinator_email: user?.email || '',
  }), [user?.email, user?.id])
  
  // Modals
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false)
  const [reviewSubmissionData, setReviewSubmissionData] = useState(null) 
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false)
  
  // Toast
  const [toasts, setToasts] = useState([])
  const addToast = (msg) => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, msg }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 4000)
  }

  const previousTeamMembers = useMemo(() => {
    const byEmail = new Map()

    ;(graph?.projectStudents || []).forEach((ps) => {
      const fallbackUser = graph?.usersById?.[String(ps?.student_id || '')] || null
      const email = String(ps?.student_email || fallbackUser?.email || '').trim().toLowerCase()
      if (!email || byEmail.has(email)) return

      byEmail.set(email, {
        name: String(ps?.student_name || fallbackUser?.name || '').trim() || email,
        email,
        roll_no: String(ps?.roll_no || fallbackUser?.roll_no || '').trim(),
        phone: String(ps?.phone || fallbackUser?.phone || '').trim(),
        module_name: String(ps?.module_name || '').trim(),
      })
    })

    Object.values(graph?.usersById || {}).forEach((userRecord) => {
      if (String(userRecord?.role || '').toLowerCase() !== 'student') return
      const email = String(userRecord?.email || '').trim().toLowerCase()
      if (!email || byEmail.has(email)) return

      byEmail.set(email, {
        name: String(userRecord?.name || '').trim() || email,
        email,
        roll_no: String(userRecord?.roll_no || '').trim(),
        phone: String(userRecord?.phone || '').trim(),
        module_name: '',
      })
    })

    return Array.from(byEmail.values())
  }, [graph])

  const resolveReviewSubmission = (submission) => {
    if (!submission) return null

    const task = graph?.tasks?.find((t) => String(t?.id || '') === String(submission?.task_id || '')) || null
    const module = graph?.modules?.find((m) => String(m?.id || '') === String(task?.module_id || submission?.module_id || '')) || null
    const project =
      graph?.projects?.find((p) => String(p?.id || '') === String(module?.project_id || submission?.project_id || '')) || null

    const student =
      graph?.usersById?.[String(submission?.student_id || '')] ||
      (submission?.student_email
        ? Object.values(graph?.usersById || {}).find((u) => String(u?.email || '').toLowerCase() === String(submission.student_email).toLowerCase())
        : null) ||
      null

    return {
      ...submission,
      task_title: task?.title || submission?.task || submission?.title || 'Submission',
      module_name: module?.name || submission?.module_name || '—',
      project_title: project?.title || submission?.project_title || '—',
      student_name: student?.name || submission?.student_name || submission?.student_email || 'Team member',
      student_note: submission?.student_note || submission?.note || '—',
      drive_link: submission?.drive_link || submission?.pr_link || submission?.github_link || '',
    }
  }

  const fetchGraph = async (userId, userEmail, userName) => {
    try {
      const email = userEmail || userRef.current?.email
      const name = userName || userRef.current?.name
      console.log('[fetchGraph] userId:', userId, 'email:', email, 'name:', name)
      const data = await getCoordinatorGraph(userId, email, name)
      console.log('[fetchGraph] result projects:', data?.projects?.length, data?.projects)
      setGraph(data)
    } catch (e) {
      console.error('[fetchGraph] error:', e)
      setError('Failed to load dashboard data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const userStr = sessionStorage.getItem('pf_user') || localStorage.getItem('pf_user')
    if (userStr) {
      const u = JSON.parse(userStr)
      userRef.current = u
      setUser(u)
      fetchGraph(u.id, u.email, u.name)
    } else {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!user) return
    const unsub = subscribeToTasksAndSubmissions({
      onTaskChange: (payload) => {
        const t = payload.new || payload.old
        if (t) {
          addToast('A task status changed.')
          fetchGraph(user.id, user.email, user.name)
        }
      },
      onSubmissionChange: (payload) => {
        const s = payload.new || payload.old
        if (s) {
          addToast('A new submission was uploaded or reviewed.')
          fetchGraph(user.id, user.email, user.name)
        }
      }
    })
    return () => unsub()
  }, [user])

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 40, height: 40, border: '4px solid var(--royal-faint)', borderTop: '4px solid var(--royal)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: 40, color: 'var(--red)', fontWeight: 700, textAlign: 'center', marginTop: '10vh' }}>
        <h2>{error}</h2>
        <p style={{ color: 'var(--text-hint)', fontWeight: 400, marginTop: 10, marginBottom: 30 }}>
          Your session might be using an old cached ID. Please log out and log back in.
        </p>
        <button 
          onClick={() => {
            sessionStorage.removeItem('pf_user')
            localStorage.removeItem('pf_user')
            window.location.href = '/'
          }}
          className="btn btn-primary"
        >
          Clear Session & Log Out
        </button>
      </div>
    )
  }

  return (
    <div data-role="coordinator" style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar
        mode={sidebarMode}
        role="coordinator"
        userName={user?.name || 'Coordinator'}
        userInitials={(user?.name || 'C').charAt(0).toUpperCase()}
        userSub={user?.email || ''}
        navItems={navItems}
        activeNav={activeNav}
        onNavChange={setActiveNav}
        onToggleMode={() => setSidebarMode(prev => prev === 'mini' ? 'expanded' : 'mini')}
        notificationContext={notificationContext}
      />
      <main className="main-content" style={{ position: 'relative' }}>
        
        {toasts.length > 0 && (
          <div style={{ position: 'absolute', top: 20, right: 20, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {toasts.map(t => (
              <div key={t.id} style={{ background: 'var(--royal-dark)', color: '#fff', padding: '12px 20px', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', animation: 'fadeSlideUp 0.3s ease-out', fontWeight: 600, fontSize: '0.9rem' }}>
                {t.msg}
              </div>
            ))}
          </div>
        )}

        {activeNav === 0 && <CoordOverview graph={graph} openCreateProject={() => setIsCreateProjectOpen(true)} openSchedule={() => setScheduleModalOpen(true)} sidebarMode={sidebarMode} setSidebarMode={setSidebarMode} openReview={(sub) => setReviewSubmissionData(resolveReviewSubmission(sub))} />}
        {activeNav === 1 && <CoordProjects graph={graph} refetch={() => fetchGraph(user.id, user.email, user.name)} openCreateProject={() => setIsCreateProjectOpen(true)} openReview={(sub) => setReviewSubmissionData(resolveReviewSubmission(sub))} />}
        {activeNav === 2 && <CoordProjectDrives graph={graph} refetch={() => fetchGraph(user.id, user.email, user.name)} />}
        {activeNav === 3 && <CoordStudents graph={graph} />}
        {activeNav === 4 && (
          <CoordSubmissions
            coordinatorId={user?.id}
            coordinatorEmail={user?.email}
            coordinatorName={user?.name}
            graph={graph}
            openReview={(sub) => setReviewSubmissionData(resolveReviewSubmission(sub))}
            onQuickReview={async (payload) => {
              await reviewSubmission(payload)
              addToast('Submission updated!')
              fetchGraph(user.id, user.email, user.name)
            }}
          />
        )}
        {activeNav === 5 && <CoordAnalytics graph={graph} />}
        {activeNav === 6 && <CoordSchedule graph={graph} openSchedule={() => setScheduleModalOpen(true)} />}
        {activeNav === 7 && <CoordSettings user={user} refetch={() => fetchGraph(user.id, user.email, user.name)} />}
      </main>

      <CreateProjectModal
        isOpen={isCreateProjectOpen}
        coordinator={user}
        coordinatorId={user?.id}
        previousTeamMembers={previousTeamMembers}
        onClose={() => setIsCreateProjectOpen(false)}
        onCreated={() => {
          addToast('Project created successfully!')
          fetchGraph(user.id, user.email, user.name)
          // Re-fetch after a short delay to ensure backend writes are visible in the graph
          setTimeout(() => fetchGraph(user.id, user.email, user.name), 1500)
        }}
      />

      {reviewSubmissionData && (
        <SubmissionModal
          isOpen={!!reviewSubmissionData}
          submission={reviewSubmissionData}
          task={graph.tasks.find(t => String(t.id) === String(reviewSubmissionData.task_id)) || { title: reviewSubmissionData.task_title }}
          student={graph.usersById[reviewSubmissionData.student_id] || { name: reviewSubmissionData.student_name }}
          module={graph.modules.find(m => String(m.id) === String(reviewSubmissionData.module_id)) || { name: reviewSubmissionData.module_name }}
          project={graph.projects.find(p => String(p.id) === String(reviewSubmissionData.project_id)) || { title: reviewSubmissionData.project_title }}
          onClose={() => setReviewSubmissionData(null)}
          onReview={async (payload) => {
            await reviewSubmission(payload)
            addToast('Submission reviewed!')
            fetchGraph(user.id, user.email, user.name)
          }}
        />
      )}

      {scheduleModalOpen && (
        <ScheduleModal
          isOpen={scheduleModalOpen}
          onClose={() => setScheduleModalOpen(false)}
          coordinatorId={user?.id}
          projects={graph?.projects}
          onScheduled={() => {
            addToast('Review scheduled!')
            fetchGraph(user.id, user.email, user.name)
          }}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// 2. Project Links
// ─────────────────────────────────────────────────────────────
function CoordProjectDrives({ graph, refetch }) {
  const [drafts, setDrafts] = useState({})
  const [savingProjectId, setSavingProjectId] = useState(null)
  const projects = Array.isArray(graph?.projects) ? graph.projects : []

  useEffect(() => {
    const nextDrafts = {}
    projects.forEach((project) => {
      const localLinks = getCoordinatorProjectLinks({ id: project.id, title: project.title })
      nextDrafts[project.id] = {
        project_title: String(localLinks?.project_title || project?.title || ''),
        google_drive_link: String(localLinks?.google_drive_link || ''),
        main_project_drive_link: String(localLinks?.main_project_drive_link || project?.drive_folder_link || ''),
        shared_folder_link: String(localLinks?.shared_folder_link || ''),
        reference_materials_link: String(localLinks?.reference_materials_link || ''),
      }
    })
    setDrafts(nextDrafts)
  }, [projects])

  const handleSaveLinks = async (project) => {
    const nextDraft = drafts[project.id] || {}
    setSavingProjectId(project.id)
    try {
      saveCoordinatorProjectLinks(
        { id: project.id, title: project.title },
        {
          project_title: nextDraft.project_title,
          google_drive_link: nextDraft.google_drive_link,
          main_project_drive_link: nextDraft.main_project_drive_link,
          shared_folder_link: nextDraft.shared_folder_link,
          reference_materials_link: nextDraft.reference_materials_link,
        }
      )

      // Keep existing project drive field in sync for legacy project cards.
      await updateProjectDriveLink({
        project_id: project.id,
        drive_folder_link: String(nextDraft.main_project_drive_link || '').trim(),
      })
      await refetch?.()
    } finally {
      setSavingProjectId(null)
    }
  }

  return (
    <div style={{ padding: '0 20px 40px', overflowY: 'auto', height: '100%' }}>
      <header className="topbar" style={{ padding: '24px 0 16px', background: 'transparent' }}>
        <div>
          <h1 className="page-title">Project Links</h1>
          <p className="page-sub">Create and manage coordinator-owned project resource links visible to all assigned team members.</p>
        </div>
      </header>

      {projects.length === 0 && (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          No projects found.
        </div>
      )}

      <div style={{ display: 'grid', gap: 16 }}>
        {projects.map((project) => {
          const projectDraft = drafts[project.id] || {}
          return (
            <div key={project.id} className="card" style={{ border: '1px solid var(--royal-border)' }}>
              <div className="card-head" style={{ marginBottom: 14 }}>
                <div>
                  <h2 className="card-title" style={{ marginBottom: 6 }}>{project.title}</h2>
                  <span className={`badge ${project.status === 'completed' ? 'badge-green' : 'badge-amber'}`}>
                    {String(project.status || 'active').toUpperCase()}
                  </span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(260px, 1fr))', gap: 14 }}>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>Project Title</span>
                  <input
                    value={projectDraft.project_title || ''}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [project.id]: { ...(prev[project.id] || {}), project_title: e.target.value } }))}
                    placeholder="Project title"
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--royal-border)' }}
                  />
                </label>

                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>Google Drive Link</span>
                  <input
                    value={projectDraft.google_drive_link || ''}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [project.id]: { ...(prev[project.id] || {}), google_drive_link: e.target.value } }))}
                    placeholder="https://drive.google.com/..."
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--royal-border)' }}
                  />
                </label>

                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>Shared Folder Link</span>
                  <input
                    value={projectDraft.shared_folder_link || ''}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [project.id]: { ...(prev[project.id] || {}), shared_folder_link: e.target.value } }))}
                    placeholder="https://drive.google.com/drive/folders/..."
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--royal-border)' }}
                  />
                </label>

                <label style={{ display: 'grid', gap: 6, gridColumn: '1 / -1' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>Reference Materials Link</span>
                  <input
                    value={projectDraft.reference_materials_link || ''}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [project.id]: { ...(prev[project.id] || {}), reference_materials_link: e.target.value } }))}
                    placeholder="https://docs.google.com/..."
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--royal-border)' }}
                  />
                </label>
              </div>

              <div style={{ marginTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {projectDraft.google_drive_link && <button type="button" onClick={() => openExternalLink(projectDraft.google_drive_link)} className="btn-outline" style={{ padding: '6px 10px' }}>Open Google Drive</button>}
                </div>
                <button className="btn-primary" type="button" onClick={() => handleSaveLinks(project)} disabled={savingProjectId === project.id}>
                  {savingProjectId === project.id ? 'Saving…' : 'Save Project Links'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// 0. Overview
// ─────────────────────────────────────────────────────────────
function CoordOverview({ graph, openCreateProject, openSchedule, sidebarMode, setSidebarMode, openReview }) {
  const kpis = useMemo(() => {
    const totalProjects = graph.projects.length
    const totalStudents = new Set(graph.projectStudents.map(ps => ps.student_id)).size
    const pendingSubmissions = graph.submissions.filter(s => s.review_status === 'pending').length
    
    let totalTasks = graph.tasks.length
    let completedTasks = graph.tasks.filter(t => t.status === 'completed').length
    const avgComp = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

    return [
      { label: 'Total Projects', value: totalProjects, icon: '📂', bg: '#EBF5FB', color: '#2E86C1' },
      { label: 'Total Team Members', value: totalStudents, icon: '🎓', bg: '#E9F7EF', color: '#1E8449' },
      { label: 'Pending Reviews', value: pendingSubmissions, icon: '⏳', bg: '#FEF9E7', color: '#D4AC0D' },
      { label: 'Avg Completion', value: `${avgComp}%`, icon: '📊', bg: '#F5EEF8', color: '#7D3C98' },
    ]
  }, [graph])

  const recentActivity = useMemo(() => {
    const acts = []

    ;(graph.activities || []).forEach((a, index) => {
      const ts = typeof a?.time === 'number' ? a.time : new Date(a?.time || Date.now()).getTime()
      acts.push({
        id: String(a?.id || `a-${index}`),
        student: String(a?.student || 'System'),
        action: String(a?.action || 'updated'),
        task: String(a?.task || 'Activity'),
        time: Number.isFinite(ts) ? ts : Date.now(),
        isNew: a?.isNew !== false,
      })
    })

    graph.tasks.filter(t => t.status === 'completed').forEach(t => {
      const student = graph.usersById[t.assigned_student_id]?.name || 'Team member'
      acts.push({ id: `t-${t.id}`, student, action: 'completed task', task: t.title, time: new Date(t.created_at).getTime(), isNew: true })
    })
    graph.submissions.forEach(s => {
      const student = graph.usersById[s.student_id]?.name || 'Team member'
      const t = graph.tasks.find(tx => tx.id === s.task_id)
      acts.push({ id: `s-${s.id}`, student, action: 'uploaded submission for', task: t?.title || 'Task', time: new Date(s.submitted_at).getTime(), isNew: false })
    })
    return acts.sort((a,b) => b.time - a.time).slice(0, 10)
  }, [graph])

  const pendingList = useMemo(() => {
    return graph.submissions.filter(s => s.review_status === 'pending')
      .sort((a,b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime())
      .slice(0, 5)
  }, [graph])

  const donutData = useMemo(() => {
    const counts = { Pending: 0, 'In Progress': 0, Completed: 0, Rejected: 0 }
    graph.tasks.forEach(t => {
      if (t.status === 'completed') counts.Completed++
      else if (t.status === 'rejected') counts.Rejected++
      else if (t.status === 'in_progress') counts['In Progress']++
      else counts.Pending++
    })
    return [
      { name: 'Pending', value: counts.Pending, fill: '#E5E7EB' },
      { name: 'In Progress', value: counts['In Progress'], fill: '#F59E0B' },
      { name: 'Completed', value: counts.Completed, fill: '#10B981' },
      { name: 'Rejected', value: counts.Rejected, fill: '#EF4444' },
    ].filter(d => d.value > 0)
  }, [graph])

  const barData = useMemo(() => {
    return graph.projects.map(p => {
      const mods = graph.modules.filter(m => m.project_id === p.id).map(m => m.id)
      const modSet = new Set(mods.map(String))
      const pTasks = graph.tasks.filter(
        (t) => modSet.has(String(t.module_id || '')) || String(t.project_id || '') === String(p.id)
      )
      const completed = pTasks.filter(t => t.status === 'completed').length
      const pct = pTasks.length ? Math.round((completed / pTasks.length) * 100) : 0
      return { name: p.title.substring(0,10)+'...', completion: pct }
    })
  }, [graph])

  const statusProjectDetails = useMemo(() => {
    const buckets = {
      Pending: [],
      'In Progress': [],
      Completed: [],
      Rejected: [],
    }

    graph.projects.forEach((project) => {
      const projectModuleIds = new Set(
        graph.modules
          .filter((moduleItem) => String(moduleItem.project_id || '') === String(project.id))
          .map((moduleItem) => String(moduleItem.id))
      )

      const projectTasks = graph.tasks.filter((task) => {
        const byProject = String(task.project_id || '') === String(project.id)
        const byModule = projectModuleIds.has(String(task.module_id || ''))
        return byProject || byModule
      })

      const counts = {
        Pending: 0,
        'In Progress': 0,
        Completed: 0,
        Rejected: 0,
      }

      projectTasks.forEach((task) => {
        const status = String(task.status || '').toLowerCase()
        if (status === 'completed') counts.Completed += 1
        else if (status === 'in_progress') counts['In Progress'] += 1
        else if (status === 'rejected') counts.Rejected += 1
        else counts.Pending += 1
      })

      Object.entries(counts).forEach(([statusName, statusCount]) => {
        if (statusCount > 0) {
          buckets[statusName].push({
            id: project.id,
            title: project.title || 'Untitled Project',
            statusCount,
            totalTasks: projectTasks.length,
          })
        }
      })
    })

    Object.values(buckets).forEach((list) => list.sort((a, b) => a.title.localeCompare(b.title)))
    return buckets
  }, [graph])

  const renderTaskStatusTooltip = ({ active, payload }) => {
    if (!active || !payload || payload.length === 0) return null

    const current = payload[0]?.payload || {}
    const statusName = String(current.name || '')
    const count = Number(current.value || 0)
    const projects = statusProjectDetails[statusName] || []

    return (
      <div style={{ background: '#fff', borderRadius: 10, boxShadow: '0 4px 12px rgba(9,30,66,0.15)', border: '1px solid var(--royal-border)', padding: '10px 12px', minWidth: 220 }}>
        <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-head)', marginBottom: 6 }}>{statusName}: {count}</div>
        {projects.length === 0 ? (
          <div style={{ fontSize: '0.78rem', color: 'var(--text-hint)' }}>No projects found.</div>
        ) : (
          <div style={{ display: 'grid', gap: 6 }}>
            {projects.map((item) => (
              <div key={`${statusName}-${item.id}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                <span style={{ color: 'var(--text-head)', fontWeight: 700 }}>{item.title}</span>
                <span>{item.statusCount}/{item.totalTasks}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ padding: '0 20px 40px', overflowY: 'auto', height: '100%' }}>
      <header className="topbar" style={{ padding: '24px 0 16px', background: 'transparent' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {sidebarMode === 'hidden' && (
             <div className="logo-icon" style={{ cursor: 'pointer' }} onClick={() => setSidebarMode('expanded')}>
                <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: 32, height: 32 }}><path d="M10 6C10 4.89543 10.8954 4 12 4H22C23.1046 4 24 4.89543 24 6V11C24 12.1046 23.1046 13 22 13H12C10.8954 13 10 12.1046 10 11V6Z" fill="var(--royal)"/><path d="M10 16C10 14.8954 10.8954 14 12 14H17C18.1046 14 19 14.8954 19 16V26C19 27.1046 18.1046 28 17 28H12C10.8954 28 10 27.1046 10 26V16Z" fill="var(--royal)" fillOpacity="0.6"/><circle cx="23" cy="21" r="5" fill="var(--royal)" fillOpacity="0.4" /></svg>
             </div>
          )}
          <div>
            <h1 className="page-title">Dashboard Overview</h1>
            <p className="page-sub">Welcome back, Coordinator. Here is what is happening today.</p>
          </div>
        </div>
        <div className="topbar-actions">
          <button className="btn-outline" onClick={openSchedule}>
             Schedule Review
          </button>
          <button className="btn-primary" onClick={openCreateProject}>
             Create Project
          </button>
          <LayoutMenu sidebarMode={sidebarMode} setSidebarMode={setSidebarMode} />
        </div>
      </header>

      <section className="kpi-grid">
        {kpis.map((k, i) => (
          <div className="kpi-card" key={i}>
            <div className="kpi-icon" style={{ background: k.bg, color: k.color }}>{k.icon}</div>
            <div className="kpi-body">
              <span className="kpi-label">{k.label}</span>
              <span className="kpi-value">{k.value}</span>
            </div>
          </div>
        ))}
      </section>

      <div className="content-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        
        {/* Activity & Pending */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div className="card">
            <div className="card-head"><h2 className="card-title">Recent Activity</h2></div>
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {recentActivity.length === 0 && <li style={{ color: 'var(--text-hint)' }}>No recent activity.</li>}
              {recentActivity.map((r, i) => (
                <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--royal-border)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: r.isNew ? 'var(--green)' : 'var(--amber)', flexShrink: 0 }}></span>
                  <div style={{ flex: 1 }}>
                    <strong style={{ display: 'block', fontSize: '0.9rem', color: 'var(--text-head)' }}>{r.student}</strong>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{r.action} <strong>{r.task}</strong></span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Pending Submissions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div className="card">
             <div className="card-head">
                <h2 className="card-title">Pending Submissions</h2>
                {pendingList.length > 0 && <span className="badge badge-amber">{pendingList.length}</span>}
             </div>
             <ul style={{ listStyle: 'none', padding: 0 }}>
                {pendingList.length === 0 && <li style={{ color: 'var(--text-hint)' }}>All caught up!</li>}
                {pendingList.map(s => {
                  const student = graph.usersById[s.student_id]?.name || 'Student'
                  const t = graph.tasks.find(tx => tx.id === s.task_id)
                  return (
                    <li key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--royal-border)' }}>
                      <div>
                        <strong style={{ display: 'block', fontSize: '0.9rem', color: 'var(--text-head)' }}>{student}</strong>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t?.title}</span>
                      </div>
                      <button className="btn-outline" style={{ padding: '4px 10px', fontSize: '0.75rem' }} onClick={() => openReview(s)}>Review</button>
                    </li>
                  )
                })}
             </ul>
          </div>
        </div>

        {/* Charts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div className="card">
            <div className="card-head"><h2 className="card-title">Overall Task Status</h2></div>
            <div style={{ height: 200, width: '100%', marginTop: 10 }}>
              {donutData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={donutData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2} dataKey="value" stroke="none">
                      {donutData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.fill}
                          style={{ cursor: 'pointer' }}
                        />
                      ))}
                    </Pie>
                    <Tooltip content={renderTaskStatusTooltip} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ textAlign: 'center', color: 'var(--text-hint)', paddingTop: 40 }}>No tasks data available</div>
              )}
            </div>
          </div>
          
          <div className="card">
            <div className="card-head"><h2 className="card-title">Project Progress</h2></div>
            <div style={{ height: 200, width: '100%', marginTop: 10 }}>
              {barData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--royal-border)" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                    <Tooltip cursor={{ fill: 'var(--royal-faint)' }} contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                    <Bar dataKey="completion" fill="var(--royal)" radius={[4,4,0,0]} barSize={24} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ textAlign: 'center', color: 'var(--text-hint)', paddingTop: 40 }}>No project data available</div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// 1. My Projects
// ─────────────────────────────────────────────────────────────
function CoordProjects({ graph, refetch, openCreateProject, openReview }) {
  const [selectedProjectId, setSelectedProjectId] = useState(null)
  const [reportLoadingProjectId, setReportLoadingProjectId] = useState(null)
  const [reportToast, setReportToast] = useState(null)

  const projectsWithStats = useMemo(() => {
    return graph.projects.map(p => {
      const pStudents = graph.projectStudents.filter(ps => ps.project_id === p.id).length
      const mods = graph.modules.filter(m => m.project_id === p.id).map(m => m.id)
      const modSet = new Set(mods.map(String))
      const pTasks = graph.tasks.filter(
        (t) => modSet.has(String(t.module_id || '')) || String(t.project_id || '') === String(p.id)
      )
      const completed = pTasks.filter(t => t.status === 'completed').length
      const pct = pTasks.length > 0 ? Math.round((completed / pTasks.length) * 100) : 0
      return { ...p, stats: { completionPercent: pct, studentCount: pStudents, totalTasks: pTasks.length } }
    })
  }, [graph])

  const downloadProjectReport = async (project, options = {}) => {
    if (!project) return
    const format = String(options.format || 'pdf').toLowerCase()
    setReportLoadingProjectId(project.id)
    setReportToast(null)

    try {
      const payload = await fetchProjectReport(project.id)
      const reportPayload = buildProjectReportPayload(payload)

      if (format === 'pdf') {
        generateIndividualProjectReportPdf(reportPayload)
        setReportToast(`Download started for ${project.title}.`)
      } else if (format === 'csv') {
        const csv = convertReportToCSV(payload)
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
        const link = document.createElement('a')
        link.href = URL.createObjectURL(blob)
        link.setAttribute('download', `${project.title.replace(/[^a-z0-9]+/gi, '_')}_Report.csv`)
        document.body.appendChild(link)
        link.click()
        link.remove()
        setReportToast('CSV download started.')
      } else if (format === 'excel') {
        try {
          const XLSXMod = await import('xlsx')
          const XLSX = XLSXMod.default || XLSXMod
          const wb = XLSX.utils.book_new()
          const rows = convertProjectReportToSheetRows(payload)
          const ws = XLSX.utils.json_to_sheet(rows)
          XLSX.utils.book_append_sheet(wb, ws, 'Project Summary')
          XLSX.writeFile(wb, `${project.title.replace(/[^a-z0-9]+/gi, '_')}_Report.xlsx`)
          setReportToast('Excel download started.')
        } catch (err) {
          console.error('Excel export failed:', err)
          setReportToast('Excel export failed — dependency missing.')
        }
      }
    } catch (error) {
      console.error(error)
      setReportToast(`Unable to generate report: ${String(error?.message || error)}`)
    } finally {
      setReportLoadingProjectId(null)
      window.setTimeout(() => setReportToast(null), 3200)
    }
  }

  if (selectedProjectId) {
    const p = projectsWithStats.find(x => x.id === selectedProjectId)
    if (!p) return <div onClick={() => setSelectedProjectId(null)}>Project not found. Back</div>
    return <ProjectDetail graph={graph} project={p} onBack={() => setSelectedProjectId(null)} refetch={refetch} openReview={openReview} />
  }

  return (
    <div style={{ padding: '0 20px 40px', overflowY: 'auto', height: '100%' }}>
      <header className="topbar" style={{ padding: '24px 0 16px', background: 'transparent' }}>
        <div><h1 className="page-title">My Projects</h1><p className="page-sub">Manage and track your assigned team member projects</p></div>
        <div className="topbar-actions">
          <button className="btn-primary" onClick={openCreateProject}>
            + Create Project
          </button>
        </div>
      </header>
      {reportToast && (
        <div style={{ marginBottom: 16, padding: '12px 16px', background: '#E0F2FE', border: '1px solid #7DD3FC', borderRadius: 10, color: '#0369A1' }}>
          {reportToast}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {projectsWithStats.length === 0 && <div style={{ color: 'var(--text-hint)', textAlign: 'center', padding: 40 }}>You have no active projects.</div>}
        {projectsWithStats.map(p => (
          <ProjectCard
            key={p.id}
            project={p}
            stats={p.stats}
            onClick={(proj) => setSelectedProjectId(proj.id)}
            onDownloadReport={downloadProjectReport}
            loadingProjectId={reportLoadingProjectId}
          />
        ))}
      </div>
    </div>
  )
}

function ProjectDetail({ graph, project, onBack, refetch, openReview }) {
  const [tab, setTab] = useState('Modules') // Modules | Team members | Submissions | Analytics
  const [addTaskModalData, setAddTaskModalData] = useState(null) // module object
  const [driveLinkError, setDriveLinkError] = useState('')
  const [newStudentName, setNewStudentName] = useState('')
  const [newStudentEmail, setNewStudentEmail] = useState('')
  const [newStudentRollNo, setNewStudentRollNo] = useState('')
  const [newStudentPhone, setNewStudentPhone] = useState('')
  const [newStudentModule, setNewStudentModule] = useState('')
  const [addingStudent, setAddingStudent] = useState(false)
  const [addStudentError, setAddStudentError] = useState('')
  const [tempAssignableStudents, setTempAssignableStudents] = useState([])
  const [reportLoading, setReportLoading] = useState(false)
  const [reportToast, setReportToast] = useState(null)

  const downloadProjectReport = async (opts = {}) => {
    if (reportLoading) return
    const format = String(opts.format || 'pdf').toLowerCase()
    setReportLoading(true)
    setReportToast(null)

    try {
      const payload = await fetchProjectReport(project.id)
      const reportPayload = buildProjectReportPayload(payload)

      if (format === 'pdf') {
        generateIndividualProjectReportPdf(reportPayload)
        setReportToast('Project report download has started.')
      } else if (format === 'csv') {
        const csv = convertReportToCSV(payload)
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
        const link = document.createElement('a')
        link.href = URL.createObjectURL(blob)
        link.setAttribute('download', `${project.title.replace(/[^a-z0-9]+/gi, '_')}_Report.csv`)
        document.body.appendChild(link)
        link.click()
        link.remove()
        setReportToast('CSV download started.')
      } else if (format === 'excel') {
        try {
          const XLSXMod = await import('xlsx')
          const XLSX = XLSXMod.default || XLSXMod
          const wb = XLSX.utils.book_new()
          const rows = convertProjectReportToSheetRows(payload)
          const ws = XLSX.utils.json_to_sheet(rows)
          XLSX.utils.book_append_sheet(wb, ws, 'Project Summary')
          XLSX.writeFile(wb, `${project.title.replace(/[^a-z0-9]+/gi, '_')}_Report.xlsx`)
          setReportToast('Excel download started.')
        } catch (err) {
          console.error('Excel export failed:', err)
          setReportToast('Excel export failed — dependency missing.')
        }
      }
    } catch (error) {
      console.error(error)
      setReportToast(`Unable to generate report: ${String(error?.message || error)}`)
    } finally {
      setReportLoading(false)
      window.setTimeout(() => setReportToast(null), 3200)
    }
  }

  const projectAssignableStudents = useMemo(() => {
    const seen = new Set()
    const projectTitleById = new Map((graph.projects || []).map((p) => [String(p.id), String(p.title || 'Project')]))

    const fromProject = graph.projectStudents
      .filter((ps) => String(ps.project_id) === String(project.id))
      .map((ps) => {
        const user = graph.usersById[ps.student_id] || {}
        const studentId = String(ps.student_id || '')
        const studentEmail = String(ps.student_email || user.email || '').trim().toLowerCase()
        return {
          student_id: studentId,
          student_email: studentEmail,
          name: String(user.name || ps.student_name || studentEmail || 'Team member').trim(),
          roll_no: String(user.roll_no || ps.roll_no || '').trim(),
          module_name: String(ps.module_name || '').trim(),
          source: 'project',
        }
      })
      .filter((student) => {
        if (!student.student_id || seen.has(student.student_id)) return false
        seen.add(student.student_id)
        return true
      })

    const fromCoordinatorProjects = graph.projectStudents
      .filter((ps) => String(ps.project_id) !== String(project.id))
      .map((ps) => {
        const user = graph.usersById[ps.student_id] || {}
        const studentId = String(ps.student_id || '')
        const studentEmail = String(ps.student_email || user.email || '').trim().toLowerCase()
        return {
          student_id: studentId,
          student_email: studentEmail,
          name: String(user.name || ps.student_name || studentEmail || 'Team member').trim(),
          roll_no: String(user.roll_no || ps.roll_no || '').trim(),
          module_name: String(ps.module_name || '').trim(),
          source: 'coordinator',
          source_project_title: projectTitleById.get(String(ps.project_id || '')) || 'Other Project',
        }
      })
      .filter((student) => {
        if (!student.student_id || seen.has(student.student_id)) return false
        seen.add(student.student_id)
        return true
      })

    const projectTaskStudents = graph.tasks
      .filter((task) => String(task.project_id || '') === String(project.id))
      .map((task) => {
        const email = String(task.assigned_student_email || '').trim().toLowerCase()
        const id = String(task.assigned_student_id || localStudentIdFromEmail(email)).trim()
        const user = graph.usersById[id] || (email ? Object.values(graph.usersById || {}).find((u) => String(u?.email || '').toLowerCase() === email) : null) || {}

        return {
          student_id: id,
          student_email: email,
          name: String(user.name || email || 'Team member').trim(),
          roll_no: String(user.roll_no || '').trim(),
          module_name: '',
          source: 'tasks',
        }
      })
      .filter((student) => {
        const id = String(student?.student_id || '').trim()
        if (!id || seen.has(id)) return false
        seen.add(id)
        return true
      })

    const fromTemp = (Array.isArray(tempAssignableStudents) ? tempAssignableStudents : []).filter((student) => {
      const id = String(student?.student_id || '').trim()
      if (!id || seen.has(id)) return false
      seen.add(id)
      return true
    })

    return [...fromProject, ...fromCoordinatorProjects, ...projectTaskStudents, ...fromTemp]
  }, [graph, project.id, tempAssignableStudents])

  const localStudentIdFromEmail = (email) => `student-${String(email || '').trim().toLowerCase().replace(/[^a-z0-9]+/gi, '-')}`

  // Modules Data
  const modules = useMemo(() => graph.modules.filter(m => m.project_id === project.id).sort((a,b) => a.order_index - b.order_index), [graph, project])
  
  // Tasks map per module
  const tasksByModule = useMemo(() => {
    const map = {}
    modules.forEach(m => {
      map[m.id] = graph.tasks.filter(t => t.module_id === m.id)
    })
    return map
  }, [graph, modules])

  const directProjectTasks = useMemo(() => {
    const moduleIdSet = new Set(modules.map((m) => String(m.id)))
    return graph.tasks.filter((task) => {
      const byProject = String(task.project_id || '') === String(project.id)
      const inKnownModule = moduleIdSet.has(String(task.module_id || ''))
      return byProject && !inKnownModule
    })
  }, [graph, modules, project])

  // Team members Data
  const projectStudents = useMemo(() => {
    const moduleIdSet = new Set(modules.map((m) => String(m.id)))

    return graph.projectStudents.filter(ps => ps.project_id === project.id).map(ps => {
      const stu = graph.usersById[ps.student_id]
      const sTasks = graph.tasks.filter((t) => {
        const byModule = moduleIdSet.has(String(t.module_id || ''))
        const byProject = String(t.project_id || '') === String(project.id)
        const assignedToStudent = String(t.assigned_student_id || '') === String(ps.student_id)
        return assignedToStudent && (byModule || byProject)
      })
      const completed = sTasks.filter(t => t.status === 'completed').length
      const prog = sTasks.length ? Math.round((completed / sTasks.length) * 100) : 0
      return { 
        id: ps.student_id, 
        name: stu?.name, 
        rollNo: stu?.roll_no || '—', 
        role: ps.role || 'Member',
        tasksTotal: sTasks.length,
        tasksDone: completed,
        progress: prog,
        drive_folder_link: ps.drive_folder_link
      }
    })
  }, [graph, project, modules])

  // Submissions Data
  const projectSubmissions = useMemo(() => {
    const pTaskIds = new Set(
      graph.tasks
        .filter((t) => String(t.project_id || '') === String(project.id) || modules.some((m) => String(m.id) === String(t.module_id || '')))
        .map((t) => String(t.id))
    )
    return graph.submissions.filter((s) => pTaskIds.has(String(s.task_id || '')))
  }, [graph, tasksByModule])

  // Analytics Data
  const barData = projectStudents.map(s => ({ name: s.name.split(' ')[0], completed: s.tasksDone }))
  const donutData = useMemo(() => {
    const moduleIdSet = new Set(modules.map((m) => String(m.id)))
    const projectTasks = graph.tasks.filter((task) => {
      const byModule = moduleIdSet.has(String(task.module_id || ''))
      const byProject = String(task.project_id || '') === String(project.id)
      return byModule || byProject
    })

    const counts = { Pending: 0, 'In Progress': 0, Completed: 0, Rejected: 0 }
    projectTasks.forEach((task) => {
      const status = String(task.status || '').trim().toLowerCase()
      if (status === 'completed') counts.Completed++
      else if (status === 'rejected') counts.Rejected++
      else if (status === 'in_progress' || status === 'in progress') counts['In Progress']++
      else counts.Pending++
    })
    return [
      { name: 'Pending', value: counts.Pending, fill: '#E5E7EB' },
      { name: 'In Progress', value: counts['In Progress'], fill: '#F59E0B' },
      { name: 'Completed', value: counts.Completed, fill: '#10B981' },
      { name: 'Rejected', value: counts.Rejected, fill: '#EF4444' },
    ].filter(d => d.value > 0)
  }, [graph.tasks, modules, project.id])

  // Create module task function
  const handleAddTask = async (e) => {
    e.preventDefault()
    const fd = new FormData(e.target)
    const assignedStudentId = String(fd.get('assigned_student_id') || '').trim()
    const assignedStudent = projectAssignableStudents.find((student) => String(student.student_id) === assignedStudentId)
    const assignedStudentEmail = assignedStudent?.student_email || null

    await createTask({
      module_id: addTaskModalData.id,
      project_id: project.id,
      title: fd.get('title'),
      description: fd.get('description'),
      assigned_student_id: assignedStudentId,
      assigned_student_email: assignedStudentEmail,
      deadline: fd.get('deadline'),
    })
    setAddTaskModalData(null)
    refetch()
  }

  const handleSetDriveFolderLink = async (student) => {
    setDriveLinkError('')
    const next = window.prompt('Paste the Google Drive folder link for this student:', student?.drive_folder_link || '')
    if (next === null) return

    try {
      await updateProjectStudentDriveFolderLink({
        project_id: project.id,
        student_id: student.id,
        drive_folder_link: String(next || '').trim(),
      })
      refetch()
    } catch (e) {
      setDriveLinkError(e?.message || 'Unable to update drive folder link.')
    }
  }

  const handleAddProjectStudent = async () => {
    setAddStudentError('')
    const name = String(newStudentName || '').trim()
    const email = String(newStudentEmail || '').trim().toLowerCase()
    const rollNo = String(newStudentRollNo || '').trim()
    const phone = String(newStudentPhone || '').trim()
    const moduleName = String(newStudentModule || '').trim()

    if (!name || !email) {
      setAddStudentError('Student name and email are required.')
      return
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setAddStudentError('Enter a valid student email.')
      return
    }

    const localStudent = {
      student_id: localStudentIdFromEmail(email),
      student_email: email,
      name,
      roll_no: rollNo,
      module_name: moduleName,
    }

    setTempAssignableStudents((prev) => {
      const exists = prev.some((student) => String(student.student_email || '').toLowerCase() === email)
      if (exists) return prev
      return [...prev, localStudent]
    })

    setNewStudentName('')
    setNewStudentEmail('')
    setNewStudentRollNo('')
    setNewStudentPhone('')
    setNewStudentModule('')

    setAddingStudent(true)
    try {
      await addProjectStudent({
        project_id: project.id,
        student_name: name,
        student_email: email,
        roll_no: rollNo || null,
        phone: phone || null,
        module_name: moduleName || null,
      })

      setTempAssignableStudents([])
      await refetch()
    } catch (e) {
      const msg = String(e?.message || 'Unable to add student to project.')
      const lower = msg.toLowerCase()
      if (lower.includes('cannot connect to backend api')) {
        setAddStudentError(`${msg} Start backend server and try again.`)
      } else if (!lower.includes('cannot post /api/projects/') && !lower.includes('404')) {
        setAddStudentError(msg)
      }
    } finally {
      setAddingStudent(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <header className="topbar" style={{ padding: '20px 20px 0', background: 'transparent' }}>
        <div>
          <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--royal)', fontWeight: 600, cursor: 'pointer', padding: 0, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            ← Back
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 className="page-title">{project.title}</h1>
            <span className={`badge ${project.status === 'completed' ? 'badge-green' : 'badge-amber'}`}>{String(project.status).toUpperCase()}</span>
          </div>
          <p className="page-sub" style={{ marginTop: 4 }}>{project.description}</p>
          {project?.drive_folder_link && (
            <a
              href={normalizeExternalLink(project.drive_folder_link)}
              target="_blank"
              rel="noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8, color: 'var(--royal)', fontWeight: 700 }}
            >
              📁 Open Project Drive Link
            </a>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-hint)', textTransform: 'uppercase', marginBottom: 6, fontWeight: 700 }}>Overall Progress</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 200 }}>
             <div className="progress-bar" style={{ flex: 1, height: 8 }}><div className="progress-fill" style={{ width: `${project.stats.completionPercent}%`, background: 'var(--royal)' }}></div></div>
             <strong style={{ color: 'var(--royal)' }}>{project.stats.completionPercent}%</strong>
          </div>
        </div>
      </header>
      {reportToast && (
        <div style={{ margin: '0 20px 10px', padding: '12px 16px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, color: '#1D4ED8' }}>
          {reportToast}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 20px 12px' }}>
        <div />
        <button
          className="btn-primary"
          type="button"
          disabled={reportLoading}
          onClick={downloadProjectReport}
          style={{ padding: '8px 14px', fontSize: '0.82rem' }}
        >
          {reportLoading ? 'Generating report...' : 'Download Report'}
        </button>
      </div>
      <div style={{ display: 'flex', gap: 20, padding: '20px 20px 0', borderBottom: '1px solid var(--royal-border)' }}>
        {['Modules', 'Team members', 'Submissions', 'Analytics'].map(t => (
          <button 
            key={t}
            onClick={() => setTab(t)}
            style={{ 
              background: 'none', border: 'none', padding: '10px 4px', cursor: 'pointer',
              fontSize: '0.95rem', fontWeight: tab === t ? 800 : 600,
              color: tab === t ? 'var(--royal)' : 'var(--text-muted)',
              borderBottom: tab === t ? '3px solid var(--royal)' : '3px solid transparent'
            }}
          >
            {t}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        {tab === 'Modules' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                className="btn-primary"
                style={{ padding: '8px 14px', fontSize: '0.82rem' }}
                onClick={() => setAddTaskModalData({ id: null, name: 'General Tasks' })}
              >
                + Create Module
              </button>
            </div>

            {modules.length === 0 && directProjectTasks.length === 0 && <div style={{ color: 'var(--text-hint)' }}>No modules found.</div>}
            {modules.map((m, i) => {
              const mTasks = tasksByModule[m.id] || []
              const done = mTasks.filter(t => t.status === 'completed').length
              const pct = mTasks.length ? Math.round((done / mTasks.length) * 100) : 0
              return (
                <div key={m.id} className="card" style={{ padding: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-head)' }}>{i+1}. {m.name}</h3>
                      <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>{m.description}</p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-hint)' }}>{done}/{mTasks.length} Tasks</div>
                        <strong style={{ fontSize: '0.9rem', color: 'var(--royal)' }}>{pct}% Complete</strong>
                      </div>
                      <button className="btn-outline" style={{ padding: '6px 12px', fontSize: '0.8rem' }} onClick={() => setAddTaskModalData(m)}>+ Create Module</button>
                    </div>
                  </div>
                  {mTasks.length > 0 && (
                    <table className="data-table">
                      <thead><tr><th>Task</th><th>Assigned To</th><th>Deadline</th><th>Status</th><th>Drive</th></tr></thead>
                      <tbody>
                        {mTasks.map(t => (
                          <TaskRow key={t.id} task={t} studentName={graph.usersById[t.assigned_student_id]?.name} onOpenDrive={() => window.open(t.drive_folder_link || '#', '_blank')} />
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )
            })}

            {directProjectTasks.length > 0 && (
              <div className="card" style={{ padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-head)' }}>General Tasks</h3>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Tasks linked to project without a module.</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-hint)' }}>
                        {directProjectTasks.filter((task) => task.status === 'completed').length}/{directProjectTasks.length} Tasks
                      </div>
                    </div>
                    <button
                      className="btn-outline"
                      style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                      onClick={() => setAddTaskModalData({ id: null, name: 'General Tasks' })}
                    >
                      + Create Module
                    </button>
                  </div>
                </div>

                <table className="data-table">
                  <thead><tr><th>Task</th><th>Assigned To</th><th>Deadline</th><th>Status</th><th>Drive</th></tr></thead>
                  <tbody>
                    {directProjectTasks.map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        studentName={graph.usersById[task.assigned_student_id]?.name}
                        onOpenDrive={() => window.open(task.drive_folder_link || '#', '_blank')}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === 'Team members' && (
          <div className="card">
            {driveLinkError && (
              <div style={{ color: 'var(--red)', fontWeight: 700, padding: '12px 14px', borderBottom: '1px solid var(--royal-border)' }}>
                {driveLinkError}
              </div>
            )}
            <table className="data-table">
              <thead><tr><th>Name</th><th>Role</th><th>Tasks Done</th><th>Progress</th><th>Drive Folder</th></tr></thead>
              <tbody>
                {projectStudents.map(s => (
                  <tr key={s.id}>
                    <td><strong style={{ color: 'var(--text-head)' }}>{s.name}</strong><br/><span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{s.rollNo}</span></td>
                    <td><span className="badge badge-green">{String(s.role).toUpperCase()}</span></td>
                    <td>{s.tasksDone} / {s.tasksTotal}</td>
                    <td style={{ minWidth: 120 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className="progress-bar" style={{ flex: 1 }}><div className="progress-fill" style={{ width: `${s.progress}%` }}></div></div>
                        <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{s.progress}%</span>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        {s.drive_folder_link ? (
                          <a href={s.drive_folder_link} target="_blank" rel="noreferrer" className="btn-outline" style={{ padding: '4px 8px', fontSize: '0.8rem' }}>📁 Open</a>
                        ) : (
                          <span style={{ color: 'var(--text-hint)' }}>—</span>
                        )}
                        <button type="button" className="btn-outline" style={{ padding: '4px 8px', fontSize: '0.8rem' }} onClick={() => handleSetDriveFolderLink(s)}>
                          {s.drive_folder_link ? 'Edit' : 'Set Link'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'Submissions' && (
          <div className="card">
            <table className="data-table">
              <thead><tr><th>Team Member</th><th>Task</th><th>Module</th><th>Submitted At</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>
                {projectSubmissions.length === 0 && <tr><td colSpan="6" style={{ textAlign: 'center' }}>No submissions found.</td></tr>}
                {projectSubmissions.map(s => {
                  const t = graph.tasks.find(tx => tx.id === s.task_id)
                  const m = graph.modules.find(mx => mx.id === t?.module_id)
                  const stu = graph.usersById[s.student_id]
                  return (
                    <tr key={s.id}>
                      <td style={{ fontWeight: 600, color: 'var(--text-head)' }}>{stu?.name}</td>
                      <td>{t?.title}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{m?.name}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{new Date(s.submitted_at).toLocaleDateString()}</td>
                      <td><span className={`badge ${s.review_status === 'approved' ? 'badge-green' : s.review_status === 'pending' ? 'badge-amber' : 'badge-red'}`}>{String(s.review_status).toUpperCase()}</span></td>
                      <td>
                        {s.review_status === 'pending' && <button className="btn-primary" style={{ padding: '6px 14px', fontSize: '0.8rem' }} onClick={() => openReview(s)}>Review</button>}
                        {s.review_status !== 'pending' && <button className="btn-outline" style={{ padding: '6px 14px', fontSize: '0.8rem' }} onClick={() => openReview(s)}>View</button>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'Analytics' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div className="card">
              <div className="card-head"><h2 className="card-title">Team Member Completion</h2></div>
              <div style={{ height: 260, width: '100%' }}>
                {barData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--royal-border)" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                      <Tooltip cursor={{ fill: 'var(--royal-faint)' }} />
                      <Bar dataKey="completed" fill="var(--royal)" radius={[4,4,0,0]} barSize={32} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <div style={{ textAlign: 'center', paddingTop: 60, color: 'var(--text-hint)' }}>No data</div>}
              </div>
            </div>
            
            <div className="card">
              <div className="card-head"><h2 className="card-title">Task Distribution</h2></div>
              <div style={{ height: 260, width: '100%' }}>
                {donutData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={donutData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={2} dataKey="value" stroke="none">
                        {donutData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.fill} />)}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <div style={{ textAlign: 'center', paddingTop: 60, color: 'var(--text-hint)' }}>No data</div>}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Create Module Modal */}
      {addTaskModalData && (
        <Modal isOpen={!!addTaskModalData} onClose={() => setAddTaskModalData(null)} title="Create Module">
          <form onSubmit={handleAddTask} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: 'var(--royal-faint)', padding: '10px 14px', borderRadius: 8, fontSize: '0.85rem', color: 'var(--royal)', fontWeight: 600 }}>
              Module: {addTaskModalData.name}
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, marginBottom: 6 }}>Task Title</label>
              <input name="title" required style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--royal-border)' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, marginBottom: 6 }}>Description</label>
              <textarea name="description" rows={3} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--royal-border)' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, marginBottom: 6 }}>Assign To</label>
                <select name="assigned_student_id" required style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--royal-border)', background: '#fff' }}>
                  <option value="">Select Team Member...</option>
                  {projectAssignableStudents.map((student) => (
                    <option key={student.student_id} value={student.student_id}>
                      {student.name}
                      {student.module_name ? ` (${student.module_name})` : ''}
                      {student.source === 'coordinator' ? ` [${student.source_project_title}]` : ''}
                    </option>
                  ))}
                </select>
                {projectAssignableStudents.length === 0 && (
                  <div style={{ marginTop: 6, fontSize: '0.76rem', color: 'var(--red)', fontWeight: 700 }}>
                    No students assigned yet. Add a student below, then assign.
                  </div>
                )}
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, marginBottom: 6 }}>Deadline</label>
                <input type="date" name="deadline" required style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--royal-border)' }} />
              </div>
            </div>

            <div style={{ border: '1px solid var(--royal-border)', borderRadius: 8, padding: 12, background: '#fff' }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-head)', marginBottom: 8 }}>Add Student</div>
              {addStudentError && (
                <div style={{ marginBottom: 8, fontSize: '0.78rem', color: 'var(--red)', fontWeight: 700 }}>
                  {addStudentError}
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
                <input
                  value={newStudentName}
                  onChange={(e) => setNewStudentName(e.target.value)}
                  placeholder="Student name"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--royal-border)' }}
                />
                <input
                  value={newStudentEmail}
                  onChange={(e) => setNewStudentEmail(e.target.value)}
                  placeholder="Student email"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--royal-border)' }}
                />
                <input
                  value={newStudentRollNo}
                  onChange={(e) => setNewStudentRollNo(e.target.value)}
                  placeholder="ID"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--royal-border)' }}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10, alignItems: 'center' }}>
                <input
                  value={newStudentPhone}
                  onChange={(e) => setNewStudentPhone(e.target.value)}
                  placeholder="Phone"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--royal-border)' }}
                />
                <input
                  value={newStudentModule}
                  onChange={(e) => setNewStudentModule(e.target.value)}
                  placeholder="Module"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--royal-border)' }}
                />
                <button
                  type="button"
                  className="btn-outline"
                  onClick={handleAddProjectStudent}
                  disabled={addingStudent}
                  style={{ padding: '10px 14px', minWidth: 120 }}
                >
                  {addingStudent ? 'Adding...' : 'Add Student'}
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
              <button type="button" className="btn-outline" onClick={() => setAddTaskModalData(null)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={projectAssignableStudents.length === 0}>Create Module</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
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

// ─────────────────────────────────────────────────────────────
// 2. Team members
// ─────────────────────────────────────────────────────────────
function CoordStudents({ graph }) {
  const students = useMemo(() => {
    const list = []
    const map = new Map() // student_id -> aggregate
    const submissionsByStudent = new Map()

    ;(Array.isArray(graph.submissions) ? graph.submissions : []).forEach((submission) => {
      const key = String(submission.student_id || submission.student_email || '').trim().toLowerCase()
      if (!key) return
      const existing = submissionsByStudent.get(key)
      const date = submission.submitted_at ? new Date(submission.submitted_at).getTime() : 0
      if (!existing || date > existing.date) {
        submissionsByStudent.set(key, {
          status: String(submission.review_status || submission.status || '').trim().toLowerCase(),
          date,
        })
      }
    })

    graph.projectStudents.forEach(ps => {
      if (!map.has(ps.student_id)) {
        const user = graph.usersById[ps.student_id] || {}
        const studentKey = String(ps.student_id || ps.student_email || '').trim().toLowerCase()
        const reviewEntry = submissionsByStudent.get(studentKey)
        const status = reviewEntry && reviewEntry.status === 'approved'
          ? 'Accepted'
          : reviewEntry && reviewEntry.status === 'rejected'
            ? 'Rejected'
            : 'Pending'

        map.set(ps.student_id, {
          id: ps.student_id,
          name: user?.name || 'Unknown',
          rollNo: user?.roll_no || ps?.roll_no || '—',
          email: String(ps?.student_email || user?.email || '').trim() || '—',
          phone: String(ps?.phone || user?.phone || '').trim() || '—',
          projects: [],
          tasksDone: 0,
          tasksTotal: 0,
          status,
        })
      }
      const s = map.get(ps.student_id)
      const p = graph.projects.find(x => x.id === ps.project_id)
      if (p) s.projects.push(p.title)
      
      const mods = graph.modules.filter(m => m.project_id === ps.project_id).map(m=>m.id)
      const modSet = new Set(mods.map(String))
      const sTasks = graph.tasks.filter((t) => {
        const byModule = modSet.has(String(t.module_id || ''))
        const byProject = String(t.project_id || '') === String(ps.project_id)
        const assignedToStudent = String(t.assigned_student_id || '') === String(ps.student_id)
        return assignedToStudent && (byModule || byProject)
      })
      
      s.tasksTotal += sTasks.length
      s.tasksDone += sTasks.filter(t => t.status === 'completed').length
    })

    for (let s of map.values()) {
      s.progress = s.tasksTotal > 0 ? Math.round((s.tasksDone / s.tasksTotal) * 100) : 0
      list.push(s)
    }
    return list.sort((a,b) => a.name.localeCompare(b.name))
  }, [graph])

  return (
    <div style={{ padding: '0 20px 40px', overflowY: 'auto', height: '100%' }}>
      <header className="topbar" style={{ padding: '24px 0 16px', background: 'transparent' }}>
        <div><h1 className="page-title">Team members</h1><p className="page-sub">All team members assigned under your supervision</p></div>
      </header>
      
      <div className="kpi-grid">
        <div className="kpi-card"><div className="kpi-icon" style={{background:'#EBF5FB',color:'#2E86C1'}}>🎓</div><div className="kpi-body"><span className="kpi-label">Total Team Members</span><span className="kpi-value">{students.length}</span></div></div>
        <div className="kpi-card"><div className="kpi-icon" style={{background:'#F5EEF8',color:'#7D3C98'}}>📊</div><div className="kpi-body"><span className="kpi-label">Avg Progress</span><span className="kpi-value">{students.length ? Math.round(students.reduce((a,s)=>a+s.progress,0)/students.length) : 0}%</span></div></div>
      </div>

      <div className="card">
        <div className="card-head"><h2 className="card-title">Team Member Directory</h2></div>
        <table className="data-table">
          <thead><tr><th>Team Member Name</th><th>Roll No.</th><th>Email</th><th>Phone</th><th>Projects</th><th>Progress</th><th>Status</th></tr></thead>
          <tbody>
            {students.length === 0 && <tr><td colSpan="7" style={{ textAlign: 'center' }}>No team members found.</td></tr>}
            {students.map((s, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 600, color: 'var(--text-head)' }}>{s.name}</td>
                <td style={{ color: 'var(--text-muted)', fontFamily: 'monospace' }}>{s.rollNo}</td>
                <td style={{ color: 'var(--text-muted)' }}>{s.email}</td>
                <td style={{ color: 'var(--text-muted)', fontFamily: 'monospace' }}>{s.phone}</td>
                <td><span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{s.projects.join(', ')}</span></td>
                <td style={{ minWidth: 120 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div className="progress-bar" style={{ flex: 1 }}><div className="progress-fill" style={{ width: `${s.progress}%` }}></div></div>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{s.progress}%</span>
                  </div>
                </td>
                <td>
                  <span className={`badge ${s.status === 'Accepted' ? 'badge-green' : s.status === 'Rejected' ? 'badge-red' : 'badge-amber'}`}>
                    {String(s.status || 'Pending').toUpperCase()}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// 3. Submissions
// ─────────────────────────────────────────────────────────────
function CoordSubmissions({ coordinatorId, coordinatorEmail, coordinatorName, graph, openReview, onQuickReview }) {
  const [submissions, setSubmissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionSubmissionId, setActionSubmissionId] = useState(null)
  const [editingSubmissionId, setEditingSubmissionId] = useState(null)
  const [redoTarget, setRedoTarget] = useState(null)
  const [redoReason, setRedoReason] = useState('')

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      if (!coordinatorId) {
        if (!cancelled) {
          setSubmissions([])
          setLoading(false)
          setError('')
        }
        return
      }

      setLoading(true)
      setError('')

      try {
        const data = await listSubmissionsByCoordinator(coordinatorId, coordinatorEmail, coordinatorName)
        if (!cancelled) {
          setSubmissions(Array.isArray(data) ? data : [])
        }
      } catch (e) {
        if (!cancelled) {
          setError(e?.message || 'Failed to fetch submissions.')
          setSubmissions([])
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    run()

    return () => {
      cancelled = true
    }
  }, [coordinatorEmail, coordinatorId, coordinatorName])

  const allSubmissions = useMemo(() => {
    const statusRank = (status) => {
      const s = String(status || '').toLowerCase()
      if (s === 'pending') return 0
      if (s === 'rejected') return 1
      if (s === 'approved') return 2
      return 3
    }

    return submissions.map(s => {
      const t = graph.tasks.find(tx => tx.id === s.task_id)
      const m = graph.modules.find(mx => mx.id === t?.module_id)
      const p = graph.projects.find(px => px.id === m?.project_id) || graph.projects.find(px => px.id === s.project_id)
      const fallbackStudentId = s.student_email ? `local-student-${String(s.student_email).replace(/[^a-z0-9]+/gi, '-')}` : null
      const stu = graph.usersById[s.student_id] || (fallbackStudentId ? graph.usersById[fallbackStudentId] : null)
      const normalizedStatus = String(s.review_status || s.status || 'pending').toLowerCase()
      return {
        ...s,
        review_status: normalizedStatus === 'approved' ? 'approved' : normalizedStatus === 'rejected' ? 'rejected' : 'pending',
        taskTitle: t?.title || s.task || s.title || 'Submission',
        modName: m?.name,
        projTitle: p?.title || '—',
        stuName: stu?.name || s.student_name || s.student_email || 'Student'
      }
    }).sort((a,b) => {
      const rankDiff = statusRank(a.review_status) - statusRank(b.review_status)
      if (rankDiff !== 0) return rankDiff
      return new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()
    })
  }, [submissions, graph])

  const handleQuickAction = async (submissionId, reviewStatus) => {
    if (!submissionId || !onQuickReview) return
    setError('')
    setActionSubmissionId(submissionId)
    try {
      await onQuickReview({
        submission_id: submissionId,
        review_status: reviewStatus,
        coordinator_comment: null,
      })

      setSubmissions((prev) =>
        prev.map((item) =>
          String(item?.id) === String(submissionId)
            ? {
                ...item,
                review_status: reviewStatus,
                status: reviewStatus === 'approved' ? 'Approved' : reviewStatus === 'rejected' ? 'Redo' : 'Pending',
                reviewed_at: new Date().toISOString(),
              }
            : item
        )
      )

      const refreshed = await listSubmissionsByCoordinator(coordinatorId, coordinatorEmail, coordinatorName)
      setSubmissions(Array.isArray(refreshed) ? refreshed : [])
      setEditingSubmissionId(null)
    } catch (e) {
      setError(e?.message || 'Unable to review submission.')
    } finally {
      setActionSubmissionId(null)
    }
  }

  const handleOpenView = (submission) => {
    setError('')
    openReview(submission)
  }

  const handleOpenRedo = (submission) => {
    setError('')
    setRedoReason('')
    setRedoTarget(submission)
  }

  const handleSubmitRedo = async () => {
    if (!redoTarget?.id || !onQuickReview) return

    const reason = String(redoReason || '').trim()
    if (!reason) {
      setError('Please provide a reason for redo.')
      return
    }

    setError('')
    setActionSubmissionId(redoTarget.id)
    try {
      await onQuickReview({
        submission_id: redoTarget.id,
        review_status: 'rejected',
        coordinator_comment: reason,
      })

      setSubmissions((prev) =>
        prev.map((item) =>
          String(item?.id) === String(redoTarget.id)
            ? {
                ...item,
                review_status: 'rejected',
                status: 'Redo',
                coordinator_comment: reason,
                reviewed_at: new Date().toISOString(),
              }
            : item
        )
      )

      const refreshed = await listSubmissionsByCoordinator(coordinatorId, coordinatorEmail, coordinatorName)
      setSubmissions(Array.isArray(refreshed) ? refreshed : [])
      setRedoTarget(null)
      setRedoReason('')
      setEditingSubmissionId(null)
    } catch (e) {
      setError(e?.message || 'Unable to review submission.')
    } finally {
      setActionSubmissionId(null)
    }
  }

  return (
    <div style={{ padding: '0 20px 40px', overflowY: 'auto', height: '100%' }}>
      <header className="topbar" style={{ padding: '24px 0 16px', background: 'transparent' }}>
        <div><h1 className="page-title">Submissions</h1><p className="page-sub">Review and grade team member work submissions</p></div>
      </header>
      <div className="card">
        <div className="card-head">
          <h2 className="card-title">All Submissions</h2>
          <span className="badge badge-amber">{allSubmissions.filter(s=>s.review_status==='pending').length} Pending</span>
        </div>
        {error && (
          <div style={{ marginBottom: 12, color: 'var(--red)', fontWeight: 600 }}>
            {error}
          </div>
        )}
        <table className="data-table">
          <thead><tr><th>Team Member</th><th>Project</th><th>Task</th><th>Submitted</th><th>View</th><th>Action</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan="6" style={{ textAlign: 'center' }}>Fetching submissions...</td></tr>}
            {!loading && allSubmissions.length === 0 && <tr><td colSpan="6" style={{ textAlign: 'center' }}>No submissions found.</td></tr>}
            {!loading && allSubmissions.map((s) => (
              <tr key={s.id}>
                <td style={{ fontWeight: 600, color: 'var(--text-head)' }}>{s.stuName}</td>
                <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{s.projTitle}</td>
                <td>{s.taskTitle}</td>
                <td style={{ color: 'var(--text-muted)' }}>{new Date(s.submitted_at).toLocaleDateString()}</td>
                <td>
                  <button className="btn-outline" style={{ padding: '6px 14px', fontSize: '0.8rem' }} onClick={() => handleOpenView(s)}>
                    View
                  </button>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {s.review_status === 'pending' || editingSubmissionId === s.id ? (
                      <>
                        <button
                          className="btn-primary"
                          style={{ padding: '6px 10px', fontSize: '0.75rem' }}
                          disabled={actionSubmissionId === s.id}
                          onClick={() => handleQuickAction(s.id, 'approved')}
                        >
                          Approve
                        </button>
                        <button
                          className="btn-outline"
                          style={{ padding: '6px 10px', fontSize: '0.75rem' }}
                          disabled={actionSubmissionId === s.id}
                          onClick={() => handleOpenRedo(s)}
                        >
                          Redo
                        </button>
                        {editingSubmissionId === s.id && s.review_status !== 'pending' && (
                          <button
                            className="btn-outline"
                            style={{ padding: '6px 10px', fontSize: '0.75rem' }}
                            disabled={actionSubmissionId === s.id}
                            onClick={() => setEditingSubmissionId(null)}
                          >
                            Cancel
                          </button>
                        )}
                      </>
                    ) : s.review_status === 'approved' ? (
                      <>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--green)' }}>Approved</span>
                        <button
                          className="btn-outline"
                          style={{ padding: '6px 10px', fontSize: '0.75rem' }}
                          onClick={() => setEditingSubmissionId(s.id)}
                        >
                          Edit
                        </button>
                      </>
                    ) : (
                      <>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--red)' }}>Redo</span>
                        <button
                          className="btn-outline"
                          style={{ padding: '6px 10px', fontSize: '0.75rem' }}
                          onClick={() => setEditingSubmissionId(s.id)}
                        >
                          Edit
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        isOpen={!!redoTarget}
        onClose={() => {
          if (actionSubmissionId) return
          setRedoTarget(null)
          setRedoReason('')
        }}
        title="Redo Reason"
        width={560}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Explain what needs to be corrected before resubmission.
          </p>
          <textarea
            value={redoReason}
            onChange={(e) => setRedoReason(e.target.value)}
            rows={5}
            placeholder="Example: Add unit tests for authentication flow and include API error handling screenshots."
            style={{ width: '100%', border: '1px solid var(--royal-border)', borderRadius: 8, padding: 10, fontSize: '0.9rem' }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button
              className="btn-outline"
              type="button"
              disabled={Boolean(actionSubmissionId)}
              onClick={() => {
                setRedoTarget(null)
                setRedoReason('')
              }}
            >
              Cancel
            </button>
            <button
              className="btn-primary"
              type="button"
              disabled={Boolean(actionSubmissionId)}
              onClick={handleSubmitRedo}
            >
              Submit Redo
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// 4. Analytics
// ─────────────────────────────────────────────────────────────
function CoordAnalytics({ graph }) {
  const projectRows = useMemo(() => {
    return (graph.projects || []).map((project) => {
      const projectModuleIds = new Set(
        (graph.modules || [])
          .filter((m) => String(m.project_id || '') === String(project.id))
          .map((m) => String(m.id))
      )

      const tasks = (graph.tasks || []).filter((task) => {
        const byProject = String(task.project_id || '') === String(project.id)
        const byModule = projectModuleIds.has(String(task.module_id || ''))
        return byProject || byModule
      })

      const completed = tasks.filter((task) => String(task.status || '').toLowerCase() === 'completed').length
      const inProgress = tasks.filter((task) => String(task.status || '').toLowerCase() === 'in_progress').length
      const rejected = tasks.filter((task) => String(task.status || '').toLowerCase() === 'rejected').length
      const pending = Math.max(tasks.length - completed - inProgress - rejected, 0)
      const completionPct = tasks.length > 0 ? Math.round((completed / tasks.length) * 100) : 0

      const dateCandidates = []
      if (project?.created_at) dateCandidates.push(new Date(project.created_at))
      if (project?.deadline) dateCandidates.push(new Date(project.deadline))
      tasks.forEach((task) => {
        if (task?.created_at) dateCandidates.push(new Date(task.created_at))
        if (task?.deadline) dateCandidates.push(new Date(task.deadline))
      })

      const validDates = dateCandidates
        .filter((dateValue) => dateValue instanceof Date && !Number.isNaN(dateValue.getTime()))
        .sort((a, b) => a.getTime() - b.getTime())

      const startDate = validDates[0] || null
      const endDate = validDates[validDates.length - 1] || null

      return {
        id: project.id,
        title: project.title || 'Untitled Project',
        totalTasks: tasks.length,
        completed,
        inProgress,
        pending,
        rejected,
        completionPct,
        startDate,
        endDate,
      }
    })
  }, [graph])

  const ganttRows = useMemo(() => {
    return projectRows.map((row) => ({
      ...row,
      width: Math.max(Math.min(Number(row.completionPct || 0), 100), 0),
    }))
  }, [projectRows])

  const summary = useMemo(() => {
    const totalProjects = projectRows.length
    const avgCompletion =
      totalProjects > 0
        ? Math.round(projectRows.reduce((sum, row) => sum + row.completionPct, 0) / totalProjects)
        : 0
    const completedProjects = projectRows.filter((row) => row.completionPct === 100 && row.totalTasks > 0).length
    const activeProjects = projectRows.filter((row) => row.completionPct > 0 && row.completionPct < 100).length

    return {
      totalProjects,
      avgCompletion,
      completedProjects,
      activeProjects,
    }
  }, [projectRows])

  const fmtDate = (value) => {
    if (!value) return 'NA'
    const d = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(d.getTime())) return 'NA'
    return d.toLocaleDateString()
  }

  return (
    <div style={{ padding: '0 20px 40px', overflowY: 'auto', height: '100%' }}>
      <header className="topbar" style={{ padding: '24px 0 16px', background: 'transparent' }}>
        <div>
          <h1 className="page-title">Analytics</h1>
          <p className="page-sub">Gantt view and completion details across all coordinator projects</p>
        </div>
      </header>

      <section className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: '#EBF5FB', color: '#2E86C1' }}>📁</div>
          <div className="kpi-body">
            <span className="kpi-label">Projects</span>
            <span className="kpi-value">{summary.totalProjects}</span>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: '#E9F7EF', color: '#1E8449' }}>📊</div>
          <div className="kpi-body">
            <span className="kpi-label">Avg Completion</span>
            <span className="kpi-value">{summary.avgCompletion}%</span>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: '#FDEDEC', color: '#C0392B' }}>✅</div>
          <div className="kpi-body">
            <span className="kpi-label">Completed Projects</span>
            <span className="kpi-value">{summary.completedProjects}</span>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: '#FEF5E7', color: '#AF601A' }}>🚧</div>
          <div className="kpi-body">
            <span className="kpi-label">Active Projects</span>
            <span className="kpi-value">{summary.activeProjects}</span>
          </div>
        </div>
      </section>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-head">
          <h2 className="card-title">Project Gantt Chart</h2>
        </div>
        {projectRows.length === 0 && (
          <div style={{ color: 'var(--text-hint)', padding: 12 }}>No projects available.</div>
        )}
        {ganttRows.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {ganttRows.map((row) => (
              <div
                key={row.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '220px 1fr',
                  gap: 12,
                  alignItems: 'center',
                }}
              >
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-head)' }}>
                  {row.title}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ position: 'relative', height: 16, background: 'var(--royal-faint)', borderRadius: 999, flex: 1 }}>
                  <div
                    style={{
                      position: 'absolute',
                      width: `${row.width}%`,
                      top: 0,
                      bottom: 0,
                      background: 'linear-gradient(90deg, var(--royal), #2E86C1)',
                      borderRadius: 999,
                    }}
                    title={`Completion: ${row.completionPct}%`}
                  />
                </div>
                  <strong style={{ minWidth: 44, textAlign: 'right', color: 'var(--royal)' }}>{row.completionPct}%</strong>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <h2 className="card-title">Project Completion Details</h2>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Project</th>
              <th>Timeline</th>
              <th>Tasks</th>
              <th>Completed</th>
              <th>In Progress</th>
              <th>Pending</th>
              <th>Rejected</th>
              <th>Completion</th>
            </tr>
          </thead>
          <tbody>
            {projectRows.length === 0 && (
              <tr>
                <td colSpan="8" style={{ textAlign: 'center' }}>No projects found.</td>
              </tr>
            )}
            {projectRows.map((row) => (
              <tr key={row.id}>
                <td style={{ fontWeight: 700, color: 'var(--text-head)' }}>{row.title}</td>
                <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  {fmtDate(row.startDate)} - {fmtDate(row.endDate)}
                </td>
                <td>{row.totalTasks}</td>
                <td style={{ color: 'var(--green)', fontWeight: 700 }}>{row.completed}</td>
                <td style={{ color: '#C27D00', fontWeight: 700 }}>{row.inProgress}</td>
                <td>{row.pending}</td>
                <td style={{ color: 'var(--red)', fontWeight: 700 }}>{row.rejected}</td>
                <td style={{ minWidth: 170 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div className="progress-bar" style={{ flex: 1 }}>
                      <div className="progress-fill" style={{ width: `${row.completionPct}%` }} />
                    </div>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>{row.completionPct}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// 5. Schedule
// ─────────────────────────────────────────────────────────────
function CoordSchedule({ graph, openSchedule }) {
  const schedule = useMemo(() => {
    return (graph.meetings || []).sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  }, [graph])

  return (
    <div style={{ padding: '0 20px 40px', overflowY: 'auto', height: '100%' }}>
      <header className="topbar" style={{ padding: '24px 0 16px', background: 'transparent' }}>
        <div><h1 className="page-title">Schedule</h1><p className="page-sub">Manage upcoming reviews, meetings, and milestones</p></div>
        <div className="topbar-actions">
          <button className="btn-primary" onClick={openSchedule}>
            + Schedule Review
          </button>
        </div>
      </header>
      <div className="card">
        <div className="card-head"><h2 className="card-title">Upcoming Events</h2></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {schedule.length === 0 && <div style={{ color: 'var(--text-hint)', padding: 20 }}>No scheduled events.</div>}
          {schedule.map((s, i) => {
            const d = new Date(s.date)
            const day = d.getDate()
            const mon = d.toLocaleDateString('en-US', { month: 'short' })
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '18px 0', borderBottom: '1px solid var(--royal-border)' }}>
                <div style={{ textAlign: 'center', background: 'var(--royal-faint)', padding: '10px 16px', borderRadius: 8, minWidth: 56 }}>
                  <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--royal-dark)', display: 'block', lineHeight: 1 }}>{day}</span>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--royal)', letterSpacing: 1, textTransform: 'uppercase' }}>{mon}</span>
                </div>
                <div style={{ flex: 1 }}>
                  <strong style={{ fontSize: '1rem', color: 'var(--text-head)', display: 'block', marginBottom: 4 }}>{s.title}</strong>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>📍 {s.location || 'Online'} &nbsp;·&nbsp; 🕒 {s.time}</span>
                </div>
                <span className="badge badge-green">UPCOMING</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function ScheduleModal({ isOpen, onClose, coordinatorId, projects, onScheduled }) {
  const handleSubmit = async (e) => {
    e.preventDefault()
    const fd = new FormData(e.target)
    await createMeeting({
      coordinator_id: coordinatorId,
      project_id: fd.get('project_id') || null,
      title: fd.get('title'),
      date: fd.get('date'),
      time: fd.get('time'),
      location: fd.get('location'),
      note: fd.get('note'),
    })
    onScheduled()
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Schedule Review">
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, marginBottom: 6 }}>Title</label>
          <input name="title" required style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--royal-border)' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, marginBottom: 6 }}>Date</label>
            <input type="date" name="date" required style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--royal-border)' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, marginBottom: 6 }}>Time</label>
            <input type="time" name="time" required style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--royal-border)' }} />
          </div>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, marginBottom: 6 }}>Related Project (Optional)</label>
          <select name="project_id" style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--royal-border)', background: '#fff' }}>
            <option value="">None</option>
            {projects?.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, marginBottom: 6 }}>Location / Meet Link</label>
          <input name="location" style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--royal-border)' }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, marginBottom: 6 }}>Notes</label>
          <textarea name="note" rows={2} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--royal-border)' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
          <button type="button" className="btn-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary">Schedule</button>
        </div>
      </form>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────
// 5. Settings
// ─────────────────────────────────────────────────────────────
function CoordSettings({ user, refetch }) {
  const [memberForm, setMemberForm] = useState({ name: '', email: '', department: '', rollNo: '' })
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [creating, setCreating] = useState(false)
  const [changing, setChanging] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')

  const createTeamMember = async () => {
    setStatusMsg('')
    if (!memberForm.name.trim() || !memberForm.email.trim()) {
      setStatusMsg('Name and email are required.')
      return
    }
    setCreating(true)
    try {
      await createManagedUser({
        creatorRole: String(user?.role || 'coordinator').toLowerCase(),
        creatorEmail: user?.email || '',
        role: 'student',
        name: memberForm.name,
        email: memberForm.email,
        department: memberForm.department || user?.department || 'General',
        roll_no: memberForm.rollNo || null,
      })
      setMemberForm({ name: '', email: '', department: '', rollNo: '' })
      setStatusMsg('Team member account created with default password 123456.')
      await refetch?.()
    } catch (error) {
      setStatusMsg(error?.message || 'Unable to create team member right now.')
    } finally {
      setCreating(false)
    }
  }

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

  return (
    <div style={{ padding: '0 20px 40px', overflowY: 'auto', height: '100%' }}>
      <header className="topbar" style={{ padding: '24px 0 16px', background: 'transparent' }}>
        <div><h1 className="page-title">Settings</h1><p className="page-sub">Create team members and change your password</p></div>
      </header>
      <div className="content-grid" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
        <div className="card">
          <div className="card-head"><h2 className="card-title">Account Details</h2></div>
          {[
            ['Full Name', user?.name || '—'],
            ['Email', user?.email || '—'],
            ['Role', String(user?.role || 'Coordinator').toUpperCase()],
            ['Department', user?.department || '—']
          ].map(([l,v],i)=>(
            <div key={i} style={{ display:'flex',justifyContent:'space-between',padding:'12px 0',borderBottom:'1px solid var(--royal-border)' }}>
              <span style={{ fontSize:'0.875rem',color:'var(--text-muted)',fontWeight:500 }}>{l}</span>
              <span style={{ fontSize:'0.875rem',color:'var(--text-head)',fontWeight:600 }}>{v}</span>
            </div>
          ))}
        </div>

        <div className="card">
          <div className="card-head"><h2 className="card-title">Change Password</h2></div>
          <div style={{ display: 'grid', gap: 12 }}>
            <SettingInput label="Current Password" value={passwordForm.currentPassword} onChange={(value) => setPasswordForm(prev => ({ ...prev, currentPassword: value }))} type="password" />
            <SettingInput label="New Password" value={passwordForm.newPassword} onChange={(value) => setPasswordForm(prev => ({ ...prev, newPassword: value }))} type="password" />
            <SettingInput label="Confirm New Password" value={passwordForm.confirmPassword} onChange={(value) => setPasswordForm(prev => ({ ...prev, confirmPassword: value }))} type="password" />
            <button className="btn-primary" onClick={updatePassword} disabled={changing} style={{ width: '100%' }}>
              {changing ? 'Updating...' : 'Update Password'}
            </button>
          </div>
        </div>

        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <div className="card-head"><h2 className="card-title">Create Team Member</h2></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
            <SettingInput label="Name" value={memberForm.name} onChange={(value) => setMemberForm(prev => ({ ...prev, name: value }))} />
            <SettingInput label="Email" value={memberForm.email} onChange={(value) => setMemberForm(prev => ({ ...prev, email: value }))} />
            <SettingInput label="Department" value={memberForm.department} onChange={(value) => setMemberForm(prev => ({ ...prev, department: value }))} />
            <SettingInput label="Roll Number" value={memberForm.rollNo} onChange={(value) => setMemberForm(prev => ({ ...prev, rollNo: value }))} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, gap: 12 }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>New team member accounts are created with default password 123456.</div>
            <button className="btn-primary" onClick={createTeamMember} disabled={creating}>
              {creating ? 'Creating...' : 'Create Team Member'}
            </button>
          </div>
        </div>
      </div>
      {statusMsg && (
        <div style={{ marginTop: 14, color: statusMsg.toLowerCase().includes('unable') || statusMsg.toLowerCase().includes('required') || statusMsg.toLowerCase().includes('match') ? 'var(--red)' : 'var(--green)', fontWeight: 600 }}>
          {statusMsg}
        </div>
      )}
    </div>
  )
}

function SettingInput({ label, value, onChange, disabled = false, type = 'text' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)', fontWeight: 500 }}>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        disabled={disabled}
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
