import { useEffect, useState, useCallback } from 'react'
import Sidebar from '../components/Sidebar'
import LayoutMenu from '../components/LayoutMenu'
import { directorDashboardFallback } from '../lib/dashboardData'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, ReferenceLine } from 'recharts'
import ActionModal from '../components/ActionModal'
import CoordinatorModal from '../components/CoordinatorModal'
import CreateProjectModal from '../components/CreateProjectModal'
import ProjectDetailsModal from '../components/ProjectDetailsModal'
import DirectorAlertsPanel from '../components/DirectorAlertsPanel'
import { changePassword, createManagedUser } from '../lib/api'
import { fetchProjectReport } from '../lib/api'
import { generateIndividualProjectReportPdf } from '../lib/projectReportPdf'
import { convertReportToCSV as _convertReportToCSV, convertProjectReportToSheetRows as _convertProjectReportToSheetRows } from './ReportsPageHelper'
import '../assets/dashboard.css'

function useDirectorGraph() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetch_ = useCallback(async () => {
    try {
      const res = await fetch('/api/director-graph')
      if (res.ok) setData(await res.json())
    } catch (e) {
      console.error('director-graph fetch error:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetch_() }, [fetch_])
  return [data, loading, fetch_]
}

const navItems = [
  { label: 'Overview' },
  { label: 'All Projects' },
  { label: 'Alerts' },
  { label: 'Teams' },
  { label: 'Analytics' },
  { label: 'Reports' },
  { label: 'Coordinators' },
  { label: 'Team members' },
  { label: 'Assign Coordinators' },
]

function getDomain(project) {
  return project.domain || 'General'
}

const DEFAULT_DOMAINS = [
  'Web Dev', 'ML', 'IoT', 'Mobile', 'Research', 'General',
  'Artificial Intelligence', 'Data Science', 'Robotics', 
  'UI/UX Design', 'Cyber Security', 'Cloud Computing', 
  'DevOps', 'Blockchain'
];

function getSortedDomainOptions(projects) {
  const rawDomains = Array.from(new Set([...DEFAULT_DOMAINS, ...projects.map(project => getDomain(project))]));
  const withoutOther = rawDomains.filter(d => d && d.toLowerCase() !== 'other');
  return [...withoutOther, 'Other'];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

const DAY_MS = 24 * 60 * 60 * 1000

function toDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function addDays(date, days) {
  return new Date(date.getTime() + (days * DAY_MS))
}

function daysBetween(start, end) {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / DAY_MS))
}

function formatTimelineDate(date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function ProjectRoadmapTooltip({ active, payload, timelineStart }) {
  if (!active || !payload?.length) return null

  const row = payload[0]?.payload
  if (!row) return null

  const startDate = addDays(timelineStart, row.offsetDays)
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid var(--royal-border)',
        borderRadius: 10,
        boxShadow: '0 8px 24px rgba(9, 30, 66, 0.16)',
        padding: '12px 14px',
        minWidth: 220,
      }}
    >
      <div style={{ fontWeight: 700, color: 'var(--text-head)', marginBottom: 4 }}>{row.label}</div>
      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 10 }}>
        {row.domain} · {row.coordinator}
      </div>
      <div style={{ display: 'grid', gap: 4, fontSize: '0.82rem', color: 'var(--text-body)' }}>
        <span>Start: {formatTimelineDate(startDate)}</span>
        <span>Planned End: {formatTimelineDate(addDays(startDate, row.plannedTotalDays))}</span>
        <span>Actual End: {formatTimelineDate(addDays(startDate, row.actualTotalDays))}</span>
        <span>Phase 1 (Scheduled): {row.plannedPhase1Days} days</span>
        <span>Phase 2 (Scheduled): {row.plannedPhase2Days} days</span>
        <span>Phase 1 (Actual): {row.actualPhase1Days} days</span>
        <span>Phase 2 (Actual): {row.actualPhase2Days} days</span>
        <span>Milestones: {row.milestoneCount}</span>
        <span>{row.phaseSource}</span>
      </div>
    </div>
  )
}

