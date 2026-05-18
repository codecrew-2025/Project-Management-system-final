import API_BASE from './apiBase'

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  })

  let payload = {}
  try {
    payload = await response.json()
  } catch {
    payload = {}
  }

  if (!response.ok) {
    throw new Error(payload.message || 'Request failed.')
  }

  return payload
}

export function loginUser(credentials) {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  })
}

export function createManagedUser(payload) {
  return request('/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function assignProjectCoordinator(payload) {
  if (!payload?.projectId) throw new Error('Project ID is required.')
  if (!payload?.coordinatorId && !payload?.coordinatorEmail) throw new Error('Coordinator is required.')

  return request(`/projects/${encodeURIComponent(String(payload.projectId))}/coordinator`, {
    method: 'PATCH',
    body: JSON.stringify({
      coordinator_id: payload.coordinatorId || null,
      coordinator_email: payload.coordinatorEmail || null,
      coordinator_name: payload.coordinatorName || null,
    }),
  })
}

export function changePassword(payload) {
  return request('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function fetchDashboard(role, query = {}) {
  const params = new URLSearchParams()

  Object.entries(query || {}).forEach(([key, value]) => {
    if (value !== null && value !== undefined && String(value).trim() !== '') {
      params.set(key, String(value))
    }
  })

  const suffix = params.toString() ? `?${params.toString()}` : ''
  return request(`/dashboard/${role}${suffix}`)
}

export function createProject(data) {
  return request(`/projects`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function fetchProjectReport(projectId) {
  if (!projectId) throw new Error('Project ID is required.')
  return request(`/reports/project/${encodeURIComponent(String(projectId))}`)
}

export function fetchReports(query = {}) {
  const params = new URLSearchParams()
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value !== null && value !== undefined && String(value).trim() !== '') params.set(key, String(value))
  })
  const suffix = params.toString() ? `?${params.toString()}` : ''
  return request(`/reports${suffix}`)
}

export function fetchAllProjects() {
  // Use director graph to get full project list
  return request('/director-graph')
}

export function createTask(data) {
  return request(`/tasks`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function getNotifications(role, context = {}) {
  const params = new URLSearchParams()
  Object.entries(context || {}).forEach(([key, value]) => {
    if (value !== null && value !== undefined && String(value).trim() !== '') {
      params.set(key, String(value))
    }
  })

  const suffix = params.toString() ? `?${params.toString()}` : ''
  return request(`/notifications/${role}${suffix}`)
}

export function markNotificationsRead(role, context = {}) {
  const params = new URLSearchParams()
  Object.entries(context || {}).forEach(([key, value]) => {
    if (value !== null && value !== undefined && String(value).trim() !== '') {
      params.set(key, String(value))
    }
  })

  const suffix = params.toString() ? `?${params.toString()}` : ''
  return request(`/notifications/${role}/read${suffix}`, { method: 'PATCH' })
}

export function forgotPassword(payload) {
  return request('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function resetPassword(payload) {
  return request('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function submitStudentWork(data) {
  return request('/student/submissions', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function sendStudentMessage(data) {
  return request('/student/messages', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}