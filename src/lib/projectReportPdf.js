import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export function generateIndividualProjectReportPdf({
  project = {},
  coordinator = {},
  teamMembers = [],
  modules = [],
  milestones = [],
  activities = [],
  notes = '',
  preparedBy = 'Coordinator',
  generatedAt = new Date(),
  summary = '',
}) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 40
  const headerHeight = 58

  const projectTitle = String(project.title || project.name || 'Project Report')
  const clientName = String(project.client_name || project.client || project.client_notes || 'Confidential Client')
  const domain = String(project.domain || 'N/A')
  const startDate = formatDate(project.start_date || project.startDate || project.start_date)
  const deadline = formatDate(project.deadline || project.end_date || project.deadline)
  const status = String(project.status || 'Active')
  const completion = Number(project.stats?.completionPercent ?? project.completion ?? project.progress ?? 0)
  const coordinatorName = String(coordinator.name || project.coordinator_name || project.coordinator || 'Coordinator')
  const coordinatorEmail = String(coordinator.email || project.coordinator_email || '')
  const teamList = Array.isArray(teamMembers) ? teamMembers : []

  const moduleRows = Array.isArray(modules) ? modules.map((module) => {
    const assignedTo = module.assignedTo || module.owner || module.assigned_student_name || module.assignedTo || 'Unassigned'
    const statusLabel = String(module.status || module.state || (Number(module.progress) >= 100 ? 'Done' : 'Active') || 'Pending')
    const progressValue = Number(module.progress ?? module.completion ?? 0)
    return [String(module.name || module.title || 'Module'), assignedTo, statusLabel, `${progressValue}%`]
  }) : []

  const totalModules = moduleRows.length
  const completedModules = moduleRows.filter((row) => String(row[2]).toLowerCase() === 'done' || Number(row[3].replace('%', '')) >= 100).length
  const pendingModules = totalModules - completedModules
  const overallProgress = totalModules ? Math.round((completedModules / totalModules) * 100) : completion

  const projectDetails = [
    ['Project Name', projectTitle],
    ['Client Name', clientName],
    ['Domain', domain],
    ['Start Date', startDate],
    ['Deadline', deadline],
    ['Status', status],
    ['Completion', `${completion}%`],
  ]

  const summaryText = String(summary || project.summary || notes || project.description || 'This document provides a detailed overview of project scope, team composition, progress and milestones for the selected engagement.')

  addReportHeader(doc, pageWidth, margin, generatedAt)
  let cursorY = headerHeight + 20

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.setTextColor('#0F172A')
  doc.text(projectTitle, margin, cursorY)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor('#475569')
  doc.text(`Confidential Project Report`, margin, cursorY + 18)
  doc.text(`Prepared by ${preparedBy}`, margin, cursorY + 34)
  doc.text(`Generated on ${generatedAt.toLocaleDateString()} ${generatedAt.toLocaleTimeString()}`, margin, cursorY + 50)

  cursorY += 80

  const left = margin
  const right = pageWidth - margin
  const sectionSpacing = 24

  doc.setFillColor('#EFF6FF')
  doc.roundedRect(left, cursorY - 10, pageWidth - margin * 2, 160, 8, 8, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor('#1D4ED8')
  doc.text('Project Details', left + 12, cursorY + 6)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor('#334155')
  projectDetails.forEach(([label, value], index) => {
    const rowY = cursorY + 26 + index * 14
    doc.text(label, left + 12, rowY)
    doc.text(value, right - 12, rowY, { align: 'right' })
  })

  cursorY += 180

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor('#1D4ED8')
  doc.text('Team Details', left, cursorY)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor('#334155')
  doc.text(`Coordinator: ${coordinatorName}`, left, cursorY + 18)
  doc.text(`Email: ${coordinatorEmail || '—'}`, left, cursorY + 34)
  doc.text('Team Members:', left, cursorY + 54)

  teamList.slice(0, 8).forEach((member, index) => {
    const name = typeof member === 'string' ? member : member.name || member.title || member.email || 'Team member'
    doc.text(`• ${name}`, left + 12, cursorY + 70 + index * 14)
  })

  cursorY += Math.max(140, 70 + teamList.slice(0, 8).length * 14)
  cursorY += sectionSpacing

  doc.setFillColor('#EFF6FF')
  doc.roundedRect(left, cursorY - 14, pageWidth - margin * 2, 80, 8, 8, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor('#1D4ED8')
  doc.text('Progress Summary', left + 12, cursorY)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor('#334155')
  doc.text(`Total Modules: ${totalModules}`, left + 12, cursorY + 18)
  doc.text(`Completed Modules: ${completedModules}`, left + 12, cursorY + 34)
  doc.text(`Pending Modules: ${pendingModules}`, left + 12, cursorY + 50)

  drawProgressBar(doc, left + 12, cursorY + 62, pageWidth - margin * 2 - 24, 12, overallProgress)
  doc.text(`${overallProgress}%`, right - 12, cursorY + 72, { align: 'right' })

  cursorY += 100

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor('#1D4ED8')
  doc.text('Module Details', left, cursorY)

  autoTable(doc, {
    startY: cursorY + 16,
    head: [['Module Name', 'Assigned To', 'Status', 'Progress']],
    body: moduleRows,
    styles: { fontSize: 9, cellPadding: 8, textColor: '#0F172A' },
    headStyles: { fillColor: '#1D4ED8', textColor: '#FFFFFF' },
    alternateRowStyles: { fillColor: '#F8FAFC' },
    margin: { left, right: margin },
    theme: 'grid',
    columnStyles: {
      0: { cellWidth: 180 },
      1: { cellWidth: 130 },
      2: { cellWidth: 80 },
      3: { cellWidth: 80 },
    },
    didDrawPage: (data) => {
      if (data.pageNumber === 1) return
      addReportFooter(doc, preparedBy)
    },
  })

  let afterModulesY = doc.lastAutoTable.finalY + 20

  if (afterModulesY + 220 > doc.internal.pageSize.getHeight() - 80) {
    doc.addPage()
    afterModulesY = margin
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor('#1D4ED8')
  doc.text('Executive Summary', left, afterModulesY)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor('#334155')
  doc.text(doc.splitTextToSize(summaryText, pageWidth - margin * 2), left, afterModulesY + 18)

  afterModulesY += 90

  if (Array.isArray(milestones) && milestones.length > 0) {
    if (afterModulesY + 140 > doc.internal.pageSize.getHeight() - 80) {
      doc.addPage()
      afterModulesY = margin
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor('#1D4ED8')
    doc.text('Key Milestones', left, afterModulesY)
    autoTable(doc, {
      startY: afterModulesY + 16,
      head: [['Milestone', 'Owner', 'Due Date', 'Progress']],
      body: milestones.map((item) => [
        String(item.name || item.title || item.milestone || 'Milestone'),
        String(item.owner || item.assigned_to || 'Owner'),
        formatDate(item.date || item.due_date || item.deadline || item.dueDate),
        `${Number(item.progress ?? item.completion ?? 0)}%`,
      ]),
      styles: { fontSize: 9, cellPadding: 8, textColor: '#0F172A' },
      headStyles: { fillColor: '#1D4ED8', textColor: '#FFFFFF' },
      alternateRowStyles: { fillColor: '#F8FAFC' },
      margin: { left, right: margin },
      theme: 'grid',
    })

    afterModulesY = doc.lastAutoTable.finalY + 20
  }

  if (Array.isArray(activities) && activities.length > 0) {
    if (afterModulesY + 120 > doc.internal.pageSize.getHeight() - 80) {
      doc.addPage()
      afterModulesY = margin
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor('#1D4ED8')
    doc.text('Recent Activity', left, afterModulesY)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor('#334155')
    activities.slice(0, 5).forEach((item, index) => {
      const activityY = afterModulesY + 18 + index * 16
      doc.text(`• ${String(item.message || item.summary || item.action || item.title || 'Activity')}`, left, activityY)
      if (item.date) {
        doc.text(formatDate(item.date), right - 12, activityY, { align: 'right' })
      }
    })
  }

  addTeamContributionChart(doc, left, afterModulesY + 120, pageWidth - margin * 2, teamList)

  addReportFooter(doc, preparedBy)
  doc.save(`ProjectFlow-${sanitizeFilename(projectTitle)}-Report.pdf`)
}

function formatDate(value) {
  if (!value) return 'TBD'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function sanitizeFilename(value) {
  return String(value || 'project').replace(/[^a-zA-Z0-9-_ ]+/g, '').replace(/\s+/g, '-')
}

function drawProgressBar(doc, x, y, width, height, percent) {
  doc.setFillColor('#E0E7FF')
  doc.roundedRect(x, y, width, height, 4, 4, 'F')
  doc.setFillColor('#1D4ED8')
  doc.roundedRect(x, y, Math.max(0, (width * percent) / 100), height, 4, 4, 'F')
}

function addReportHeader(doc, pageWidth, margin, generatedAt) {
  doc.setFillColor('#1D4ED8')
  doc.rect(0, 0, pageWidth, 58, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor('#FFFFFF')
  doc.text('ProjectFlow', margin, 36)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text('ProjectFlow © 2026', pageWidth - margin, 20, { align: 'right' })
  doc.text('Confidential Project Report', pageWidth - margin, 34, { align: 'right' })
  doc.text(`Generated ${generatedAt.toLocaleDateString()}`, pageWidth - margin, 48, { align: 'right' })
}

function addReportFooter(doc, preparedBy) {
  const pageCount = doc.internal.getNumberOfPages()
  const footerY = doc.internal.pageSize.getHeight() - 28
  const width = doc.internal.pageSize.getWidth()

  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor('#94A3B8')
    doc.text(`ProjectFlow © 2026 • Confidential`, 40, footerY)
    doc.text(`Page ${page} of ${pageCount}`, width - 40, footerY, { align: 'right' })
  }
}

function addTeamContributionChart(doc, x, y, width, teamList) {
  if (!Array.isArray(teamList) || teamList.length === 0) return
  const items = teamList.slice(0, 5).map((member) => ({
    name: typeof member === 'string' ? member : member.name || member.title || member.email || 'Team member',
    value: Number(member.progress ?? member.tasksDone ?? 0),
  }))
  const total = items.reduce((sum, item) => sum + item.value, 0) || 100
  const chartHeight = 90
  const barWidth = 14

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor('#1D4ED8')
  doc.text('Team Contribution', x, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor('#475569')
  doc.text('Workload and completion by core team members', x, y + 14)

  const chartX = x
  const chartY = y + 28
  const maxBarHeight = chartHeight

  items.forEach((item, index) => {
    const barHeight = Math.max(12, (item.value / total) * maxBarHeight)
    const barX = chartX + index * (barWidth + 20)
    const barY = chartY + (maxBarHeight - barHeight)
    doc.setFillColor('#DBEAFE')
    doc.rect(barX, chartY, barWidth, maxBarHeight, 'F')
    doc.setFillColor('#1D4ED8')
    doc.rect(barX, barY, barWidth, barHeight, 'F')
    doc.setFontSize(8)
    doc.setTextColor('#0F172A')
    doc.text(`${item.value}%`, barX + barWidth / 2, barY - 4, { align: 'center' })
    doc.text(truncateText(doc, item.name, 60), barX + barWidth / 2, chartY + maxBarHeight + 12, { align: 'center' })
  })
}

function truncateText(doc, text, maxWidth) {
  const ellipsis = '…'
  let result = String(text || '')
  while (doc.getTextWidth(result) > maxWidth && result.length > 0) {
    result = result.slice(0, -1)
  }
  if (result.length < String(text || '').length) {
    result = result.slice(0, -1) + ellipsis
  }
  return result
}