function buildProjectRoadmapRows(projects) {
  const enriched = projects
    .map((project) => {
      const start = toDate(project.startDate) || toDate(project.createdAt)
      const due = toDate(project.dueDate)
      const milestones = Array.isArray(project.milestones) ? project.milestones : []
      const milestoneDates = milestones
        .map(item => toDate(item.completedAt || item.dueDate))
        .filter(Boolean)
        .sort((a, b) => a - b)

      if (!start && !due) return null

      const normalizedStart = start || addDays(due, -(milestoneDates.length > 0 ? 35 : 21))
      const normalizedEnd = due && due > normalizedStart ? due : addDays(normalizedStart, milestoneDates.length > 0 ? 35 : 21)
      const totalDays = Math.max(daysBetween(normalizedStart, normalizedEnd), 1)
      const defaultPlanning = clamp(Math.round(totalDays * 0.28), 3, Math.max(totalDays - 2, 3))
      const defaultExecution = clamp(Math.round(totalDays * 0.42), 3, Math.max(totalDays - defaultPlanning - 1, 3))
      const defaultReview = Math.max(totalDays - defaultPlanning - defaultExecution, 1)

      let planningDays = defaultPlanning
      let executionDays = defaultExecution
      let reviewDays = defaultReview
      let phaseSource = 'Phases derived from project timeline'

      if (milestoneDates.length > 0) {
        const firstMilestone = milestoneDates[0]
        const middleMilestone = milestoneDates[Math.floor((milestoneDates.length - 1) / 2)]
        const lastMilestone = milestoneDates[milestoneDates.length - 1]

        planningDays = clamp(daysBetween(normalizedStart, firstMilestone), 1, totalDays)
        executionDays = clamp(daysBetween(firstMilestone, lastMilestone), 1, Math.max(totalDays - planningDays, 1))
        reviewDays = Math.max(totalDays - planningDays - executionDays, 1)
        phaseSource = `${milestoneDates.length} milestone${milestoneDates.length === 1 ? '' : 's'} in schedule`

        if (milestoneDates.length === 1) {
          executionDays = clamp(Math.round(totalDays * 0.35), 1, Math.max(totalDays - planningDays - 1, 1))
          reviewDays = Math.max(totalDays - planningDays - executionDays, 1)
          phaseSource = `Single milestone: ${formatTimelineDate(firstMilestone)}`
        } else if (middleMilestone && middleMilestone > firstMilestone && middleMilestone < lastMilestone) {
          executionDays = clamp(daysBetween(firstMilestone, middleMilestone), 1, Math.max(totalDays - planningDays - 1, 1))
          reviewDays = Math.max(totalDays - planningDays - executionDays, 1)
        }
      }

      const segmentTotal = planningDays + executionDays + reviewDays
      if (segmentTotal > totalDays) {
        reviewDays = Math.max(totalDays - planningDays - executionDays, 1)
      }

      const plannedPhase1Days = planningDays
      const plannedPhase2Days = Math.max(totalDays - plannedPhase1Days, 1)
      const status = String(project.status || '').toLowerCase()
      const progress = Number(project.pct || 0)
      let actualRatio = progress >= 100 ? 1 : 0.6 + (progress / 200)

      if (status.includes('delayed')) actualRatio += 0.12
      if (status.includes('at risk')) actualRatio += 0.08
      if (status.includes('completed')) actualRatio = 1

      const actualTotalDays = clamp(Math.round(totalDays * actualRatio), 1, Math.round(totalDays * 1.5))
      const actualPhase1Days = clamp(Math.round(actualTotalDays * 0.45), 1, Math.max(actualTotalDays - 1, 1))
      const actualPhase2Days = Math.max(actualTotalDays - actualPhase1Days, 1)
      const actualEnd = addDays(normalizedStart, actualTotalDays)

      return {
        ...project,
        normalizedStart,
        normalizedEnd,
        totalDays,
        plannedTotalDays: totalDays,
        plannedPhase1Days,
        plannedPhase2Days,
        actualTotalDays,
        actualPhase1Days,
        actualPhase2Days,
        actualEnd,
        milestoneCount: milestones.length,
        completedMilestones: Number(project.completedMilestones || 0),
        phaseSource,
      }
    })
    .filter(Boolean)

  if (enriched.length === 0) {
    return { rows: [], timelineStart: null, timelineEnd: null }
  }

  const timelineStart = enriched.reduce((earliest, project) => (project.normalizedStart < earliest ? project.normalizedStart : earliest), enriched[0].normalizedStart)
  const timelineEnd = enriched.reduce((latest, project) => {
    const candidate = project.actualEnd > project.normalizedEnd ? project.actualEnd : project.normalizedEnd
    return candidate > latest ? candidate : latest
  }, enriched[0].normalizedEnd)

  const rows = enriched
    .sort((a, b) => a.normalizedEnd - b.normalizedEnd || a.normalizedStart - b.normalizedStart)
    .map((project) => {
      const offsetDays = daysBetween(timelineStart, project.normalizedStart)

      return {
        label: project.name,
        domain: project.domain,
        coordinator: project.coord,
        offsetDays,
        phase2OffsetDays: offsetDays + project.plannedPhase1Days,
        plannedTotalDays: project.plannedTotalDays,
        plannedPhase1Days: project.plannedPhase1Days,
        plannedPhase2Days: project.plannedPhase2Days,
        actualOffsetDays: offsetDays,
        actualTotalDays: project.actualTotalDays,
        actualPhase1Days: project.actualPhase1Days,
        actualPhase2Days: project.actualPhase2Days,
        milestoneCount: project.milestoneCount,
        phaseSource: project.phaseSource,
        startLabel: formatTimelineDate(project.normalizedStart),
        endLabel: formatTimelineDate(project.normalizedEnd),
      }
    })

  return { rows, timelineStart, timelineEnd }
}

function ProjectRoadmapGantt({ rows, timelineStart, timelineEnd, variant = 'planned-vs-actual' }) {
  if (!rows.length || !timelineStart || !timelineEnd) {
    return (
      <div className="empty-state" style={{ height: '100%', minHeight: 220 }}>
        <div style={{ fontWeight: 700, color: 'var(--text-head)' }}>No dated projects available</div>
        <div style={{ color: 'var(--text-muted)', marginTop: 6, fontSize: '0.9rem' }}>
          Add project start and due dates to view the delivery timeline.
        </div>
      </div>
    )
  }

  const totalSpan = Math.max(daysBetween(timelineStart, timelineEnd), 1)
  const todayOffset = clamp(daysBetween(timelineStart, new Date()), 0, totalSpan)

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 8 }} barCategoryGap={12}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--royal-border)" />
        <XAxis
          type="number"
          domain={[0, totalSpan]}
          tickFormatter={(value) => formatTimelineDate(addDays(timelineStart, value))}
          tickCount={6}
          stroke="var(--text-hint)"
        />
        <YAxis type="category" dataKey="label" width={150} stroke="var(--text-hint)" tick={{ fontSize: 12 }} />
        <ReferenceLine x={todayOffset} stroke="var(--amber)" strokeDasharray="4 4" label={{ value: 'Today', fill: 'var(--amber)', fontSize: 12 }} />
        <Tooltip
          content={<ProjectRoadmapTooltip timelineStart={timelineStart} />}
          cursor={{ fill: 'rgba(0, 82, 204, 0.04)' }}
        />
        {variant === 'planned-vs-actual' && (
          <>
            <Bar dataKey="offsetDays" stackId="planned" fill="rgba(0,0,0,0)" isAnimationActive={false} legendType="none" />
            <Bar dataKey="plannedPhase1Days" stackId="planned" radius={[6, 0, 0, 6]} isAnimationActive={false}>
              {rows.map((row, index) => (
                <Cell key={`planned-phase-1-${index}`} fill="#1a73e8" />
              ))}
            </Bar>
            <Bar dataKey="plannedPhase2Days" stackId="planned" radius={[0, 6, 6, 0]} isAnimationActive={false}>
              {rows.map((row, index) => (
                <Cell key={`planned-phase-2-${index}`} fill="#78a9ff" />
              ))}
            </Bar>
            <Bar dataKey="actualOffsetDays" stackId="actual" fill="rgba(0,0,0,0)" isAnimationActive={false} legendType="none" />
            <Bar dataKey="actualPhase1Days" stackId="actual" radius={[6, 0, 0, 6]} isAnimationActive={false}>
              {rows.map((row, index) => (
                <Cell key={`actual-phase-1-${index}`} fill="#00a76f" />
              ))}
            </Bar>
            <Bar dataKey="actualPhase2Days" stackId="actual" radius={[0, 6, 6, 0]} isAnimationActive={false}>
              {rows.map((row, index) => (
                <Cell key={`actual-phase-2-${index}`} fill="#6ed8b8" />
              ))}
            </Bar>
          </>
        )}
        {variant === 'phase-1-scheduled' && (
          <>
            <Bar dataKey="offsetDays" stackId="phase1" fill="rgba(0,0,0,0)" isAnimationActive={false} legendType="none" />
            <Bar dataKey="plannedPhase1Days" stackId="phase1" radius={[6, 6, 6, 6]} isAnimationActive={false}>
              {rows.map((row, index) => (
                <Cell key={`phase-1-scheduled-${index}`} fill="#1a73e8" />
              ))}
            </Bar>
          </>
        )}
        {variant === 'phase-2-scheduled' && (
          <>
            <Bar dataKey="phase2OffsetDays" stackId="phase2" fill="rgba(0,0,0,0)" isAnimationActive={false} legendType="none" />
            <Bar dataKey="plannedPhase2Days" stackId="phase2" radius={[6, 6, 6, 6]} isAnimationActive={false}>
              {rows.map((row, index) => (
                <Cell key={`phase-2-scheduled-${index}`} fill="#78a9ff" />
              ))}
            </Bar>
          </>
        )}
        {variant === 'phase-1-and-2' && (
          <>
            <Bar dataKey="offsetDays" stackId="phase-1-and-2" fill="rgba(0,0,0,0)" isAnimationActive={false} legendType="none" />
            <Bar dataKey="plannedPhase1Days" stackId="phase-1-and-2" radius={[6, 0, 0, 6]} isAnimationActive={false}>
              {rows.map((row, index) => (
                <Cell key={`phase-1-and-2-p1-${index}`} fill="#1a73e8" />
              ))}
            </Bar>
            <Bar dataKey="plannedPhase2Days" stackId="phase-1-and-2" radius={[0, 6, 6, 0]} isAnimationActive={false}>
              {rows.map((row, index) => (
                <Cell key={`phase-1-and-2-p2-${index}`} fill="#78a9ff" />
              ))}
            </Bar>
          </>
        )}
        {variant === 'project-roadmap' && (
          <>
            <Bar dataKey="offsetDays" stackId="roadmap-planned" fill="rgba(0,0,0,0)" isAnimationActive={false} legendType="none" />
            <Bar dataKey="plannedTotalDays" stackId="roadmap-planned" radius={[6, 6, 6, 6]} isAnimationActive={false}>
              {rows.map((row, index) => (
                <Cell key={`roadmap-planned-${index}`} fill="#1a73e8" />
              ))}
            </Bar>
            <Bar dataKey="actualOffsetDays" stackId="roadmap-actual" fill="rgba(0,0,0,0)" isAnimationActive={false} legendType="none" />
            <Bar dataKey="actualTotalDays" stackId="roadmap-actual" radius={[6, 6, 6, 6]} isAnimationActive={false}>
              {rows.map((row, index) => (
                <Cell key={`roadmap-actual-${index}`} fill="#00a76f" />
              ))}
            </Bar>
          </>
        )}
      </BarChart>
    </ResponsiveContainer>
  )
}

