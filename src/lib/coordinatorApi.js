import API_BASE from './apiBase'

const API_ROOT = String(
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || API_BASE || '/api'
).replace(/\/$/, '')

function apiUrl(path) {
  const cleanPath = String(path || '').startsWith('/') ? String(path) : `/${String(path || '')}`
  return `${API_ROOT}${cleanPath}`
}

async function request(path, options = {}) {
  let response
  try {
    response = await fetch(apiUrl(path), {
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      ...options,
    })
  } catch {
    throw new Error('Cannot connect to backend API. Start the backend server and try again.')
  }

  let payload = {}
  let rawBody = ''
  try {
    rawBody = await response.text()
    payload = rawBody ? JSON.parse(rawBody) : {}
  } catch {
    payload = rawBody ? { message: rawBody } : {}
  }

  if (!response.ok) {
    const fallback = rawBody && !String(rawBody).startsWith('<') ? String(rawBody).trim() : ''
    const reason = payload?.message || fallback || `${response.status} ${response.statusText}`
    throw new Error(`Request failed: ${reason}`)
  }

  return payload
}

function emptyGraph() {
  return {
    projects: [],
    modules: [],
    tasks: [],
    projectStudents: [],
    submissions: [],
    meetings: [],
    activities: [],
    usersById: {},
    alerts: { sections: [], history: [], notifications: [] },
    alertSummary: { total: 0, critical: 0, high: 0, medium: 0 },
  }
}

function normalizeGraph(graph) {
  return {
    projects: Array.isArray(graph?.projects) ? graph.projects : [],
    modules: Array.isArray(graph?.modules) ? graph.modules : [],
    tasks: Array.isArray(graph?.tasks) ? graph.tasks : [],
    projectStudents: Array.isArray(graph?.projectStudents) ? graph.projectStudents : [],
    submissions: Array.isArray(graph?.submissions) ? graph.submissions : [],
    meetings: Array.isArray(graph?.meetings) ? graph.meetings : [],
    activities: Array.isArray(graph?.activities) ? graph.activities : [],
    usersById: graph?.usersById && typeof graph.usersById === 'object' ? graph.usersById : {},
    alerts: graph?.alerts && typeof graph.alerts === 'object' ? graph.alerts : { sections: [], history: [], notifications: [] },
    alertSummary: graph?.alertSummary && typeof graph.alertSummary === 'object' ? graph.alertSummary : { total: 0, critical: 0, high: 0, medium: 0 },
  }
}

export async function updateProjectDriveLink({ project_id, drive_folder_link }) {
  if (!project_id) throw new Error('Project ID is required.')

  return request(`/projects/${encodeURIComponent(String(project_id))}/drive-link`, {
    method: 'PATCH',
    body: JSON.stringify({ drive_folder_link: drive_folder_link || null }),
  })
}

export async function updateProjectGoogleFormLink({ project_id, google_form_link }) {
  if (!project_id) throw new Error('Project ID is required.')

  return request(`/projects/${encodeURIComponent(String(project_id))}/google-form-link`, {
    method: 'PATCH',
    body: JSON.stringify({ google_form_link: google_form_link || null }),
  })
}

