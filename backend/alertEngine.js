const DAY_MS = 24 * 60 * 60 * 1000
const ALERT_NEAR_WINDOW_DAYS = 30
const LOW_PROGRESS_THRESHOLD = 40
const FREQUENT_DELAY_THRESHOLD = 2

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

function studentIdFromEmail(email) {
  return `student-${normalizeEmail(email).replace(/[^a-z0-9]+/gi, '-')}`
}

function toDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatDateLabel(value) {
  if (!value) return ''
  const date = toDate(value)
  if (!date) return String(value)
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function makeInitials(name, fallback = 'ST') {
  const value = String(name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('')
  return value || fallback
}

function daysUntil(date, now) {
  if (!date) return null
  return Math.ceil((date.getTime() - now.getTime()) / DAY_MS)
}

function getUserByIdentity(usersById, studentId, studentEmail) {
  const email = normalizeEmail(studentEmail)
  return (
    usersById?.[String(studentId || '')] ||
    usersById?.[studentIdFromEmail(email)] ||
    Object.values(usersById || {}).find((user) => normalizeEmail(user?.email) === email) ||
    null
  )
}

function getStudentLabel(student, usersById) {
  const user = getUserByIdentity(usersById, student.student_id, student.student_email)
  const name = user?.name || student.student_name || student.name || student.student_email?.split('@')[0] || 'Student'
  const registerNo = user?.roll_no || user?.register_no || student.register_no || student.roll_no || '—'

  return {
    id: user?.id || student.student_id || studentIdFromEmail(student.student_email || student.name || ''),
    student_id: student.student_id || user?.id || null,
    student_email: normalizeEmail(student.student_email || user?.email || ''),
    student_name: name,
    register_no: registerNo,
    initials: makeInitials(name),
  }
}

function getProjectStudents(project, projectStudents, tasks, usersById) {
  const projectId = String(project.id || '')
  const memberships = (Array.isArray(projectStudents) ? projectStudents : []).filter((entry) => String(entry.project_id || '') === projectId)
  const taskAssignments = (Array.isArray(tasks) ? tasks : []).filter((task) => String(task.project_id || '') === projectId && (task.assigned_student_id || task.assigned_student_email))

  const candidates = new Map()

  for (const membership of memberships) {
    const label = getStudentLabel(
      {
        student_id: membership.student_id,
        student_email: membership.student_email,
        student_name: membership.student_name,
        register_no: membership.roll_no || membership.register_no,
      },
      usersById
    )
    candidates.set(label.id, {
      ...label,
      project_id: projectId,
      source: 'membership',
    })
  }

  for (const task of taskAssignments) {
    const label = getStudentLabel(
      {
        student_id: task.assigned_student_id,
        student_email: task.assigned_student_email,
        student_name: task.assigned_student_name,
        register_no: task.roll_no || task.register_no,
      },
      usersById
    )
    candidates.set(label.id, {
      ...label,
      project_id: projectId,
      source: 'task',
    })
  }

  if (candidates.size === 0) {
    return [
      {
        id: `project-${projectId}`,
        student_id: null,
        student_email: '',
        student_name: 'Student',
        register_no: '—',
        initials: 'ST',
        project_id: projectId,
        source: 'fallback',
      },
    ]
  }

  return [...candidates.values()]
}

function matchesStudent(task, student) {
  const taskStudentId = String(task.assigned_student_id || '').trim()
  const taskStudentEmail = normalizeEmail(task.assigned_student_email || '')
  const studentId = String(student.student_id || '').trim()
  const studentEmail = normalizeEmail(student.student_email || '')

  if (studentId && taskStudentId && studentId === taskStudentId) return true
  if (studentEmail && taskStudentEmail && studentEmail === taskStudentEmail) return true
  if (studentEmail && taskStudentId && studentIdFromEmail(studentEmail) === taskStudentId) return true
  if (studentId && taskStudentEmail && studentIdFromEmail(taskStudentEmail) === studentId) return true
  return false
}

function getProjectStats(project, tasks, students, now) {
  const projectTasks = (Array.isArray(tasks) ? tasks : []).filter((task) => String(task.project_id || '') === String(project.id || ''))
  const completedTasks = projectTasks.filter((task) => String(task.status || '').toLowerCase() === 'completed').length
  const projectProgress = projectTasks.length > 0 ? Math.round((completedTasks / projectTasks.length) * 100) : 0
  const deadlineDate = toDate(project.deadline)
  const deadlineLabel = formatDateLabel(project.deadline)
  const daysLeft = daysUntil(deadlineDate, now)

  const studentSummaries = students.map((student) => {
    const studentTasks = projectTasks.filter((task) => matchesStudent(task, student))
    const completed = studentTasks.filter((task) => String(task.status || '').toLowerCase() === 'completed').length
    const studentProgress = studentTasks.length > 0 ? Math.round((completed / studentTasks.length) * 100) : projectProgress
    const delayedTasks = studentTasks.filter((task) => {
      const taskDeadline = toDate(task.deadline)
      return Boolean(taskDeadline && taskDeadline < now && String(task.status || '').toLowerCase() !== 'completed')
    })

    return {
      ...student,
      taskCount: studentTasks.length,
      completedCount: completed,
      progress: studentProgress,
      delayedCount: delayedTasks.length,
      projectTasks: studentTasks,
    }
  })

  studentSummaries.sort((a, b) => a.progress - b.progress || b.delayedCount - a.delayedCount || String(a.student_name).localeCompare(String(b.student_name)))
  const primaryStudent = studentSummaries[0] || students[0] || {
    id: `project-${project.id || 'unknown'}`,
    student_id: null,
    student_email: '',
    student_name: 'Student',
    register_no: '—',
    initials: 'ST',
    taskCount: 0,
    completedCount: 0,
    progress: projectProgress,
    delayedCount: 0,
    projectTasks: projectTasks,
  }

  return {
    projectTasks,
    completedTasks,
    projectProgress,
    deadlineDate,
    deadlineLabel,
    daysLeft,
    studentSummaries,
    primaryStudent,
  }
}

function buildAlert({
  id,
  category,
  alertType,
  title,
  message,
  priority,
  audience,
  project,
  student,
  progress,
  deadlineLabel,
  daysLeft,
  createdAt,
}) {
  const coordinatorName = project.coordinator_name || project.coord || 'Coordinator'
  return {
    id,
    category,
    alertType,
    title,
    message,
    priority,
    audience,
    student_name: student.student_name,
    register_number: student.register_no,
    project_title: project.title,
    coordinator_name: coordinatorName,
    coordinator_id: project.coordinator_id || null,
    coordinator_email: project.coordinator_email || null,
    deadline: deadlineLabel || formatDateLabel(project.deadline),
    current_progress: Number.isFinite(progress) ? `${progress}%` : '0%',
    progress_value: Number(progress || 0),
    days_left: daysLeft,
    created_at: createdAt || new Date().toISOString(),
    project_id: project.id,
    student_id: student.student_id || null,
    student_email: student.student_email || '',
    initials: student.initials || makeInitials(student.student_name),
  }
}

function buildFrequentDelayAlerts(projects, tasks, projectStudents, usersById, now) {
  const groups = new Map()

  for (const project of projects) {
    const projectStats = getProjectStats(project, tasks, getProjectStudents(project, projectStudents, tasks, usersById), now)
    for (const task of projectStats.projectTasks) {
      const taskDeadline = toDate(task.deadline)
      const taskStatus = String(task.status || '').toLowerCase()
      if (!taskDeadline || taskDeadline >= now || taskStatus === 'completed') continue

      const student = getStudentLabel(
        {
          student_id: task.assigned_student_id,
          student_email: task.assigned_student_email,
          student_name: task.assigned_student_name,
          register_no: task.roll_no || task.register_no,
        },
        usersById
      )
      const key = student.id || student.student_email || `task-${task.id}`
      const current = groups.get(key) || {
        student,
        delayCount: 0,
        projectTitles: new Set(),
        coordinatorNames: new Set(),
        earliestDeadline: taskDeadline,
        latestDeadline: taskDeadline,
        latestProject: project,
        progressTotal: 0,
        progressCount: 0,
      }

      current.delayCount += 1
      current.projectTitles.add(project.title)
      current.coordinatorNames.add(project.coordinator_name || project.coord || 'Coordinator')
      current.earliestDeadline = !current.earliestDeadline || taskDeadline < current.earliestDeadline ? taskDeadline : current.earliestDeadline
      current.latestDeadline = !current.latestDeadline || taskDeadline > current.latestDeadline ? taskDeadline : current.latestDeadline
      current.latestProject = taskDeadline >= current.latestDeadline ? project : current.latestProject
      current.progressTotal += projectStats.projectProgress
      current.progressCount += 1
      groups.set(key, current)
    }
  }

  return [...groups.values()]
    .filter((entry) => entry.delayCount >= FREQUENT_DELAY_THRESHOLD)
    .map((entry) => {
      const latestProject = entry.latestProject || {}
      const avgProgress = entry.progressCount > 0 ? Math.round(entry.progressTotal / entry.progressCount) : 0
      return buildAlert({
        id: `frequent-delay:${entry.student.id}:${entry.delayCount}`,
        category: 'frequent-delay',
        alertType: 'Frequent Delay Report',
        title: 'Student has multiple delayed tasks and requires attention.',
        message: `Repeated deadline misses detected across ${entry.delayCount} task${entry.delayCount === 1 ? '' : 's'}.`,
        priority: 'High',
        audience: ['director', 'coordinator'],
        project: {
          id: latestProject.id || `project-${entry.student.id}`,
          title: latestProject.title || [...entry.projectTitles][0] || 'Multiple Projects',
          coordinator_name: latestProject.coordinator_name || latestProject.coord || [...entry.coordinatorNames][0] || 'Coordinator',
          coordinator_id: latestProject.coordinator_id || null,
          coordinator_email: latestProject.coordinator_email || null,
          deadline: latestProject.deadline || formatDateLabel(entry.latestDeadline),
        },
        student: entry.student,
        progress: avgProgress,
        deadlineLabel: formatDateLabel(entry.latestDeadline),
        daysLeft: daysUntil(entry.latestDeadline, now),
        createdAt: new Date(now.getTime() - entry.delayCount * 60000).toISOString(),
      })
    })
}

export function buildAlertBundle({ projects = [], tasks = [], projectStudents = [], usersById = {}, now = new Date() } = {}) {
  const projectEntries = projects.map((project) => {
    const students = getProjectStudents(project, projectStudents, tasks, usersById)
    const stats = getProjectStats(project, tasks, students, now)
    const audience = ['director', 'coordinator']
    const alerts = []

    if (stats.deadlineDate && stats.daysLeft < 0 && stats.projectProgress < 100) {
      alerts.push(buildAlert({
        id: `overdue:${project.id}:${stats.primaryStudent.id}`,
        category: 'overdue-project',
        alertType: 'Deadline Passed Alert',
        title: 'Project deadline has passed and work is still incomplete.',
        message: 'Project deadline has passed and work is still incomplete.',
        priority: 'Critical',
        audience,
        project,
        student: stats.primaryStudent,
        progress: stats.projectProgress,
        deadlineLabel: stats.deadlineLabel,
        daysLeft: stats.daysLeft,
      }))
    } else if (stats.deadlineDate && stats.daysLeft !== null && stats.daysLeft <= ALERT_NEAR_WINDOW_DAYS && stats.daysLeft >= 0 && stats.projectProgress < LOW_PROGRESS_THRESHOLD) {
      alerts.push(buildAlert({
        id: `low-progress:${project.id}:${stats.primaryStudent.id}`,
        category: 'low-progress-project',
        alertType: 'Low Progress Alert',
        title: 'Project progress is below 40% and deadline is approaching.',
        message: 'Project progress is below 40% and deadline is approaching.',
        priority: 'Critical',
        audience: ['director'],
        project,
        student: stats.primaryStudent,
        progress: stats.projectProgress,
        deadlineLabel: stats.deadlineLabel,
        daysLeft: stats.daysLeft,
      }))
    } else if (stats.deadlineDate && stats.daysLeft !== null && stats.daysLeft <= ALERT_NEAR_WINDOW_DAYS && stats.daysLeft >= 0 && stats.projectProgress < 100) {
      alerts.push(buildAlert({
        id: `deadline-risk:${project.id}:${stats.primaryStudent.id}`,
        category: 'deadline-risk-project',
        alertType: 'Deadline Risk Alert',
        title: 'Deadline is approaching and student progress is insufficient.',
        message: stats.primaryStudent.progress === 0
          ? 'Deadline is approaching and work has not been started.'
          : 'Deadline is approaching and student progress is insufficient.',
        priority: 'High',
        audience,
        project,
        student: stats.primaryStudent,
        progress: stats.projectProgress,
        deadlineLabel: stats.deadlineLabel,
        daysLeft: stats.daysLeft,
      }))
    }

    return {
      project,
      stats,
      alerts,
    }
  })

  const overdueProjects = projectEntries
    .flatMap((entry) => entry.alerts.filter((alert) => alert.category === 'overdue-project'))
    .sort((a, b) => a.days_left - b.days_left)

  const lowProgressProjects = projectEntries
    .flatMap((entry) => entry.alerts.filter((alert) => alert.category === 'low-progress-project'))
    .sort((a, b) => a.progress_value - b.progress_value)

  const deadlineRiskProjects = projectEntries
    .flatMap((entry) => entry.alerts.filter((alert) => alert.category === 'deadline-risk-project'))
    .sort((a, b) => a.days_left - b.days_left)

  const frequentDelayCases = buildFrequentDelayAlerts(projects, tasks, projectStudents, usersById, now)
    .sort((a, b) => b.progress_value - a.progress_value || a.days_left - b.days_left)

  const allAlerts = [...overdueProjects, ...lowProgressProjects, ...frequentDelayCases, ...deadlineRiskProjects]
    .sort((a, b) => {
      const priorityRank = { Critical: 0, High: 1, Medium: 2 }
      return (priorityRank[a.priority] ?? 9) - (priorityRank[b.priority] ?? 9) || a.days_left - b.days_left || a.project_title.localeCompare(b.project_title)
    })

  const coordinatorAlerts = allAlerts.filter((alert) => alert.audience.includes('coordinator'))
  const directorAlerts = allAlerts.filter((alert) => alert.audience.includes('director'))

  const buildNotification = (alert, index) => ({
    id: alert.id,
    icon: alert.priority === 'Critical' ? '🚨' : '⚠️',
    title: alert.alertType,
    body: `${alert.student_name} · ${alert.project_title} · ${alert.message}`,
    time: alert.deadline || formatDateLabel(alert.created_at),
    read: false,
    severity: alert.priority,
    index,
  })

  return {
    summary: {
      total: allAlerts.length,
      critical: allAlerts.filter((alert) => alert.priority === 'Critical').length,
      high: allAlerts.filter((alert) => alert.priority === 'High').length,
      medium: allAlerts.filter((alert) => alert.priority === 'Medium').length,
    },
    director: {
      sections: [
        {
          key: 'overdue-projects',
          title: 'Overdue Projects',
          subtitle: 'Deadline passed and work is still incomplete.',
          tone: 'critical',
          alerts: overdueProjects,
        },
        {
          key: 'low-progress-projects',
          title: 'Low Progress Projects',
          subtitle: 'Projects below 40% with approaching deadlines.',
          tone: 'critical',
          alerts: lowProgressProjects,
        },
        {
          key: 'frequent-delay-cases',
          title: 'Frequent Delay Cases',
          subtitle: 'Students with repeated deadline misses.',
          tone: 'high',
          alerts: frequentDelayCases,
        },
        {
          key: 'deadline-risk-projects',
          title: 'Deadline Risk Projects',
          subtitle: 'Projects near deadline with incomplete progress.',
          tone: 'high',
          alerts: deadlineRiskProjects,
        },
      ],
      history: allAlerts,
      notifications: directorAlerts.map(buildNotification),
    },
    coordinator: {
      sections: [
        {
          key: 'deadline-missed-alerts',
          title: 'Deadline Missed Alerts',
          subtitle: 'Overdue projects that need immediate follow-up.',
          tone: 'critical',
          alerts: overdueProjects,
        },
        {
          key: 'student-delay-notifications',
          title: 'Student Delay Notifications',
          subtitle: 'Repeated delays and deadline risk updates.',
          tone: 'high',
          alerts: [...frequentDelayCases, ...deadlineRiskProjects],
        },
        {
          key: 'progress-warnings',
          title: 'Progress Warnings',
          subtitle: 'Projects with low completion near the deadline.',
          tone: 'medium',
          alerts: lowProgressProjects,
        },
      ],
      history: [...coordinatorAlerts, ...lowProgressProjects].sort((a, b) => {
        const priorityRank = { Critical: 0, High: 1, Medium: 2 }
        return (priorityRank[a.priority] ?? 9) - (priorityRank[b.priority] ?? 9) || a.days_left - b.days_left || a.project_title.localeCompare(b.project_title)
      }),
      notifications: coordinatorAlerts.map(buildNotification),
    },
    all: allAlerts,
  }
}

export function filterAlertsForContext(alerts, context = {}) {
  const coordinatorId = String(context.coordinator_id || '').trim()
  const coordinatorEmail = normalizeEmail(context.coordinator_email || '')
  const studentId = String(context.student_id || '').trim()
  const studentEmail = normalizeEmail(context.student_email || '')

  return (Array.isArray(alerts) ? alerts : []).filter((alert) => {
    if (coordinatorId || coordinatorEmail) {
      const matchesCoordinator =
        (coordinatorId && String(alert.coordinator_id || '') === coordinatorId) ||
        (coordinatorEmail && normalizeEmail(alert.coordinator_email || '') === coordinatorEmail)
      if (!matchesCoordinator) return false
    }

    if (studentId || studentEmail) {
      const matchesStudent =
        (studentId && String(alert.student_id || '') === studentId) ||
        (studentEmail && normalizeEmail(alert.student_email || '') === studentEmail)
      if (!matchesStudent) return false
    }

    return true
  })
}

export function formatAlertNotification(alert) {
  return {
    id: alert.id,
    icon: alert.priority === 'Critical' ? '🚨' : '⚠️',
    title: alert.alertType,
    body: `${alert.student_name} · ${alert.project_title} · ${alert.message}`,
    time: alert.deadline || formatDateLabel(alert.created_at),
    read: false,
  }
}