// Main entry for the director dashboard experience.
export default function DirectorDashboard() {
  const [graph, loading, refetch] = useDirectorGraph()
  const [activeNav, setActiveNav] = useState(0)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalAction, setModalAction] = useState('')
  const [modalPayload, setModalPayload] = useState(null)
  const [selectedCoordinator, setSelectedCoordinator] = useState(null)
  const [sidebarMode, setSidebarMode] = useState('expanded')
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false)
  const [selectedProjectDetailsId, setSelectedProjectDetailsId] = useState(null)

  const user = (() => {
    try { return JSON.parse(sessionStorage.getItem('pf_user') || localStorage.getItem('pf_user') || 'null') } catch { return null }
  })()

  // Build dashboard shape from real graph data
  const dashboard = graph ? {
    profile: {
      name: user?.name || 'Director',
      role: 'Director',
      subtitle: user?.email || '',
      initials: (user?.name || 'D').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2),
    },
    header: {
      title: 'Director Overview',
      subtitle: `${graph.totalProjects} Projects · ${graph.totalStudents} Team members · ${graph.totalCoordinators} Coordinators`,
    },
    kpis: [
      { icon: '📁', bg: '#eef2ff', color: '#1a3faa', value: String(graph.totalProjects), label: 'Total Projects', trend: 'up', trendTxt: 'Active' },
      { icon: '👥', bg: '#e0f2fe', color: '#0369a1', value: String(graph.totalStudents), label: 'Team members', trend: 'up', trendTxt: '' },
      { icon: '🎓', bg: '#dcfce7', color: '#15803d', value: String(graph.totalCoordinators), label: 'Coordinators', trend: 'up', trendTxt: '' },
      { icon: '✔', bg: '#fef9c3', color: '#a16207', value: String(graph.completedProjects), label: 'Completed', trend: 'up', trendTxt: '' },
    ],
    projects: graph.projects.map(p => ({
      id: p.id || p._id || null,
      raw: p,
      name: p.title,
      coord: p.coordinator_name || '—',
      domain: p.domain || 'General',
      n: p.studentCount || 0,
      pct: p.pct || 0,
      color: p.status === 'completed' ? '#16a34a' : '#1a3faa',
      dl: p.deadline || 'TBD',
      badge: p.status === 'completed' ? 'badge-green' : 'badge-amber',
      status: p.status === 'completed' ? 'Completed' : 'Active',
      startDate: p.start_date || p.created_at,
      dueDate: p.deadline,
      createdAt: p.created_at,
      milestones: [],
    })),
    students: graph.students,
    coordinators: graph.coordinators,
    activities: graph.recentSubmissions.slice(0, 8).map(s => ({
      dot: s.review_status === 'approved' ? '#16a34a' : s.review_status === 'rejected' ? '#dc2626' : '#1a3faa',
      text: `${s.student_email || 'Team member'} submitted work for task`,
      time: new Date(s.submitted_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
    })),
    userDistribution: [
      { name: 'Team members', value: graph.totalStudents, fill: '#0052CC' },
      { name: 'Coordinators', value: graph.totalCoordinators, fill: '#36B37E' },
    ],
    departments: [],
  } : { ...directorDashboardFallback, projects: [], activities: [], kpis: directorDashboardFallback.kpis.map(k => ({ ...k, value: '…' })) }

  const previousTeamMembers = (() => {
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

    return Array.from(byEmail.values())
  })()

  const openModal = (action, payload = null) => { setModalAction(action); setModalPayload(payload); setModalOpen(true) }
  const openCoordinator = (coord) => setSelectedCoordinator(coord)
  const closeCoordinator = () => setSelectedCoordinator(null)
  const openCreateProject = () => setIsCreateProjectOpen(true)
  const closeCreateProject = () => setIsCreateProjectOpen(false)

  if (loading) return (
    <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 40, height: 40, border: '4px solid #eef2ff', borderTop: '4px solid #1a3faa', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  return (
    <div data-role="director" style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <ActionModal isOpen={modalOpen} onClose={() => setModalOpen(false)} actionName={modalAction} actionPayload={modalPayload} onSuccess={refetch} />
      <Sidebar
        mode={sidebarMode}
        role="director"
        userName={dashboard.profile.name}
        userInitials={dashboard.profile.initials}
        userSub={dashboard.profile.subtitle}
        navItems={navItems}
        activeNav={activeNav}
        onNavChange={setActiveNav}
        onToggleMode={() => setSidebarMode(prev => prev === 'mini' ? 'expanded' : 'mini')}
      />
      <main className="main-content">
        {activeNav === 0 && <OverviewPanel dashboard={dashboard} openModal={openModal} openCreateProject={openCreateProject} sidebarMode={sidebarMode} setSidebarMode={setSidebarMode} onViewProjectDetails={setSelectedProjectDetailsId} />}
        {activeNav === 1 && <AllProjectsPanel dashboard={dashboard} openCreateProject={openCreateProject} sidebarMode={sidebarMode} setSidebarMode={setSidebarMode} onViewProjectDetails={setSelectedProjectDetailsId} />}
        {activeNav === 2 && <DirectorAlertsPanel alerts={graph?.alerts?.history || []} onViewProjectDetails={setSelectedProjectDetailsId} />}
        {activeNav === 3 && <TeamsPanel graph={graph} sidebarMode={sidebarMode} setSidebarMode={setSidebarMode} openCoordinator={openCoordinator} />}
        {activeNav === 4 && <AnalyticsPanel dashboard={dashboard} sidebarMode={sidebarMode} setSidebarMode={setSidebarMode} />}
        {activeNav === 5 && <ReportsPanel openModal={openModal} dashboard={dashboard} sidebarMode={sidebarMode} setSidebarMode={setSidebarMode} />}
        {activeNav === 6 && <CoordinatorsPanel graph={graph} openCoordinator={openCoordinator} />}
        {selectedCoordinator && (
          <CoordinatorModal
            coordinator={selectedCoordinator}
            projects={graph?.projects || []}
            projectStudents={graph?.projectStudents || []}
            students={graph?.students || []}
            onClose={closeCoordinator}
          />
        )}
        {isCreateProjectOpen && (
          <CreateProjectModal
            isOpen={isCreateProjectOpen}
            coordinator={null}
            coordinatorId={null}
            simpleMode={true}
            previousTeamMembers={previousTeamMembers}
            coordinators={graph?.coordinators || []}
            onClose={closeCreateProject}
            onCreated={() => {
              refetch && refetch()
            }}
          />
        )}
        <ProjectDetailsModal
          isOpen={!!selectedProjectDetailsId}
          projectId={selectedProjectDetailsId}
          onClose={() => setSelectedProjectDetailsId(null)}
        />
        {activeNav === 7 && <StudentsPanel graph={graph} />}
        {activeNav === 8 && <AssignCoordinatorsPanel refetch={refetch} />}
        {activeNav === 9 && <SettingsPanel dashboard={dashboard} refetch={refetch} />}
      </main>
    </div>
  )
}