export async function createProjectFull({ project, students, modules, tasks = [] }) {
  const payload = {
    title: project?.title,
    coordinator: project?.coordinator_name || 'Coordinator',
    coordinator_id: project?.coordinator_id || null,
    coordinator_email: project?.coordinator_email || null,
    deadline: project?.deadline || null,
    description: project?.description || '',
    client: project?.client_notes || '',
    drive_folder_link: project?.drive_folder_link || null,
    google_form_link: project?.google_form_link || null,
    students: students || [],
    modules: modules || [],
    tasks: tasks || [],
  }

  return request('/projects', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateProjectStudentDriveFolderLink({ project_id, student_id, drive_folder_link }) {
  if (!project_id || !student_id) {
    throw new Error('Project ID and Student ID are required.')
  }

  return request(`/projects/${encodeURIComponent(String(project_id))}/students/${encodeURIComponent(String(student_id))}/drive-link`, {
    method: 'PATCH',
    body: JSON.stringify({ drive_folder_link: drive_folder_link || null }),
  })
}

export async function addProjectStudent({ project_id, student_name, student_email, roll_no, phone, module_name, role }) {
  if (!project_id) throw new Error('Project ID is required.')
  if (!student_name) throw new Error('Student name is required.')
  if (!student_email) throw new Error('Student email is required.')

  return request(`/projects/${encodeURIComponent(String(project_id))}/students`, {
    method: 'POST',
    body: JSON.stringify({
      student_name,
      student_email,
      roll_no: roll_no || null,
      phone: phone || null,
      module_name: module_name || null,
      role: role || null,
    }),
  })
}

export async function createTask(payload) {
  return request('/tasks', {
    method: 'POST',
    body: JSON.stringify(payload || {}),
  })
}

export async function listSubmissionsByCoordinator(coordinatorId, coordinatorEmail, coordinatorName) {
  const graph = await getCoordinatorGraph(coordinatorId, coordinatorEmail, coordinatorName)

  const projectIds = new Set(
    (graph?.projects || [])
      .filter((p) => {
        if (!coordinatorId) return true
        if (!p || p.coordinator_id == null || p.coordinator_id === '') return true
        return String(p.coordinator_id) === String(coordinatorId)
      })
      .map((p) => String(p.id))
  )

  const taskIds = new Set(
    (graph?.tasks || [])
      .filter((t) => {
        const byProject = t?.project_id && projectIds.has(String(t.project_id))
        const module = (graph?.modules || []).find((m) => String(m.id) === String(t?.module_id || ''))
        const byModuleProject = module?.project_id && projectIds.has(String(module.project_id))
        return Boolean(byProject || byModuleProject)
      })
      .map((t) => String(t.id))
  )

  return (graph?.submissions || [])
    .filter((s) => {
      const byTask = s?.task_id && taskIds.has(String(s.task_id))
      const byProject = s?.project_id && projectIds.has(String(s.project_id))
      return Boolean(byTask || byProject)
    })
    .map((s) => {
      const fallbackStatus = String(s?.status || 'Pending').toLowerCase()
      return {
        ...s,
        review_status: s?.review_status || (fallbackStatus === 'approved' ? 'approved' : fallbackStatus === 'rejected' ? 'rejected' : 'pending'),
      }
    })
    .sort((a, b) => new Date(b?.submitted_at || 0).getTime() - new Date(a?.submitted_at || 0).getTime())
}

export async function reviewSubmission({ submission_id, review_status, coordinator_comment, reviewed_at, task_status }) {
  const allowed = ['pending', 'approved', 'rejected']
  if (!allowed.includes(review_status)) throw new Error('Invalid review status.')

  return request(`/coordinator/submissions/${encodeURIComponent(String(submission_id))}/review`, {
    method: 'PATCH',
    body: JSON.stringify({
      review_status,
      coordinator_comment: coordinator_comment || null,
      reviewed_at: reviewed_at || new Date().toISOString(),
      task_status: task_status || null,
    }),
  })
}

export async function createMeeting(payload) {
  const insertPayload = {
    coordinator_id: payload.coordinator_id,
    project_id: payload.project_id || null,
    title: payload.title,
    date: payload.date,
    time: payload.time,
    location: payload.location || null,
    note: payload.note || null,
  }

  return request('/meetings', {
    method: 'POST',
    body: JSON.stringify(insertPayload),
  })
}

export async function getCoordinatorGraph(coordinatorId, coordinatorEmail, coordinatorName) {
  try {
    const params = new URLSearchParams()
    if (coordinatorId) params.set('coordinator_id', coordinatorId)
    if (coordinatorEmail) params.set('coordinator_email', coordinatorEmail)
    if (coordinatorName) params.set('coordinator_name', coordinatorName)
    const query = params.toString() ? `?${params.toString()}` : ''
    const graph = await request(`/coordinator-graph${query}`)
    return normalizeGraph(graph)
  } catch {
    return emptyGraph()
  }
}

export function subscribeToTasksAndSubmissions() {
  return () => {}
}
