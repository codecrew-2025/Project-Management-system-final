export function convertReportToCSV(report) {
  if (!report) return ''
  if (report.reportType === 'project-summary' || report.project) {
    const rows = []
    rows.push(['Project', (report.project && (report.project.title || report.project.name)) || ''])
    rows.push([])
    rows.push(['Team Member', 'Role', 'Email'])
    for (const ps of (report.projectStudents || [])) rows.push([ps.student_name || ps.student_email || ps.student_id, ps.role || '', ps.student_email || ''])
    rows.push([])
    rows.push(['Module', 'Assigned To', 'Status', 'Progress'])
    for (const m of (report.modules || [])) rows.push([m.name || m.title, m.assignedTo || '', m.status || '', m.progress || ''])
    return rows.map(r => r.map(c => `"${String(c || '')}"`).join(',')).join('\n')
  }

  if (report.rows) {
    const header = Object.keys(report.rows[0] || {})
    const rows = [header].concat((report.rows || []).map(r => header.map(h => String(r[h] || ''))))
    return rows.map(r => r.map(c => `"${String(c || '')}"`).join(',')).join('\n')
  }

  return `"report"\n"${JSON.stringify(report)}"`
}

export function convertProjectReportToSheetRows(report) {
  const rows = []
  for (const ps of (report.projectStudents || [])) rows.push({ TeamMember: ps.student_name || ps.student_email || ps.student_id, Role: ps.role || '', Email: ps.student_email || '' })
  rows.push({})
  for (const m of (report.modules || [])) rows.push({ Module: m.name || m.title, AssignedTo: m.assignedTo || '', Status: m.status || '', Progress: m.progress || '' })
  return rows
}

export function buildProjectPayloadForPdf(report) {
  const project = report.project || {}
  const modules = (report.modules || []).map(m => ({ name: m.name || m.title, assignedTo: m.assignedTo || '', status: m.status || m.state || 'Pending', progress: m.progress || 0 }))
  const team = (report.projectStudents || []).map(ps => ({ name: ps.student_name || ps.student_email || ps.student_id, role: ps.role || 'Member' }))
  const milestones = []
  return { project, coordinator: report.usersById?.[project.coordinator_id] || {}, teamMembers: team, modules, milestones, activities: [], preparedBy: 'ProjectFlow', generatedAt: new Date(), summary: '' }
}