/* ─── Overview Panel ──────────────────────────────────── */
function OverviewPanel({ dashboard, openModal, openCreateProject, sidebarMode, setSidebarMode, onViewProjectDetails }) {
  const [filterType, setFilterType] = useState('')
  const [filterValue, setFilterValue] = useState('')

  const domainOptions = getSortedDomainOptions(dashboard.projects)
  const coordinatorOptions = Array.from(new Set(dashboard.projects.map(project => project.coord)))
  const statusOptions = Array.from(new Set(dashboard.projects.map(project => project.status)))

  const filterOptionsByType = {
    Domain: domainOptions,
    Coordinator: coordinatorOptions,
    Status: statusOptions,
  }

  const activeOptions = filterOptionsByType[filterType] || []

  const filteredProjects = dashboard.projects.filter((project) => {
    if (!filterType || !filterValue) return true
    if (filterType === 'Domain') return getDomain(project) === filterValue
    if (filterType === 'Coordinator') return project.coord === filterValue
    if (filterType === 'Status') return project.status === filterValue
    return true
  })

  const highlightProjects = (() => {
    const recent = dashboard.projects.slice(0, 3)
    const fast = [...dashboard.projects].sort((a, b) => b.pct - a.pct).slice(0, 2)
    const addressed = dashboard.projects.filter(project => project.status === 'On Track').slice(0, 2)
    const seen = new Set()
    return [...recent, ...addressed, ...fast].filter((project) => {
      if (seen.has(project.name)) return false
      seen.add(project.name)
      return true
    })
  })()

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
            <h1 className="page-title">{dashboard?.header?.title || 'Director Overview'}</h1>
            <p className="page-sub">{dashboard?.header?.subtitle || ''}</p>
          </div>
        </div>
        <div className="topbar-actions">
          <button className="btn-primary" onClick={() => openCreateProject()}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{marginRight:6,verticalAlign:'middle'}}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Create Project
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

      <div className="content-grid" style={{ gridTemplateColumns: '1fr' }}>
        <div className="card">
          <div className="card-head" style={{ justifyContent: 'flex-start', gap: 16 }}>
            <h2 className="card-title">Project Portfolio</h2>
            <div className="portfolio-filters" style={{ marginLeft: 24 }}>
              <select
                value={filterType}
                onChange={(e) => {
                  const nextType = e.target.value
                  setFilterType(nextType)
                  setFilterValue('')
                }}
                className="portfolio-select"
              >
                <option value="" disabled>Filter by</option>
                <option value="Domain">Domain</option>
                <option value="Coordinator">Coordinator</option>
                <option value="Status">Status</option>
              </select>
              <select
                value={filterValue}
                onChange={(e) => setFilterValue(e.target.value)}
                disabled={!filterType}
                className="portfolio-select"
              >
                <option value="" disabled>{filterType ? 'Select value' : 'Choose filter first'}</option>
                {activeOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
          </div>
          <table className="data-table">
            <thead><tr><th>Project Name</th><th>Domain</th><th>Coordinator</th><th>Progress</th><th>Deadline</th><th>Status</th></tr></thead>
            <tbody>
              {(filterType && filterValue ? filteredProjects : highlightProjects).map((p, i) => (
                <tr key={i}>
                  <td style={{ color: 'var(--royal)', fontWeight: 600, cursor: 'pointer' }} onClick={() => onViewProjectDetails(p.id)}>{p.name}</td>
                  <td>{getDomain(p)}</td>
                  <td>{p.coord}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="progress-bar" style={{ flex: 1 }}><div className="progress-fill" style={{ width: `${p.pct}%`, background: p.color }}></div></div>
                      <span style={{ fontSize: '0.85rem', fontWeight: 500, minWidth: '32px', textAlign: 'right' }}>{p.pct}%</span>
                    </div>
                  </td>
                  <td>{p.dl}</td>
                  <td><span className={`badge ${p.badge}`}>{p.status.toUpperCase()}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-head"><h2 className="card-title">System Activity Log</h2></div>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {dashboard.activities.map((a, i) => (
              <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--royal-border)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: a.dot, flexShrink: 0 }}></span>
                <div style={{ flex: 1, fontSize: '0.9rem', color: 'var(--text-body)' }}>{a.text}</div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-hint)' }}>{a.time}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  )
}

