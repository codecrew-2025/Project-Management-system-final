import { useState, useEffect } from 'react'
import Sidebar from '../components/Sidebar'
import LayoutMenu from '../components/LayoutMenu'
import '../assets/dashboard.css'
import { fetchReports, fetchAllProjects } from '../lib/api'
import { generateIndividualProjectReportPdf } from '../lib/projectReportPdf'
// load XLSX dynamically to avoid Vite resolving a missing static dependency at build time

export default function ReportsPage() {
  const [reportType, setReportType] = useState('project-summary')
  const [period, setPeriod] = useState('current-semester')
  const [format, setFormat] = useState('pdf')
  const [projectId, setProjectId] = useState('')
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)

  useEffect(() => {
    let mounted = true
    fetchAllProjects().then((res) => {
      if (!mounted) return
      setProjects(res.projects || [])
    }).catch(() => {
      // ignore
    })
    return () => { mounted = false }
  }, [])

  async function generate() {
    setLoading(true)
    setMessage(null)
    try {
      const query = { type: reportType, period, format: 'json' }
      if (projectId) query.projectId = projectId
      const resp = await fetchReports(query)
      const report = resp.report

      if (format === 'pdf') {
        if (reportType === 'project-summary') {
          // Use existing PDF generator
          const prepared = buildProjectPayloadForPdf(report)
          generateIndividualProjectReportPdf(prepared)
          setMessage('PDF generation started.')
        } else {
          // Fallback: create a simple PDF containing JSON summary
          const prepared = { project: { title: `${reportType} Report` }, summary: JSON.stringify(report, null, 2), preparedBy: 'System' }
          generateIndividualProjectReportPdf(prepared)
          setMessage('PDF generation started.')
        }
      } else if (format === 'csv') {
        const csv = convertReportToCSV(report)
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
        const link = document.createElement('a')
        link.href = URL.createObjectURL(blob)
        const name = buildFilename(reportType, projectId, 'csv')
        link.setAttribute('download', name)
        document.body.appendChild(link)
        link.click()
        link.remove()
        setMessage('CSV download started.')
      } else if (format === 'excel') {
        // dynamically import xlsx to avoid build-time resolution issues
        try {
          const XLSXMod = await import('xlsx')
          const XLSX = XLSXMod.default || XLSXMod
          const wb = XLSX.utils.book_new()
          if (report.reportType === 'project-summary') {
            const rows = convertProjectReportToSheetRows(report)
            const ws = XLSX.utils.json_to_sheet(rows)
            XLSX.utils.book_append_sheet(wb, ws, 'Project Summary')
          } else if (report.rows) {
            const ws = XLSX.utils.json_to_sheet(report.rows)
            XLSX.utils.book_append_sheet(wb, ws, 'Report')
          } else if (report.kpis) {
            const ws = XLSX.utils.json_to_sheet([report.kpis])
            XLSX.utils.book_append_sheet(wb, ws, 'KPIs')
          } else {
            const ws = XLSX.utils.json_to_sheet([report])
            XLSX.utils.book_append_sheet(wb, ws, 'Report')
          }
          const name = buildFilename(reportType, projectId, 'xlsx')
          XLSX.writeFile(wb, name)
          setMessage('Excel download started.')
        } catch (err) {
          console.error('Excel export failed:', err)
          setMessage('Excel export failed — ensure dependency is installed.')
        }
      }

    } catch (e) {
      console.error(e)
      setMessage(String(e?.message || e))
    } finally {
      setLoading(false)
      window.setTimeout(() => setMessage(null), 4000)
    }
  }

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <Sidebar navItems={[{ label: 'Reports' }]} userInitials="RF" userName="Reports" userSub="Admin" />
      <div style={{ flex: 1, padding: 24 }}>
        <h1 className="page-title">Reports</h1>
        <p className="page-sub">Generate dynamic project and organisational reports</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, alignItems: 'end', marginTop: 18 }}>
          <div>
            <label className="form-label">Report Type</label>
            <select value={reportType} onChange={e => setReportType(e.target.value)} className="form-control">
              <option value="project-summary">Project Summary</option>
              <option value="team-progress">Team Progress</option>
              <option value="kpi-report">KPI Report</option>
              <option value="department-overview">Department Overview</option>
            </select>
          </div>
          <div>
            <label className="form-label">Time Period</label>
            <select value={period} onChange={e => setPeriod(e.target.value)} className="form-control">
              <option value="current-semester">Current Semester</option>
              <option value="last-quarter">Last Quarter</option>
              <option value="last-30-days">Last 30 Days</option>
              <option value="all-time">All Time</option>
            </select>
          </div>
          <div>
            <label className="form-label">Export Format</label>
            <select value={format} onChange={e => setFormat(e.target.value)} className="form-control">
              <option value="pdf">PDF</option>
              <option value="excel">Excel</option>
              <option value="csv">CSV</option>
            </select>
          </div>
          <div>
            <label className="form-label">Project</label>
            <select value={projectId} onChange={e => setProjectId(e.target.value)} className="form-control">
              <option value="">(Select project)</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </div>
        </div>

        <div style={{ marginTop: 18 }}>
          <button className="btn-primary" onClick={generate} disabled={loading}>
            {loading ? 'Generating...' : 'Generate Report'}
          </button>
          {message && <span style={{ marginLeft: 12 }}>{message}</span>}
        </div>
      </div>
    </div>
  )
}

function buildProjectPayloadForPdf(report) {
  const project = report.project || {}
  const modules = (report.modules || []).map(m => ({ name: m.name || m.title, assignedTo: m.assignedTo || '', status: m.status || m.state || 'Pending', progress: m.progress || 0 }))
  const team = (report.projectStudents || []).map(ps => ({ name: ps.student_name || ps.student_email || ps.student_id, role: ps.role || 'Member' }))
  const milestones = []
  return { project, coordinator: report.usersById?.[project.coordinator_id] || {}, teamMembers: team, modules, milestones, activities: [], preparedBy: 'ProjectFlow', generatedAt: new Date(), summary: '' }
}

function convertReportToCSV(report) {
  if (report.reportType === 'project-summary') {
    const rows = []
    rows.push(['Project', report.project?.title || ''])
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

  return `"report"
"${JSON.stringify(report)}"`
}

function convertProjectReportToSheetRows(report) {
  const rows = []
  for (const ps of (report.projectStudents || [])) rows.push({ TeamMember: ps.student_name || ps.student_email || ps.student_id, Role: ps.role || '', Email: ps.student_email || '' })
  rows.push({})
  for (const m of (report.modules || [])) rows.push({ Module: m.name || m.title, AssignedTo: m.assignedTo || '', Status: m.status || '', Progress: m.progress || '' })
  return rows
}

function buildFilename(type, projectId, ext) {
  const p = projectId ? `${projectId}_` : ''
  const name = `${p}${type.replace(/[^a-z0-9-]+/gi, '_')}_Report.${ext}`
  return name
}
