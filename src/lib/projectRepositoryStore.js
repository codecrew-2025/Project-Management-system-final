const STORAGE_KEY = 'pf_project_repository_v1'
const CHANGE_EVENT = 'pf-project-repository-updated'

function safeParse(raw) {
  try {
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function readStore() {
  if (typeof window === 'undefined') {
    return { coordinatorLinksByProject: {}, studentUpdatesByProject: {} }
  }

  const parsed = safeParse(window.localStorage.getItem(STORAGE_KEY))
  return {
    coordinatorLinksByProject: parsed?.coordinatorLinksByProject || {},
    studentUpdatesByProject: parsed?.studentUpdatesByProject || {},
  }
}

function writeStore(nextStore) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextStore))
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function getRepositoryChangeEventName() {
  return CHANGE_EVENT
}

export function toProjectStorageKey({ id, title }) {
  const byId = String(id || '').trim()
  if (byId) return `id:${byId}`

  const slug = slugify(title)
  return slug ? `title:${slug}` : 'title:unknown-project'
}

export function getCoordinatorProjectLinks(projectRef) {
  const store = readStore()
  const byId = projectRef?.id ? store.coordinatorLinksByProject[`id:${String(projectRef.id).trim()}`] : null
  if (byId) return byId

  const byTitle = projectRef?.title ? store.coordinatorLinksByProject[`title:${slugify(projectRef.title)}`] : null
  if (byTitle) return byTitle

  return null
}

export function saveCoordinatorProjectLinks(projectRef, links) {
  const store = readStore()
  const idKey = projectRef?.id ? `id:${String(projectRef.id).trim()}` : ''
  const titleKey = projectRef?.title ? `title:${slugify(projectRef.title)}` : ''
  const existing =
    (idKey && store.coordinatorLinksByProject[idKey]) ||
    (titleKey && store.coordinatorLinksByProject[titleKey]) ||
    {}

  const next = {
    project_id: projectRef?.id || null,
    project_title: String(links?.project_title || projectRef?.title || '').trim(),
    google_drive_link: String(links?.google_drive_link || '').trim(),
    main_project_drive_link: String(links?.main_project_drive_link || '').trim(),
    shared_folder_link: String(links?.shared_folder_link || '').trim(),
    reference_materials_link: String(links?.reference_materials_link || '').trim(),
    updated_at: new Date().toISOString(),
  }

  const merged = {
    ...existing,
    ...next,
  }

  if (idKey) store.coordinatorLinksByProject[idKey] = merged
  if (titleKey) store.coordinatorLinksByProject[titleKey] = merged

  writeStore(store)
  return merged
}

export function listStudentDailyUpdates(projectRef) {
  const key = toProjectStorageKey(projectRef || {})
  const store = readStore()
  const list = Array.isArray(store.studentUpdatesByProject[key]) ? store.studentUpdatesByProject[key] : []
  return list
    .slice()
    .sort((a, b) => new Date(b?.date || b?.created_at || 0).getTime() - new Date(a?.date || a?.created_at || 0).getTime())
}

export function upsertStudentDailyUpdate(projectRef, payload) {
  const key = toProjectStorageKey(projectRef || {})
  const store = readStore()
  const previous = Array.isArray(store.studentUpdatesByProject[key]) ? store.studentUpdatesByProject[key] : []
  const updateId = String(payload?.id || '').trim() || `upd-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
  const now = new Date().toISOString()

  const nextRecord = {
    id: updateId,
    student_name: String(payload?.student_name || '').trim(),
    register_number: String(payload?.register_number || '').trim(),
    date: String(payload?.date || '').trim(),
    task_title: String(payload?.task_title || '').trim(),
    work_description: String(payload?.work_description || '').trim(),
    status: String(payload?.status || 'Pending').trim(),
    progress_percentage: Number.isFinite(Number(payload?.progress_percentage)) ? Math.max(0, Math.min(100, Number(payload.progress_percentage))) : 0,
    github_link: String(payload?.github_link || '').trim(),
    screenshot_link: String(payload?.screenshot_link || '').trim(),
    screenshot_data_url: String(payload?.screenshot_data_url || '').trim(),
    demo_video_link: String(payload?.demo_video_link || '').trim(),
    report_link: String(payload?.report_link || '').trim(),
    project_id: projectRef?.id || null,
    project_title: String(projectRef?.title || '').trim(),
    updated_at: now,
    created_at: now,
  }

  let found = false
  const nextList = previous.map((item) => {
    if (String(item?.id || '') !== updateId) return item
    found = true
    return {
      ...item,
      ...nextRecord,
      created_at: item?.created_at || now,
      updated_at: now,
    }
  })

  if (!found) {
    nextList.unshift(nextRecord)
  }

  store.studentUpdatesByProject[key] = nextList
  writeStore(store)

  return nextList.find((item) => String(item?.id || '') === updateId) || null
}

export function deleteStudentDailyUpdate(projectRef, updateId) {
  const key = toProjectStorageKey(projectRef || {})
  const store = readStore()
  const previous = Array.isArray(store.studentUpdatesByProject[key]) ? store.studentUpdatesByProject[key] : []
  store.studentUpdatesByProject[key] = previous.filter((item) => String(item?.id || '') !== String(updateId || ''))
  writeStore(store)
}

export function getLatestStudentDailyUpdate(projectRef, filterByStudent = null) {
  const updates = listStudentDailyUpdates(projectRef)
  if (!filterByStudent) return updates[0] || null

  const byName = String(filterByStudent?.student_name || '').trim().toLowerCase()
  const byReg = String(filterByStudent?.register_number || '').trim().toLowerCase()

  return (
    updates.find((item) => {
      const sameName = byName && String(item?.student_name || '').trim().toLowerCase() === byName
      const sameReg = byReg && String(item?.register_number || '').trim().toLowerCase() === byReg
      return sameName || sameReg
    }) || null
  )
}