/* ─── All Projects Panel ───────────────────────────────── */
function AllProjectsPanel({ dashboard, openCreateProject, onViewProjectDetails }) {
  const [filterType, setFilterType] = useState('')
  const [filterValue, setFilterValue] = useState('')

  const domainOptions = getSortedDomainOptions(dashboard.projects)
  const coordinatorOptions = Array.from(new Set(dashboard.projects.map(project => project.coord)))
  const statusOptions = Array.from(new Set(dashboard.projects.map(project => project.status)))

  const filterOptionsByType = {
    Domain: domainOptions,
    Coordinator: coordinatorOptions,
    Status: statusOptions,
  }

  const activeOptions = filterOptionsByType[filterType] || []

  const filteredProjects = dashboard.projects.filter((project) => {
    if (!filterType || !filterValue) return true
    if (filterType === 'Domain') return getDomain(project) === filterValue
    if (filterType === 'Coordinator') return project.coord === filterValue
    if (filterType === 'Status') return project.status === filterValue
    return true
  })

  return (
    <>
      <header className="topbar">
        <div><h1 className="page-title">All Projects</h1><p className="page-sub">Full portfolio view of all active and completed projects</p></div>
        <div className="topbar-actions">
          <button className="btn-primary" onClick={() => openCreateProject && openCreateProject()}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{marginRight:6,verticalAlign:'middle'}}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Create New Project
          </button>
        </div>
      </header>
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-head" style={{ justifyContent: 'flex-start', gap: 16 }}>
          <h2 className="card-title">Project Registry</h2>
          <span className="badge badge-green">{dashboard.projects.length} Projects</span>
          <div className="portfolio-filters" style={{ marginLeft: 16 }}>
            <select
              value={filterType}
              onChange={(e) => {
                const nextType = e.target.value
                setFilterType(nextType)
                setFilterValue('')
              }}
              className="portfolio-select"
            >
              <option value="" disabled>Filter by</option>
              <option value="Domain">Domain</option>
              <option value="Coordinator">Coordinator</option>
              <option value="Status">Status</option>
            </select>
            <select
              value={filterValue}
              onChange={(e) => setFilterValue(e.target.value)}
              disabled={!filterType}
              className="portfolio-select"
            >
              <option value="" disabled>{filterType ? 'Select value' : 'Choose filter first'}</option>
              {activeOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
        </div>
        <table className="data-table">
          <thead><tr><th>#</th><th>Project Name</th><th>Domain</th><th>Coordinator</th><th>Progress</th><th>Deadline</th><th>Status</th></tr></thead>
          <tbody>
            {filteredProjects.map((p, i) => (
              <tr key={i}>
                <td style={{ color: 'var(--text-hint)' }}>{String(i+1).padStart(2,'0')}</td>
                <td style={{ color: 'var(--royal)', fontWeight: 600, cursor: 'pointer' }} onClick={() => onViewProjectDetails && onViewProjectDetails(p.id)}>{p.name}</td>
                <td>{getDomain(p)}</td>
                <td>{p.coord}</td>
                <td style={{ minWidth: 120 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div className="progress-bar" style={{ flex: 1 }}><div className="progress-fill" style={{ width: `${p.pct}%`, background: p.color }}></div></div>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{p.pct}%</span>
                  </div>
                </td>
                <td>{p.dl}</td>
                <td><span className={`badge ${p.badge}`}>{p.status.toUpperCase()}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

/* ─── Analytics Panel ──────────────────────────────────── */
function AnalyticsPanel({ dashboard }) {
  const [filterType, setFilterType] = useState('')
  const [filterValue, setFilterValue] = useState('')

  const projects = dashboard.projects || []
  const coordinatorOptions = Array.from(new Set(projects.map(project => project.coord)))
  const domainOptions = getSortedDomainOptions(projects)
  const projectOptions = projects.map(project => project.name)

  const filterOptionsByType = {
    Staff: coordinatorOptions,
    Domain: domainOptions,
    Project: projectOptions,
  }

  const activeOptions = filterOptionsByType[filterType] || []

  const filteredProjects = projects.filter((project) => {
    if (!filterType || !filterValue) return true
    if (filterType === 'Staff') return project.coord === filterValue
    if (filterType === 'Domain') return getDomain(project) === filterValue
    if (filterType === 'Project') return project.name === filterValue
    return true
  })

  const { rows: deliveryRows, timelineStart, timelineEnd } = buildProjectRoadmapRows(filteredProjects)

  return (
    <>
      <header className="topbar">
        <div><h1 className="page-title">Analytics</h1><p className="page-sub">In-depth metrics and performance data across all projects</p></div>
        <div className="topbar-actions">
          <div className="portfolio-filters">
            <select
              value={filterType}
              onChange={(e) => {
                const nextType = e.target.value
                setFilterType(nextType)
                setFilterValue('')
              }}
              className="portfolio-select"
            >
              <option value="" disabled>Filter by</option>
              <option value="Staff">Staff</option>
              <option value="Domain">Domain</option>
              <option value="Project">Project</option>
            </select>
            <select
              value={filterValue}
              onChange={(e) => setFilterValue(e.target.value)}
              disabled={!filterType}
              className="portfolio-select"
            >
              <option value="" disabled>{filterType ? 'Select value' : 'Choose filter first'}</option>
              {activeOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
        </div>
      </header>
      <div className="content-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
        <div className="card">
          <div className="card-head" style={{ justifyContent: 'flex-start', gap: 16 }}>
            <div>
              <h2 className="card-title">Planned vs Actual</h2>
              <p className="page-sub" style={{ marginTop: 4 }}>Phase 1 and Phase 2 are shown for scheduled and actual timelines.</p>
            </div>
          </div>
          <div style={{ height: 340 }}>
            <ProjectRoadmapGantt rows={deliveryRows} timelineStart={timelineStart} timelineEnd={timelineEnd} variant="planned-vs-actual" />
          </div>
        </div>
        <div className="card">
          <div className="card-head" style={{ justifyContent: 'flex-start', gap: 16 }}>
            <div>
              <h2 className="card-title">Phase 1 and Phase 2</h2>
              <p className="page-sub" style={{ marginTop: 4 }}>Shows scheduled Phase 1 and Phase 2 breakdown for each project.</p>
            </div>
          </div>
          <div style={{ height: 340 }}>
            <ProjectRoadmapGantt rows={deliveryRows} timelineStart={timelineStart} timelineEnd={timelineEnd} variant="phase-1-and-2" />
          </div>
        </div>
        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <div className="card-head" style={{ justifyContent: 'flex-start', gap: 16 }}>
            <div>
              <h2 className="card-title">Project Roadmap Gantt</h2>
              <p className="page-sub" style={{ marginTop: 4 }}>High-level roadmap comparison of planned and actual overall duration.</p>
            </div>
          </div>
          <div style={{ height: 340 }}>
            <ProjectRoadmapGantt rows={deliveryRows} timelineStart={timelineStart} timelineEnd={timelineEnd} variant="project-roadmap" />
          </div>
        </div>
      </div>
    </>
  )
}

/* ─── Reports Panel ────────────────────────────────────── */
function ReportsPanel({ openModal, dashboard }) {
  const reportFormats = ['PDF', 'Excel', 'Word']
  async function downloadProject(project, idx) {
    try {
      const sel = document.getElementById(`report-format-${idx}`)
      const format = (sel?.value || 'PDF').toLowerCase()
      // derive project id from common fields to be defensive
      const projectId = project?.id || project?._id || project?.project_id || project?.projectId || null
      if (!projectId) {
        console.error('downloadProject called with invalid project:', project)
        throw new Error('Project ID is required.')
      }
      // fetch project-scoped data
      const payload = await fetchProjectReport(projectId)

      if (format === 'pdf') {
        let prepared
        if (typeof window !== 'undefined' && window.ReportsPageHelper && typeof window.ReportsPageHelper.buildProjectPayloadForPdf === 'function') {
          prepared = window.ReportsPageHelper.buildProjectPayloadForPdf(payload)
        } else {
          const p = payload.project || {}
          prepared = {
            project: p,
            coordinator: (payload.usersById && payload.usersById[p.coordinator_id]) || {},
            teamMembers: (payload.projectStudents || []).map(ps => ({ name: ps.student_name || ps.student_email, role: ps.role })),
            modules: payload.modules || [],
            milestones: [],
            activities: [],
            preparedBy: 'Director',
            generatedAt: new Date(),
            summary: '',
          }
        }
        generateIndividualProjectReportPdf(prepared)
      } else if (format === 'csv') {
        // use helper converter
        const csv = _convertReportToCSV(payload)
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
        const link = document.createElement('a')
        link.href = URL.createObjectURL(blob)
        link.setAttribute('download', `${(project.title||project.name||project.id).replace(/[^a-z0-9]+/gi, '_')}_Report.csv`)
        document.body.appendChild(link)
        link.click()
        link.remove()
      } else if (format === 'word' || format === 'docx') {
        try {
          const docxMod = await import('docx')
          const { Document, Packer, Paragraph, TextRun } = docxMod
          const doc = new Document({ sections: [{ children: [] }] })
          const p = payload.project || {}
          const usersById = payload.usersById || {}

          // Title
          const coordinatorName = (usersById && usersById[p.coordinator_id] && usersById[p.coordinator_id].name) || p.coordinator_name || '—'
          const generatedAt = new Date().toLocaleString()
          doc.addSection({ children: [
            new Paragraph({ children: [new TextRun({ text: String(p.title || p.name || 'Project Report'), bold: true, size: 28 })] }),
            new Paragraph({ children: [new TextRun({ text: 'Coordinator: ' + coordinatorName })] }),
            new Paragraph({ children: [new TextRun({ text: 'Generated: ' + generatedAt })] }),
            new Paragraph({ children: [new TextRun({ text: '' })] }),
          ]})

          // Team members
          const students = payload.projectStudents || []
          doc.addSection({ children: [
            new Paragraph({ children: [new TextRun({ text: 'Team Members', bold: true })] }),
            ...students.slice(0, 200).map((s) => new Paragraph({ children: [new TextRun({ text: `• ${s.student_name || s.student_email || s.student_id || ''}` })] })),
          ]})

          // Modules summary
          const modules = payload.modules || []
          doc.addSection({ children: [
            new Paragraph({ children: [new TextRun({ text: '' })] }),
            new Paragraph({ children: [new TextRun({ text: 'Modules', bold: true })] }),
            ...modules.map(m => new Paragraph({ children: [new TextRun({ text: `• ${m.name || m.module_name || m.title || m.id || ''}` })] })),
          ]})

          const blob = await Packer.toBlob(doc)
          const url = URL.createObjectURL(blob)
          const link2 = document.createElement('a')
          link2.href = url
          link2.setAttribute('download', `${(project.title||project.name||project.id).replace(/[^a-z0-9]+/gi, '_')}_Report.docx`)
          document.body.appendChild(link2)
          link2.click()
          link2.remove()
        } catch (err) {
          console.error('Word export failed:', err)
          alert('Word export failed — install the docx package or use PDF/Excel/CSV')
        }
      } else if (format === 'excel') {
        try {
          const XLSXMod = await import('xlsx')
          const XLSX = XLSXMod.default || XLSXMod
          const wb = XLSX.utils.book_new()
          const rows = _convertProjectReportToSheetRows(payload)
          const ws = XLSX.utils.json_to_sheet(rows)
          XLSX.utils.book_append_sheet(wb, ws, 'Project Summary')
          XLSX.writeFile(wb, `${(project.title||project.name||project.id).replace(/[^a-z0-9]+/gi, '_')}_Report.xlsx`)
        } catch (err) {
          console.error('Excel export failed:', err)
          alert('Excel export failed — install xlsx or use PDF/CSV')
        }
      }
    } catch (e) {
      console.error('downloadProject error:', e)
      alert('Unable to generate project report')
    }
  }
  return (
    <>
      <header className="topbar">
        <div><h1 className="page-title">Reports</h1><p className="page-sub">Download, generate and view system generated reports</p></div>
        <div className="topbar-actions" />
      </header>
      <div className="card">
        <div className="card-head"><h2 className="card-title">Project Reports</h2></div>
        <table className="data-table">
          <thead><tr><th>Project</th><th>Domain</th><th>Coordinator</th><th>Report</th><th>Format</th><th>Action</th></tr></thead>
          <tbody>
            {dashboard.projects.map((project, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 600, color: 'var(--text-head)' }}>{project.name}</td>
                <td>{getDomain(project)}</td>
                <td>{project.coord}</td>
                <td>
                  <span style={{ color: 'var(--text-body)', fontWeight: 600 }}>Full Project Details</span>
                </td>
                <td>
                  <select id={`report-format-${i}`} className="portfolio-select" defaultValue={reportFormats[0]}>
                    {reportFormats.map((format) => (
                      <option key={format} value={format}>{format}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <button
                    className="btn-outline"
                    style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                    onClick={() => downloadProject(project, i)}
                  >
                    Download
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

/* ─── Settings Panel ───────────────────────────────────── */
function SettingsPanel({ dashboard, refetch }) {
  const profile = dashboard?.profile || {}
  const user = (() => {
    try {
      return JSON.parse(sessionStorage.getItem('pf_user') || localStorage.getItem('pf_user') || 'null')
    } catch {
      return null
    }
  })()

  const [coordinatorForm, setCoordinatorForm] = useState({ name: '', email: '', department: '' })
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [creating, setCreating] = useState(false)
  const [changing, setChanging] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')

  const createCoordinator = async () => {
    setStatusMsg('')
    if (!coordinatorForm.name.trim() || !coordinatorForm.email.trim()) {
      setStatusMsg('Name and email are required.')
      return
    }
    setCreating(true)
    try {
      await createManagedUser({
        creatorRole: String(user?.role || 'director').toLowerCase(),
        creatorEmail: user?.email || '',
        role: 'coordinator',
        name: coordinatorForm.name,
        email: coordinatorForm.email,
        department: coordinatorForm.department || 'General',
      })
      setCoordinatorForm({ name: '', email: '', department: '' })
      setStatusMsg('Coordinator account created with default password 123456.')
      await refetch?.()
    } catch (error) {
      setStatusMsg(error?.message || 'Unable to create coordinator right now.')
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
    <>
      <header className="topbar">
        <div><h1 className="page-title">Settings</h1><p className="page-sub">Create coordinator accounts and change your password</p></div>
      </header>
      <div className="content-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
        <div className="card">
          <div className="card-head"><h2 className="card-title">Account Details</h2></div>
          {[
            ['Full Name', profile.name || '—'],
            ['Email', profile.email || '—'],
            ['Role', profile.role || 'Director'],
            ['Department', profile.department || '—'],
          ].map(([label, value]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--royal-border)' }}>
              <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)', fontWeight: 500 }}>{label}</span>
              <span style={{ fontSize: '0.875rem', color: 'var(--text-head)', fontWeight: 600 }}>{value}</span>
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
          <div className="card-head"><h2 className="card-title">Create Coordinator</h2></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            <SettingInput label="Name" value={coordinatorForm.name} onChange={(value) => setCoordinatorForm(prev => ({ ...prev, name: value }))} />
            <SettingInput label="Email" value={coordinatorForm.email} onChange={(value) => setCoordinatorForm(prev => ({ ...prev, email: value }))} />
            <SettingInput label="Department" value={coordinatorForm.department} onChange={(value) => setCoordinatorForm(prev => ({ ...prev, department: value }))} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, gap: 12 }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>New coordinator accounts are created with default password 123456.</div>
            <button className="btn-primary" onClick={createCoordinator} disabled={creating}>
              {creating ? 'Creating...' : 'Create Coordinator'}
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

function SettingInput({ label, value, onChange, disabled = false, type = 'text' }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--royal-border)' }}>
      <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)', fontWeight: 500 }}>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        disabled={disabled}
        style={{
          width: 230,
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

function SettingSelect({ label, value, options, onChange, disabled = false }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--royal-border)' }}>
      <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)', fontWeight: 500 }}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        disabled={disabled}
        style={{
          width: 230,
          border: '1px solid var(--royal-border)',
          borderRadius: 8,
          padding: '8px 10px',
          fontSize: '0.85rem',
          color: 'var(--text-head)',
          background: '#fff',
        }}
      >
        {options.map(option => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </div>
  )
}

function SettingToggle({ label, checked, onChange, disabled = false }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--royal-border)' }}>
      <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)', fontWeight: 500 }}>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange?.(e.target.checked)}
        disabled={disabled}
        style={{ width: 18, height: 18 }}
      />
    </div>
  )
}


/* ─── Teams Panel ──────────────────────────────────────── */
function TeamsPanel({ graph, sidebarMode, setSidebarMode, openCoordinator }) {
  const coordinators = graph?.coordinators || []
  const projects = graph?.projects || []

  return (
    <>
      <header className="topbar">
        <div><h1 className="page-title">Teams</h1><p className="page-sub">Overview of all coordinators and their project teams</p></div>
      </header>
      <div className="kpi-grid">
        <div className="kpi-card"><div className="kpi-icon" style={{background:'#EBF5FB',color:'#2E86C1'}}>👥</div><div className="kpi-body"><span className="kpi-label">Total Teams</span><span className="kpi-value">{coordinators.length}</span></div></div>
        <div className="kpi-card"><div className="kpi-icon" style={{background:'#E9F7EF',color:'#1E8449'}}>🎓</div><div className="kpi-body"><span className="kpi-label">Total Team Members</span><span className="kpi-value">{graph?.totalStudents || 0}</span></div></div>
        <div className="kpi-card"><div className="kpi-icon" style={{background:'#FEF9E7',color:'#D4AC0D'}}>📁</div><div className="kpi-body"><span className="kpi-label">Active Projects</span><span className="kpi-value">{projects.filter(p => p.status !== 'completed').length}</span></div></div>
        <div className="kpi-card"><div className="kpi-icon" style={{background:'#FDEDEC',color:'#C0392B'}}>✔</div><div className="kpi-body"><span className="kpi-label">Completed</span><span className="kpi-value">{projects.filter(p => p.status === 'completed').length}</span></div></div>
      </div>
      <div className="card">
        <div className="card-head"><h2 className="card-title">Coordinator Teams</h2></div>
        {coordinators.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', padding: '20px 0' }}>No coordinators registered yet.</p>
        ) : (
          <table className="data-table">
            <thead><tr><th>Coordinator</th><th>Email</th><th>Department</th><th>Projects</th><th>Team Members</th></tr></thead>
            <tbody>
              {coordinators.map((c, i) => {
                const coordProjects = projects.filter(p => p.coordinator_id === c.id || p.coordinator_email === c.email)
                const studentCount = coordProjects.reduce((sum, p) => sum + (p.studentCount || 0), 0)
                return (
                  <tr key={i} onClick={() => openCoordinator?.(c)} style={{ cursor: 'pointer' }}>
                    <td style={{ fontWeight: 700, color: 'var(--text-head)' }}>{c.name}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{c.email}</td>
                    <td>{c.department || '—'}</td>
                    <td>{coordProjects.length}</td>
                    <td>{studentCount}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}

/* ─── Students Panel ───────────────────────────────────── */
function StudentsPanel({ graph }) {
  const students = graph?.students || []
  const projectStudents = graph?.projectStudents || []
  const projects = graph?.projects || []
  const projectMap = Object.fromEntries(projects.map(p => [p.id, p]))

  return (
    <>
      <header className="topbar">
        <div><h1 className="page-title">Team members</h1><p className="page-sub">All registered team members and their project assignments</p></div>
      </header>
      <div className="kpi-grid">
        <div className="kpi-card"><div className="kpi-icon" style={{background:'#eef2ff',color:'#1a3faa'}}>🎓</div><div className="kpi-body"><span className="kpi-label">Total Team Members</span><span className="kpi-value">{students.length}</span></div></div>
        <div className="kpi-card"><div className="kpi-icon" style={{background:'#dcfce7',color:'#15803d'}}>📋</div><div className="kpi-body"><span className="kpi-label">Assigned to Projects</span><span className="kpi-value">{new Set(projectStudents.map(ps => ps.student_id)).size}</span></div></div>
      </div>
      <div className="card">
        <div className="card-head"><h2 className="card-title">Team Member Directory</h2><span className="badge badge-green">{students.length} Team Members</span></div>
        {students.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', padding: '20px 0' }}>No team members registered yet.</p>
        ) : (
          <table className="data-table">
            <thead><tr><th>Name</th><th>Reg No</th><th>Email</th><th>Department</th><th>Project</th><th>Module</th></tr></thead>
            <tbody>
              {students.map((s, i) => {
                const membership = projectStudents.find(ps => ps.student_id === s.id || ps.student_email === s.email)
                const project = membership ? projectMap[membership.project_id] : null
                return (
                  <tr key={i}>
                    <td style={{ fontWeight: 700, color: 'var(--text-head)' }}>{s.name || '—'}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{s.roll_no || membership?.roll_no || '—'}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{s.email}</td>
                    <td>{s.department || '—'}</td>
                    <td style={{ color: 'var(--royal)', fontWeight: 600 }}>{project?.title || <span style={{ color: 'var(--text-hint)' }}>Not assigned</span>}</td>
                    <td>{membership?.module_name || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}

/* ─── Assign Coordinators Panel ───────────────────────── */
function AssignCoordinatorsPanel({ refetch }) {
  const user = (() => {
    try {
      return JSON.parse(sessionStorage.getItem('pf_user') || localStorage.getItem('pf_user') || 'null')
    } catch {
      return null
    }
  })()

  const [form, setForm] = useState({ name: '', email: '', domain: 'Web Dev', staffId: '', customDomain: '' })
  const [saving, setSaving] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')
  const [toast, setToast] = useState(null)

  const emailValid = /.+@.+\..+/.test(String(form.email || '').trim())
  const domainOptions = [
    'Web Dev',
    'ML',
    'Artificial Intelligence',
    'Data Science',
    'Robotics',
    'Mobile',
    'UI/UX Design',
    'Cyber Security',
    'Cloud Computing',
    'IoT',
    'DevOps',
    'Blockchain',
    'Others',
  ]

  useEffect(() => {
    if (!toast) return undefined
    const timer = setTimeout(() => setToast(null), 2800)
    return () => clearTimeout(timer)
  }, [toast])

  const assignCoordinator = async (event) => {
    event.preventDefault()
    const name = String(form.name || '').trim()
    const email = String(form.email || '').trim().toLowerCase()
    const domain = String(form.domain === 'Others' ? form.customDomain : form.domain || '').trim()
    const staffId = String(form.staffId || '').trim()

    if (!name || !email || !domain || !staffId) {
      setStatusMsg('Name, email, domain, and Staff ID are required.')
      return
    }

    if (!emailValid) {
      setStatusMsg('Enter a valid email address.')
      return
    }

    setSaving(true)
    setStatusMsg('')
    try {
      await createManagedUser({
        creatorRole: String(user?.role || 'director').toLowerCase(),
        creatorEmail: user?.email || '',
        role: 'coordinator',
        name,
        email,
        department: domain,
        staff_id: staffId,
      })
      setForm({ name: '', email: '', domain: 'Web Development', staffId: '', customDomain: '' })
      setStatusMsg('Coordinator assigned successfully')
      setToast({ type: 'success', message: 'Coordinator assigned successfully' })
      await refetch?.()
    } catch (error) {
      setStatusMsg(error?.message || 'Unable to assign coordinator right now.')
      setToast({ type: 'error', message: error?.message || 'Unable to assign coordinator right now.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="assign-page-shell">
      {toast && (
        <div className={`assign-toast ${toast.type === 'success' ? 'is-success' : 'is-error'}`}>
          {toast.message}
        </div>
      )}

      <div
        className="assign-card"
      >
        <div className="assign-card__header">
          <div className="assign-icon" aria-hidden="true">◆</div>
          <div>
            <h1 className="assign-title">Assign Coordinator</h1>
            <p className="assign-subtitle">Create a coordinator account with name, email, and domain.</p>
          </div>
        </div>

        <form onSubmit={assignCoordinator} className="assign-form">
          <div className="assign-field">
            <label className="assign-label">Coordinator Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Enter name"
              className="assign-input"
            />
          </div>

          <div className="assign-field">
            <label className="assign-label">Staff ID</label>
            <input
              type="text"
              value={form.staffId}
              onChange={(e) => setForm((prev) => ({ ...prev, staffId: e.target.value }))}
              placeholder="e.g. STF123"
              className="assign-input"
            />
          </div>

          <div className="assign-field">
            <label className="assign-label">Email ID</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
              placeholder="name@company.com"
              className="assign-input"
            />
          </div>

          <div className="assign-field">
            <label className="assign-label">Domain</label>
            <select
              value={form.domain}
              onChange={(e) => setForm((prev) => ({ ...prev, domain: e.target.value }))}
              className="assign-input assign-select"
            >
              {domainOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
            {form.domain === 'Others' && (
              <input
                type="text"
                value={form.customDomain}
                onChange={(e) => setForm((prev) => ({ ...prev, customDomain: e.target.value }))}
                placeholder="Enter custom domain"
                className="assign-input"
                style={{ marginTop: '10px' }}
              />
            )}
          </div>

          <div className="assign-hint">
            Default password will be <strong>123456</strong>
          </div>

          <button
            type="submit"
            className="assign-button"
            disabled={saving}
          >
            {saving && <span className="spinner assign-spinner" />}
            {saving ? 'Assigning...' : 'Assign Coordinator'}
          </button>

          {statusMsg && (
            <div className={`assign-status ${statusMsg.toLowerCase().includes('success') ? 'is-success' : 'is-error'}`}>
              {statusMsg}
            </div>
          )}
        </form>
      </div>
    </div>
  )
}

/* ─── Coordinators Panel ───────────────────────────────── */
function CoordinatorsPanel({ graph, openCoordinator }) {
  const coordinators = graph?.coordinators || []
  const projects = graph?.projects || []

  return (
    <>
      <header className="topbar">
        <div><h1 className="page-title">Coordinators</h1><p className="page-sub">All registered coordinators and their assigned projects</p></div>
      </header>
      <div className="kpi-grid">
        <div className="kpi-card"><div className="kpi-icon" style={{background:'#e0f2fe',color:'#0369a1'}}>👨‍🏫</div><div className="kpi-body"><span className="kpi-label">Total Coordinators</span><span className="kpi-value">{coordinators.length}</span></div></div>
        <div className="kpi-card"><div className="kpi-icon" style={{background:'#fef9c3',color:'#a16207'}}>📁</div><div className="kpi-body"><span className="kpi-label">Active Projects</span><span className="kpi-value">{projects.filter(p => p.status !== 'completed').length}</span></div></div>
      </div>
      <div className="card">
        <div className="card-head"><h2 className="card-title">Coordinator Directory</h2><span className="badge badge-green">{coordinators.length} Coordinators</span></div>
        {coordinators.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', padding: '20px 0' }}>No coordinators registered yet.</p>
        ) : (
          <table className="data-table">
            <thead><tr><th>Name</th><th>Email</th><th>Department</th><th>Projects</th><th>Team Members</th></tr></thead>
            <tbody>
              {coordinators.map((c, i) => {
                const coordProjects = projects.filter(p => p.coordinator_id === c.id || p.coordinator_email === c.email)
                const totalStudents = coordProjects.reduce((sum, p) => sum + (p.studentCount || 0), 0)
                return (
                  <tr key={i} onClick={() => openCoordinator?.(c)} style={{ cursor: 'pointer' }}>
                    <td style={{ fontWeight: 700, color: 'var(--text-head)' }}>{c.name || '—'}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{c.email}</td>
                    <td>{c.department || '—'}</td>
                    <td>{coordProjects.length}</td>
                    <td style={{ fontWeight: 600 }}>{totalStudents}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
