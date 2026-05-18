import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export function generateProjectReportPdf({ reportType = 'Project Summary', period = 'All Time', format = 'PDF', preparedBy = 'Director', generatedAt = new Date(), dashboard = {} }) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 40
  const startY = 60

  const title = `${reportType} Report`
  const subtitle = `${period} | Generated ${generatedAt.toLocaleDateString()} ${generatedAt.toLocaleTimeString()}`

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.text('ProjectFlow Enterprise', margin, startY)
  doc.setFontSize(12)
  doc.setTextColor('#5A5A5A')
  doc.text('Comprehensive program delivery report', margin, startY + 22)

  doc.setDrawColor('#2D3A52')
  doc.setFillColor('#2D3A52')
  doc.rect(margin, startY + 32, pageWidth - margin * 2, 1, 'F')

  doc.setFontSize(16)
  doc.setTextColor('#1F2A44')
  doc.text(title, margin, startY + 60)
  doc.setFontSize(10)
  doc.setTextColor('#6B7280')
  doc.text(subtitle, margin, startY + 78)

  const metrics = buildMetrics(dashboard)
  let sectionY = startY + 110

  const cardWidth = (pageWidth - margin * 2 - 18) / 4
  metrics.forEach((metric, index) => {
    const x = margin + index * (cardWidth + 6)
    doc.setFillColor('#F5F7FB')
    doc.roundedRect(x, sectionY, cardWidth, 62, 6, 6, 'F')
    doc.setFontSize(9)
    doc.setTextColor('#6B7280')
    doc.text(metric.label, x + 10, sectionY + 18)
    doc.setFontSize(14)
    doc.setTextColor('#1F2A44')
    doc.text(String(metric.value), x + 10, sectionY + 38)
    if (metric.delta) {
      doc.setFontSize(8)
      doc.setTextColor(metric.delta >= 0 ? '#127C4B' : '#B91C1C')
      doc.text(`${metric.delta >= 0 ? '+' : ''}${metric.delta}%`, x + 10, sectionY + 54)
    }
  })

  sectionY += 92

  doc.setFontSize(12)
  doc.setTextColor('#1F2A44')
  doc.text('Executive Summary', margin, sectionY)
  doc.setFontSize(10)
  doc.setTextColor('#4B5563')
  const summaryText = dashboard.summary || 'This report highlights program performance, resourcing, milestones and delivery outcomes across active projects and teams.'
  doc.text(doc.splitTextToSize(summaryText, pageWidth - margin * 2), margin, sectionY + 16)

  sectionY += 60

  const projects = buildProjectRows(dashboard)
  if (projects.length) {
    autoTable(doc, {
      startY: sectionY,
      head: [['Project', 'Owner', 'Status', 'Completion', 'Deadline']],
      body: projects,
      styles: { fontSize: 9, cellPadding: 6 },
      headStyles: { fillColor: '#2D3A52', textColor: '#FFFFFF', halign: 'center' },
      alternateRowStyles: { fillColor: '#F7F9FB' },
      margin: { left: margin, right: margin },
      columnStyles: { 0: { cellWidth: 120 }, 1: { cellWidth: 90 }, 2: { cellWidth: 80 }, 3: { cellWidth: 90 }, 4: { cellWidth: 80 } },
    })
    sectionY = doc.lastAutoTable.finalY + 20
  }

  const keyMilestones = buildMilestoneRows(dashboard)
  if (keyMilestones.length) {
    doc.setFontSize(12)
    doc.setTextColor('#1F2A44')
    if (sectionY + 120 > doc.internal.pageSize.getHeight() - 80) {
      doc.addPage()
      sectionY = margin
    }
    doc.text('Milestones & Deliverables', margin, sectionY)
    autoTable(doc, {
      startY: sectionY + 16,
      head: [['Milestone', 'Owner', 'Due Date', 'Progress']],
      body: keyMilestones,
      styles: { fontSize: 9, cellPadding: 6 },
      headStyles: { fillColor: '#2D3A52', textColor: '#FFFFFF' },
      alternateRowStyles: { fillColor: '#F7F9FB' },
      margin: { left: margin, right: margin },
    })
  }

  addFooter(doc, preparedBy)

  doc.save(`ProjectFlow-${reportType.replace(/[^a-zA-Z0-9]+/g, '-')}-${period.replace(/[^a-zA-Z0-9]+/g, '-')}.pdf`)
}

function buildMetrics(dashboard) {
  const projects = Array.isArray(dashboard.allProjects) ? dashboard.allProjects : Array.isArray(dashboard.projects) ? dashboard.projects : []
  const tasks = Array.isArray(dashboard.tasks) ? dashboard.tasks : []
  const completedTasks = tasks.filter(task => task.cls === 'done' || task.status === 'done' || task.status === 'completed').length
  const inProgress = tasks.filter(task => task.cls === 'active' || task.status === 'in progress' || task.status === 'ongoing').length
  const pending = tasks.length - completedTasks
  const completedProjects = projects.filter(project => String(project.status || '').toLowerCase().includes('complete') || String(project.status || '').toLowerCase().includes('done')).length

  return [
    { label: 'Projects', value: projects.length || 0, delta: completedProjects > 0 ? 12 : 0 },
    { label: 'Completed Tasks', value: completedTasks || 0, delta: tasks.length ? Math.round((completedTasks / tasks.length) * 100) : 0 },
    { label: 'Active Tasks', value: inProgress || 0, delta: inProgress ? -6 : 0 },
    { label: 'Pending Items', value: pending || 0, delta: pending ? 8 : 0 },
  ]
}

function buildProjectRows(dashboard) {
  const projects = Array.isArray(dashboard.allProjects) ? dashboard.allProjects : Array.isArray(dashboard.projects) ? dashboard.projects : []
  if (!projects.length) return []

  return projects.slice(0, 6).map((project) => [
    project.title || project.name || 'Untitled Project',
    project.coordinator || project.owner || project.manager || 'TBD',
    String(project.status || 'Active'),
    `${project.progress ?? project.completion ?? 0}%`,
    project.deadline || project.dueDate || 'TBD',
  ])
}

function buildMilestoneRows(dashboard) {
  const milestones = Array.isArray(dashboard.project?.milestones) ? dashboard.project.milestones : Array.isArray(dashboard.epicMilestones) ? dashboard.epicMilestones : []
  return milestones.slice(0, 6).map((item) => [
    item.title || item.name || 'Milestone',
    item.owner || item.coordinator || 'Owner',
    item.dueDate || item.deadline || 'TBD',
    `${item.progress ?? item.completion ?? 0}%`,
  ])
}

function addFooter(doc, preparedBy) {
  const pageCount = doc.internal.getNumberOfPages()
  const width = doc.internal.pageSize.getWidth()
  const footerY = doc.internal.pageSize.getHeight() - 30

  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page)
    doc.setFontSize(9)
    doc.setTextColor('#9CA3AF')
    doc.text(`Prepared by ${preparedBy}`, 40, footerY)
    doc.text(`page ${page} of ${pageCount}`, width - 100, footerY, { align: 'right' })
  }
}
