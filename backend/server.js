import dotenv from 'dotenv'
import express from 'express'
import cors from 'cors'
import { fileURLToPath } from 'url'
import path from 'path'
import { randomUUID } from 'crypto'
import { connectDB, getDB } from './mongoClient.js'
import { authenticateUser, changePassword, createManagedUser, getRedirectPath, registerUser } from './userStore.js'
import { dashboardData } from './dashboardData.js'
import { buildAlertBundle } from './alertEngine.js'
// report generation uses JSON responses; heavy server-side PDF/XLS libs intentionally omitted

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.resolve(__dirname, '..', '.env') })

const app = express()
const port = process.env.PORT || 3001

app.use(cors())
app.use(express.json())

// ─── Helpers ────────────────────────────────────────────────
function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Derive a consistent student ID from email — used everywhere
function studentIdFromEmail(email) {
  return `student-${normalizeEmail(email).replace(/[^a-z0-9]+/gi, '-')}`
}

function studentFilter(studentId, studentEmail) {
  const conditions = []
  if (studentId) conditions.push({ student_id: studentId })
  if (studentEmail) {
    conditions.push({ student_email: normalizeEmail(studentEmail) })
    conditions.push({ student_id: studentIdFromEmail(studentEmail) })
  }
  return conditions.length === 1 ? conditions[0] : { $or: conditions }
}

function taskStudentFilter(projectId, studentId, studentEmail) {
  const conditions = []
  if (studentId) conditions.push({ assigned_student_id: studentId })
  if (studentEmail) {
    conditions.push({ assigned_student_email: normalizeEmail(studentEmail) })
    conditions.push({ assigned_student_id: studentIdFromEmail(studentEmail) })
  }
  return { project_id: projectId, ...(conditions.length === 1 ? conditions[0] : { $or: conditions }) }
}

function formatDateLabel(dateLike) {
  if (!dateLike) return ''
  const dt = new Date(dateLike)
  if (Number.isNaN(dt.getTime())) return String(dateLike)
  return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function toTaskClass(status) {
  const raw = String(status || '').toLowerCase()
  if (raw === 'completed') return 'done'
  if (raw === 'in_progress') return 'active'
  return 'todo'
}

function makeInitials(name, fallback = 'ST') {
  const value = String(name || '').split(' ').filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase() || '').join('')
  return value || fallback
}

async function ensureStudentLoginAccount(db, { email, name, studentId, rollNo = null, phone = null }) {
  const normalizedEmail = normalizeEmail(email)

  const existingUser = await db.collection('users').findOne({ email: normalizedEmail })

  if (!existingUser) {
    await db.collection('users').insertOne({
      id: studentId,
      name,
      email: normalizedEmail,
      password: '123456',
      role: 'student',
      roll_no: rollNo,
      phone,
      created_at: new Date().toISOString(),
    })
    return
  }

  const update = {
    id: studentId,
    name,
    email: normalizedEmail,
    role: 'student',
    roll_no: rollNo,
    phone,
  }

  if (!String(existingUser.password || '').trim()) {
    update.password = '123456'
  }

  await db.collection('users').updateOne(
    { email: normalizedEmail },
    { $set: update },
  )
}

const notificationReadState = {
  director: new Set(),
  coordinator: new Set(),
  student: new Set(),
}

// ─── Health ──────────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'projectflow-backend' }))

// ─── Auth ────────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {}
  if (!email || !password) return res.status(400).json({ message: 'Email and password are required.' })
  const user = await authenticateUser(email, password)
  if (!user) return res.status(401).json({ message: 'Invalid email or password.' })
  return res.json({ user, redirectPath: getRedirectPath(user.role) })
})

app.post('/api/auth/signup', async (req, res) => {
  return res.status(403).json({ message: 'Public signup is disabled. Ask a Director or Coordinator to create an account.' })
})

app.post('/api/auth/change-password', async (req, res) => {
  try {
    const { email, currentPassword, newPassword } = req.body || {}
    const user = await changePassword({ email, currentPassword, newPassword })
    return res.json({ user, message: 'Password updated successfully.' })
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message || 'Unable to change password.' })
  }
})

// ─── Forgot / Reset Password ─────────────────────────────────────
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email || '')
    if (!email) return res.status(400).json({ message: 'Email is required.' })
    const db = await getDB()
    const user = await db.collection('users').findOne({ email })
    if (!user) {
      // Do not reveal whether user exists
      console.log('Password reset requested for unknown email:', email)
      return res.json({ ok: true, message: 'If that email exists, a reset link was sent.' })
    }

    const token = randomUUID()
    const expires = Date.now() + (60 * 60 * 1000) // 1 hour

    await db.collection('users').updateOne({ _id: user._id }, { $set: { reset_token: token, reset_token_expires: expires } })

    const frontendOrigin = process.env.FRONTEND_URL || process.env.NGROK_URL || req.headers.origin || 'http://localhost:5173'
    const resetUrl = `${frontendOrigin.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}`
    console.log(`Password reset link for ${email}: ${resetUrl}`)

    // Determine SMTP configuration. Support both new `SMTP_*` vars and legacy `EMAIL_USER`/`EMAIL_PASS`.
    const smtpHost = process.env.SMTP_HOST || (String(process.env.EMAIL_USER || '').toLowerCase().endsWith('@gmail.com') ? 'smtp.gmail.com' : undefined)
    const smtpPort = Number(process.env.SMTP_PORT || 587)
    const smtpSecure = String(process.env.SMTP_SECURE || 'false') === 'true'
    const smtpUser = process.env.SMTP_USER || process.env.EMAIL_USER
    const smtpPass = process.env.SMTP_PASS || process.env.EMAIL_PASS

    // If SMTP host and credentials are available, attempt to send email.
    if (smtpHost && smtpUser && smtpPass) {
      try {
        const nodemailerMod = await import('nodemailer')
        const nodemailer = nodemailerMod.default || nodemailerMod

        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: smtpSecure,
          auth: { user: smtpUser, pass: smtpPass },
        })

        const from = process.env.SMTP_FROM || `ProjectFlow <${smtpUser}>`
        const mailOptions = {
          from,
          to: email,
          subject: 'ProjectFlow — Password reset',
          text: `You requested a password reset for your ProjectFlow account. Use the link below to reset your password. This link expires in 1 hour.\n\n${resetUrl}`,
          html: `<p>You requested a password reset for your ProjectFlow account. Use the link below to reset your password. This link expires in 1 hour.</p><p><a href="${resetUrl}">${resetUrl}</a></p>`,
        }

        await transporter.sendMail(mailOptions)
        console.log('Password reset email sent to', email)
        return res.json({ ok: true, message: 'If that email exists, a reset link was sent.' })
      } catch (mailErr) {
        console.error('Failed to send reset email', mailErr)
        // Fall through to dev-style response to avoid leaking presence
        return res.json({ ok: true, message: 'If that email exists, a reset link was sent.' })
      }
    }

    // No SMTP configured — return resetUrl for development convenience
    return res.json({ ok: true, message: 'If that email exists, a reset link was sent.', resetUrl })
  } catch (e) {
    console.error('forgot-password error', e)
    return res.status(500).json({ message: 'Unable to process password reset.' })
  }
})

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body || {}
    if (!token || !newPassword) return res.status(400).json({ message: 'Token and new password are required.' })
    const db = await getDB()
    const user = await db.collection('users').findOne({ reset_token: String(token) })
    if (!user) return res.status(400).json({ message: 'Invalid or expired token.' })
    if (!user.reset_token_expires || Number(user.reset_token_expires) < Date.now()) {
      return res.status(400).json({ message: 'Invalid or expired token.' })
    }

    await db.collection('users').updateOne({ _id: user._id }, { $set: { password: String(newPassword) }, $unset: { reset_token: '', reset_token_expires: '' } })
    console.log(`Password reset for user ${user.email}`)
    return res.json({ ok: true, message: 'Password updated successfully.' })
  } catch (e) {
    console.error('reset-password error', e)
    return res.status(500).json({ message: 'Unable to reset password.' })
  }
})

app.post('/api/users', async (req, res) => {
  try {
    const { creatorEmail, creatorRole, role, name, email, department, phone, roll_no } = req.body || {}
    const user = await createManagedUser({
      creatorEmail,
      creatorRole,
      role,
      name,
      email,
      department,
      phone,
      roll_no,
    })
    return res.status(201).json({ user, message: 'Account created successfully.', defaultPassword: '123456' })
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message || 'Unable to create account.' })
  }
})

// ─── Users ───────────────────────────────────────────────────
app.get('/api/users/students', async (_req, res) => {
  try {
    const db = await getDB()
    const students = await db.collection('users').find({ role: 'student' }).toArray()
    res.json(students)
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})

// ─── Director Graph ──────────────────────────────────────────
app.get('/api/director-graph', async (req, res) => {
  try {
    const db = await getDB()

    const [projects, allUsers, allTasks, allSubmissions] = await Promise.all([
      db.collection('projects').find({}).sort({ created_at: -1 }).toArray(),
      db.collection('users').find({}).toArray(),
      db.collection('tasks').find({}).toArray(),
      db.collection('submissions').find({}).sort({ submitted_at: -1 }).toArray(),
    ])

    const students = allUsers.filter(u => u.role === 'student')
    const coordinators = allUsers.filter(u => u.role === 'coordinator')
    const usersById = {}
    for (const user of allUsers) {
      if (user.id) usersById[user.id] = user
      if (user.email) usersById[studentIdFromEmail(user.email)] = user
    }

    const projectIds = projects.map(p => p.id)
    const projectStudents = await db.collection('project_students').find({ project_id: { $in: projectIds } }).toArray()
    const alerts = buildAlertBundle({ projects, tasks: allTasks, projectStudents, usersById })

    // Build enriched projects with stats
    const enrichedProjects = projects.map(p => {
      const pStudents = projectStudents.filter(ps => ps.project_id === p.id)
      const pTasks = allTasks.filter(t => t.project_id === p.id)
      const completed = pTasks.filter(t => t.status === 'completed').length
      const pct = pTasks.length > 0 ? Math.round((completed / pTasks.length) * 100) : 0
      return {
        ...p,
        studentCount: pStudents.length,
        taskCount: pTasks.length,
        completedTasks: completed,
        pct,
      }
    })

    res.json({
      projects: enrichedProjects,
      students,
      coordinators,
      totalStudents: students.length,
      totalCoordinators: coordinators.length,
      totalProjects: projects.length,
      completedProjects: projects.filter(p => p.status === 'completed').length,
      projectStudents,
      recentSubmissions: allSubmissions.slice(0, 20),
      alerts: alerts.director,
      alertSummary: alerts.summary,
      usersById,
    })
  } catch (e) {
    console.error('director-graph error:', e)
    res.status(500).json({ message: e.message })
  }
})


app.get('/api/coordinator-graph', async (req, res) => {
  try {
    const db = await getDB()
    const coordinatorId = String(req.query?.coordinator_id || '').trim()
    const coordinatorEmail = normalizeEmail(req.query?.coordinator_email || '')
    const coordinatorName = String(req.query?.coordinator_name || '').trim()

    let resolvedCoordinator = null
    if (coordinatorId || coordinatorEmail || coordinatorName) {
      const userLookupConditions = []
      if (coordinatorId) userLookupConditions.push({ id: coordinatorId })
      if (coordinatorEmail) userLookupConditions.push({ email: coordinatorEmail })
      if (coordinatorName) userLookupConditions.push({ name: { $regex: `^${escapeRegex(coordinatorName)}$`, $options: 'i' } })

      if (userLookupConditions.length > 0) {
        resolvedCoordinator = await db.collection('users').findOne({
          role: 'coordinator',
          $or: userLookupConditions,
        })
      }
    }

    const candidateCoordinatorIds = new Set([
      coordinatorId,
      String(resolvedCoordinator?.id || '').trim(),
    ].filter(Boolean))

    const candidateCoordinatorEmails = new Set([
      coordinatorEmail,
      normalizeEmail(resolvedCoordinator?.email || ''),
    ].filter(Boolean))

    const candidateCoordinatorNames = new Set([
      coordinatorName,
      String(resolvedCoordinator?.name || '').trim(),
    ].filter(Boolean))

    const projectConditions = []
    for (const id of candidateCoordinatorIds) {
      projectConditions.push({ coordinator_id: id })
      // Legacy records may store coordinator identity in text fields.
      projectConditions.push({ coordinator_name: { $regex: `^${escapeRegex(id)}$`, $options: 'i' } })
      projectConditions.push({ coordinator: { $regex: `^${escapeRegex(id)}$`, $options: 'i' } })
      projectConditions.push({ coord: { $regex: `^${escapeRegex(id)}$`, $options: 'i' } })
    }

    for (const email of candidateCoordinatorEmails) {
      const emailLocalPart = String(email).split('@')[0]
      projectConditions.push({ coordinator_email: email })
      projectConditions.push({ coordinator_name: { $regex: `^${escapeRegex(email)}$`, $options: 'i' } })
      projectConditions.push({ coordinator: { $regex: `^${escapeRegex(email)}$`, $options: 'i' } })
      projectConditions.push({ coord: { $regex: `^${escapeRegex(email)}$`, $options: 'i' } })

      if (emailLocalPart) {
        projectConditions.push({ coordinator_name: { $regex: escapeRegex(emailLocalPart), $options: 'i' } })
      }
    }

    for (const name of candidateCoordinatorNames) {
      projectConditions.push({ coordinator_name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' } })
      projectConditions.push({ coordinator: { $regex: `^${escapeRegex(name)}$`, $options: 'i' } })
      projectConditions.push({ coord: { $regex: `^${escapeRegex(name)}$`, $options: 'i' } })

      // Handle values like "AKSHAY J - IT" or "Dr. Priya Sharma (coord)".
      projectConditions.push({ coordinator_name: { $regex: escapeRegex(name), $options: 'i' } })
    }

    const projectFilter = projectConditions.length > 0 ? { $or: projectConditions } : {}

    const projects = await db.collection('projects').find(projectFilter).sort({ created_at: -1 }).toArray()
    const projectIds = projects.map(p => p.id)

    const [modules, projectStudents, meetings, tasks, submissions, messages] = await Promise.all([
      db.collection('modules').find({ project_id: { $in: projectIds } }).toArray(),
      db.collection('project_students').find({ project_id: { $in: projectIds } }).toArray(),
      (() => {
        const meetingConditions = [
          ...(coordinatorId ? [{ coordinator_id: coordinatorId }] : []),
          ...(coordinatorEmail ? [{ coordinator_email: coordinatorEmail }] : []),
          ...(coordinatorName ? [{ coordinator_name: { $regex: `^${escapeRegex(coordinatorName)}$`, $options: 'i' } }] : []),
        ]
        const meetingFilter = meetingConditions.length > 0 ? { $or: meetingConditions } : {}
        return db.collection('meetings').find(meetingFilter).sort({ date: 1 }).toArray()
      })(),      db.collection('tasks').find({ project_id: { $in: projectIds } }).toArray(),
      db.collection('submissions').find({ project_id: { $in: projectIds } }).sort({ submitted_at: -1 }).toArray(),
      db.collection('messages').find({}).sort({ created_at: -1 }).toArray(),
    ])

    const studentIds = [...new Set([
      ...projectStudents.map(ps => ps.student_id),
      ...tasks.map(t => t.assigned_student_id),
      ...submissions.map(s => s.student_id),
    ].filter(Boolean))]

    const studentEmails = [...new Set([
      ...projectStudents.map(ps => ps.student_email),
      ...tasks.map(t => t.assigned_student_email),
      ...submissions.map(s => s.student_email),
    ].filter(Boolean))]

    // Find users by both id and email
    const userOrConditions = [
      ...(studentIds.length > 0 ? [{ id: { $in: studentIds } }] : []),
      ...(studentEmails.length > 0 ? [{ email: { $in: studentEmails } }] : []),
    ]
    const users = userOrConditions.length > 0
      ? await db.collection('users').find({ $or: userOrConditions }).toArray()
      : []

    // Build usersById keyed by both id AND email-derived id for reliable lookup
    const usersById = {}
    for (const u of users) {
      if (u.id) usersById[u.id] = u
      if (u.email) usersById[studentIdFromEmail(u.email)] = u
    }

    const alerts = buildAlertBundle({ projects, tasks, projectStudents, usersById })

    // Also add any project_students that have no user record yet (show email as name)
    // Also fix any existing records with generic "Student" name
    for (const ps of projectStudents) {
      const emailName = ps.student_email ? ps.student_email.split('@')[0] : null
      const existing = usersById[ps.student_id] || (ps.student_email ? usersById[studentIdFromEmail(ps.student_email)] : null)
      
      if (!existing) {
        const fallback = { id: ps.student_id, name: emailName || 'Student', email: ps.student_email || '', role: 'student' }
        if (ps.student_id) usersById[ps.student_id] = fallback
        if (ps.student_email) usersById[studentIdFromEmail(ps.student_email)] = fallback
      } else if (existing.name === 'Student' && emailName) {
        // Fix generic name with email prefix
        existing.name = emailName
        if (ps.student_id) usersById[ps.student_id] = existing
        if (ps.student_email) usersById[studentIdFromEmail(ps.student_email)] = existing
      }
    }

    res.json({ projects, modules, tasks, projectStudents, submissions, meetings, messages, activities: [], usersById, alerts: alerts.coordinator, alertSummary: alerts.summary })
  } catch (e) {
    console.error('coordinator-graph error:', e)
    res.status(500).json({ message: e.message })
  }
})

// ─── Projects ────────────────────────────────────────────────
app.post('/api/projects', async (req, res) => {
  try {
    const db = await getDB()
    const { title, coordinator, coordinator_id, coordinator_email, deadline, description, client, students, drive_folder_link, google_form_link } = req.body || {}
    if (!title) return res.status(400).json({ message: 'Project title is required.' })

    const coordinatorInput = String(coordinator || '').trim()
    let resolvedCoordinatorId = coordinator_id || null
    let resolvedCoordinatorEmail = coordinator_email ? normalizeEmail(coordinator_email) : null
    let resolvedCoordinatorName = coordinatorInput || 'Coordinator'

    // Director flow often sends coordinator as free text; resolve against users for stable matching.
    if (coordinatorInput) {
      const inputAsEmail = normalizeEmail(coordinatorInput)
      const looksLikeEmail = /@/.test(coordinatorInput)

      const coordinatorUser = await db.collection('users').findOne({
        role: 'coordinator',
        ...(looksLikeEmail
          ? { email: inputAsEmail }
          : { name: { $regex: `^${escapeRegex(coordinatorInput)}$`, $options: 'i' } }),
      })

      if (coordinatorUser) {
        resolvedCoordinatorId = coordinatorUser.id || resolvedCoordinatorId
        resolvedCoordinatorEmail = coordinatorUser.email ? normalizeEmail(coordinatorUser.email) : resolvedCoordinatorEmail
        resolvedCoordinatorName = String(coordinatorUser.name || resolvedCoordinatorName).trim() || 'Coordinator'
      } else if (looksLikeEmail && !resolvedCoordinatorEmail) {
        resolvedCoordinatorEmail = inputAsEmail
      }
    }

    const projectId = randomUUID()
    const project = {
      id: projectId,
      title: String(title).trim(),
      description: description ? String(description).trim() : '',
      client_notes: client ? String(client).trim() : '',
      coordinator_name: resolvedCoordinatorName,
      coordinator_id: resolvedCoordinatorId,
      coordinator_email: resolvedCoordinatorEmail,
      deadline: deadline || null,
      drive_folder_link: drive_folder_link || null,
      google_form_link: google_form_link || null,
      status: 'active',
      created_at: new Date().toISOString(),
    }

    await db.collection('projects').insertOne(project)

    // Insert students — use email-derived ID consistently
    const studentDocs = []
    for (const s of (Array.isArray(students) ? students : [])) {
      const email = normalizeEmail(s?.student_email || s?.email || '')
      if (!email) continue
      const name = String(s?.student_name || s?.name || email.split('@')[0]).trim()
      const phone = String(s?.phone || '').trim() || null
      const studentId = studentIdFromEmail(email)

      await ensureStudentLoginAccount(db, {
        email,
        name,
        studentId,
        rollNo: s?.roll_no || null,
        phone,
      })
      const exists = await db.collection('project_students').findOne({ project_id: projectId, student_email: email })
      if (!exists) {
        studentDocs.push({
          project_id: projectId,
          student_id: studentId,
          student_email: email,
          roll_no: s?.roll_no || null,
          phone,
          module_name: s?.module_name || null,
          role: s?.role || null,
          joined_at: new Date().toISOString(),
        })
      }
    }
    if (studentDocs.length > 0) await db.collection('project_students').insertMany(studentDocs)

    // Insert tasks — store both student_id and student_email
    const taskDocs = []
    for (const t of (Array.isArray(req.body?.tasks) ? req.body.tasks : [])) {
      if (!t?.title) continue
      const studentEmail = normalizeEmail(t.student_email || '')
      const studentId = studentEmail ? studentIdFromEmail(studentEmail) : null
      taskDocs.push({
        id: `task-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
        project_id: projectId,
        module_name: t.module_name || null,
        title: String(t.title).trim(),
        description: t.description || null,
        assigned_student_id: studentId,
        assigned_student_email: studentEmail || null,
        deadline: t.deadline || null,
        status: 'pending',
        created_at: new Date().toISOString(),
      })
    }
    if (taskDocs.length > 0) await db.collection('tasks').insertMany(taskDocs)

    return res.status(201).json({ message: 'Project created successfully', id: projectId, ...project })
  } catch (e) {
    console.error('create project error:', e)
    res.status(500).json({ message: e.message })
  }
})

app.post('/api/projects/:projectId/students', async (req, res) => {
  try {
    const db = await getDB()
    const projectId = String(req.params?.projectId || '').trim()
    const body = req.body || {}

    if (!projectId) return res.status(400).json({ message: 'Project ID is required.' })

    const project = await db.collection('projects').findOne({ id: projectId })
    if (!project) return res.status(404).json({ message: 'Project not found.' })

    const email = normalizeEmail(body.student_email || body.email || '')
    const name = String(body.student_name || body.name || '').trim()
    if (!email) return res.status(400).json({ message: 'Student email is required.' })
    if (!name) return res.status(400).json({ message: 'Student name is required.' })

    const phone = String(body.phone || '').trim() || null
    const rollNo = String(body.roll_no || '').trim() || null
    const moduleName = String(body.module_name || '').trim() || null
    const role = String(body.role || '').trim() || null
    const studentId = studentIdFromEmail(email)

    await ensureStudentLoginAccount(db, {
      email,
      name,
      studentId,
      rollNo,
      phone,
    })

    const existing = await db.collection('project_students').findOne({
      project_id: projectId,
      $or: [{ student_email: email }, { student_id: studentId }],
    })

    if (existing) {
      return res.status(200).json({
        message: 'Student already assigned to this project.',
        project_student: existing,
      })
    }

    const projectStudent = {
      project_id: projectId,
      student_id: studentId,
      student_email: email,
      student_name: name,
      roll_no: rollNo,
      phone,
      module_name: moduleName,
      role,
      joined_at: new Date().toISOString(),
    }

    await db.collection('project_students').insertOne(projectStudent)
    return res.status(201).json({ message: 'Student added to project.', project_student: projectStudent })
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})

app.patch('/api/tasks/:taskId/status', async (req, res) => {
  try {
    const db = await getDB()
    const { taskId } = req.params
    const { status } = req.body || {}
    const allowed = ['pending', 'in_progress', 'completed']
    if (!allowed.includes(status)) return res.status(400).json({ message: 'Invalid status.' })
    await db.collection('tasks').updateOne({ id: taskId }, { $set: { status } })
    res.json({ message: 'Task status updated.', id: taskId, status })
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})


app.patch('/api/projects/:projectId/drive-link', async (req, res) => {
  try {
    const db = await getDB()
    const { projectId } = req.params
    const drive_folder_link = String(req.body?.drive_folder_link || '').trim() || null
    await db.collection('projects').updateOne({ id: projectId }, { $set: { drive_folder_link } })
    res.json({ message: 'Drive link updated.', id: projectId, drive_folder_link })
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})

app.patch('/api/projects/:projectId/google-form-link', async (req, res) => {
  try {
    const db = await getDB()
    const { projectId } = req.params
    const google_form_link = String(req.body?.google_form_link || '').trim() || null
    await db.collection('projects').updateOne({ id: projectId }, { $set: { google_form_link } })
    res.json({ message: 'Google Form link updated.', id: projectId, google_form_link })
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})

app.patch('/api/projects/:projectId/coordinator', async (req, res) => {
  try {
    const db = await getDB()
    const { projectId } = req.params
    const coordinatorId = String(req.body?.coordinator_id || '').trim()
    const coordinatorEmail = normalizeEmail(req.body?.coordinator_email || '')
    const coordinatorName = String(req.body?.coordinator_name || '').trim()

    if (!coordinatorId && !coordinatorEmail && !coordinatorName) {
      return res.status(400).json({ message: 'Coordinator ID, email, or name is required.' })
    }

    const coordinatorQuery = { role: 'coordinator' }
    if (coordinatorId) coordinatorQuery.$or = [{ id: coordinatorId }]
    if (coordinatorEmail) {
      coordinatorQuery.$or = [...(coordinatorQuery.$or || []), { email: coordinatorEmail }]
    }
    if (coordinatorName) {
      coordinatorQuery.$or = [
        ...(coordinatorQuery.$or || []),
        { name: { $regex: `^${escapeRegex(coordinatorName)}$`, $options: 'i' } },
      ]
    }

    const coordinator = await db.collection('users').findOne(coordinatorQuery)

    if (!coordinator) {
      return res.status(404).json({ message: 'Coordinator not found.' })
    }

    const update = {
      coordinator_id: coordinator.id || null,
      coordinator_email: coordinator.email || null,
      coordinator_name: coordinator.name || 'Coordinator',
    }

    const result = await db.collection('projects').findOneAndUpdate(
      { id: String(projectId) },
      { $set: update },
      { returnDocument: 'after' }
    )

    if (!result?.value) {
      return res.status(404).json({ message: 'Project not found.' })
    }

    return res.json({ message: 'Coordinator assigned successfully.', project: result.value })
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Unable to assign coordinator.' })
  }
})

app.patch('/api/projects/:projectId/students/:studentId/drive-link', async (req, res) => {
  try {
    const db = await getDB()
    const { projectId, studentId } = req.params
    const drive_folder_link = String(req.body?.drive_folder_link || '').trim() || null

    const result = await db.collection('project_students').findOneAndUpdate(
      { project_id: String(projectId), student_id: String(studentId) },
      { $set: { drive_folder_link } },
      { returnDocument: 'after' }
    )

    if (!result?.value) {
      return res.status(404).json({ message: 'Project student mapping not found.' })
    }

    res.json({ message: 'Student drive link updated.', project_id: projectId, student_id: studentId, drive_folder_link })
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})

app.get('/api/reports/project/:projectId', async (req, res) => {
  try {
    const projectId = String(req.params?.projectId || '').trim()
    if (!projectId) {
      return res.status(400).json({ message: 'Project ID is required.' })
    }

    const db = await getDB()
    const project = await db.collection('projects').findOne({ id: projectId })
    if (!project) {
      return res.status(404).json({ message: 'Project not found.' })
    }

    const modules = await db.collection('modules').find({ project_id: projectId }).sort({ order_index: 1 }).toArray()
    const moduleIds = modules.map((m) => m.id).filter(Boolean)

    const taskFilter = moduleIds.length > 0
      ? { $or: [{ project_id: projectId }, { module_id: { $in: moduleIds } }] }
      : { project_id: projectId }

    const tasks = await db.collection('tasks').find(taskFilter).toArray()
    const taskIds = tasks.map((task) => task.id).filter(Boolean)

    const projectStudents = await db.collection('project_students').find({ project_id: projectId }).toArray()
    const submissionFilter = taskIds.length > 0 ? { task_id: { $in: taskIds } } : { project_id: projectId }
    const submissions = await db.collection('submissions').find(submissionFilter).sort({ submitted_at: -1 }).toArray()

    const allUsers = await db.collection('users').find({}).toArray()
    const usersById = {}
    for (const user of allUsers) {
      if (user?.id) usersById[user.id] = user
      if (user?.email) usersById[studentIdFromEmail(user.email)] = user
    }

    res.json({ project, modules, tasks, projectStudents, submissions, usersById })
  } catch (e) {
    console.error('project report error:', e)
    res.status(500).json({ message: e.message || 'Unable to build project report.' })
  }
})

// ─── Generic Reports Endpoint ─────────────────────────────────────────────
function parsePeriodToRange(period) {
  const now = new Date()
  let start = new Date(0)
  let end = new Date()

  switch (String(period || '').toLowerCase()) {
    case 'current-semester': {
      // Assume semesters: Jan-Jun, Jul-Dec
      const month = now.getMonth() + 1
      if (month <= 6) {
        start = new Date(now.getFullYear(), 0, 1)
        end = new Date(now.getFullYear(), 5, 30, 23, 59, 59)
      } else {
        start = new Date(now.getFullYear(), 6, 1)
        end = new Date(now.getFullYear(), 11, 31, 23, 59, 59)
      }
      break
    }
    case 'last-quarter': {
      const q = Math.floor((now.getMonth()) / 3)
      const lastQ = Math.max(0, q - 1)
      start = new Date(now.getFullYear(), lastQ * 3, 1)
      end = new Date(now.getFullYear(), lastQ * 3 + 2, 31, 23, 59, 59)
      break
    }
    case 'last-30-days': {
      end = now
      start = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 30)
      break
    }
    case 'all-time':
    default:
      start = new Date(0)
      end = now
  }

  return { start: start.toISOString(), end: end.toISOString() }
}

async function buildReportData({ db, reportType, projectId, periodRange }) {
  // periodRange: { start, end } ISO strings
  const { start, end } = periodRange || { start: new Date(0).toISOString(), end: new Date().toISOString() }

  // Common collections
  const projects = await db.collection('projects').find(projectId ? { id: projectId } : {}).toArray()
  const projectIds = projects.map(p => p.id)
  const modules = await db.collection('modules').find(projectIds.length ? { project_id: { $in: projectIds } } : {}).toArray()
  const moduleIds = modules.map(m => m.id).filter(Boolean)

  const taskFilter = projectIds.length || moduleIds.length ? {
    $and: [
      { $or: [{ project_id: { $in: projectIds } }, { module_id: { $in: moduleIds } }] },
      { created_at: { $gte: start, $lte: end } }
    ]
  } : { created_at: { $gte: start, $lte: end } }
  const tasks = await db.collection('tasks').find(taskFilter).toArray()

  const students = await db.collection('project_students').find(projectIds.length ? { project_id: { $in: projectIds } } : {}).toArray()

  const submissionsFilter = projectIds.length || tasks.length ? {
    $and: [
      { $or: [{ project_id: { $in: projectIds } }, { task_id: { $in: tasks.map(t => t.id) } }] },
      { submitted_at: { $gte: start, $lte: end } }
    ]
  } : { submitted_at: { $gte: start, $lte: end } }
  const submissions = await db.collection('submissions').find(submissionsFilter).toArray()

  const users = await db.collection('users').find({}).toArray()
  const usersById = {}
  for (const u of users) {
    if (u.id) usersById[u.id] = u
    if (u.email) usersById[`student-${String(u.email).replace(/[^a-z0-9]+/gi, '-')}`] = u
  }

  // Build report shapes
  if (reportType === 'project-summary') {
    const project = projects[0] || null
    if (!project) return { error: 'Project not found' }

    const projModules = modules.filter(m => m.project_id === project.id)
    const projTasks = tasks.filter(t => t.project_id === project.id || (t.module_id && projModules.some(pm => pm.id === t.module_id)))
    const projStudents = students.filter(s => s.project_id === project.id)
    const projSubmissions = submissions.filter(s => s.project_id === project.id || projTasks.some(t => t.id === s.task_id))

    // analytics
    const totalModules = projModules.length
    const completedModules = projModules.filter(m => Number(m.progress || 0) >= 100 || String(m.status || '').toLowerCase() === 'completed').length
    const pendingModules = totalModules - completedModules
    const inProgressModules = projModules.filter(m => Number(m.progress || 0) > 0 && Number(m.progress || 0) < 100).length

    return {
      reportType,
      project,
      modules: projModules,
      tasks: projTasks,
      projectStudents: projStudents,
      submissions: projSubmissions,
      usersById,
      analytics: { totalModules, completedModules, pendingModules, inProgressModules },
    }
  }

  if (reportType === 'team-progress') {
    // Aggregate by team member
    const byMember = {}
    for (const t of tasks) {
      const id = t.assigned_student_id || t.assigned_student_email || 'unassigned'
      if (!byMember[id]) byMember[id] = { assigned: 0, completed: 0, pending: 0, in_progress: 0 }
      byMember[id].assigned += 1
      if (String(t.status || '').toLowerCase() === 'completed') byMember[id].completed += 1
      else if (String(t.status || '').toLowerCase().includes('progress')) byMember[id].in_progress += 1
      else byMember[id].pending += 1
    }
    const rows = Object.entries(byMember).map(([id, stats]) => ({ id, name: usersById[id]?.name || id, ...stats, productivity: stats.assigned ? Math.round((stats.completed / stats.assigned) * 100) : 0 }))
    return { reportType, period: { start, end }, rows }
  }

  if (reportType === 'kpi-report') {
    const totalTasks = tasks.length
    const completedTasks = tasks.filter(t => String(t.status || '').toLowerCase() === 'completed').length
    const delayed = tasks.filter(t => t.deadline && new Date(t.deadline) < new Date() && String(t.status || '').toLowerCase() !== 'completed').length
    const productivity = totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0
    return { reportType, period: { start, end }, kpis: { totalTasks, completedTasks, delayed, productivity } }
  }

  if (reportType === 'department-overview') {
    // Group projects by domain
    const byDomain = {}
    for (const p of projects) {
      const domain = String(p.domain || p.department || 'General')
      if (!byDomain[domain]) byDomain[domain] = { projects: 0, completed: 0 }
      byDomain[domain].projects += 1
      if (String(p.status || '').toLowerCase() === 'completed') byDomain[domain].completed += 1
    }
    const rows = Object.entries(byDomain).map(([domain, stats]) => ({ domain, ...stats, completionRate: stats.projects ? Math.round((stats.completed / stats.projects) * 100) : 0 }))
    return { reportType, rows }
  }

  return { error: 'Unknown report type' }
}

app.get('/api/reports', async (req, res) => {
  try {
    const db = await getDB()
    const reportType = String(req.query?.type || 'project-summary')
    const period = String(req.query?.period || 'all-time')
    const format = String(req.query?.format || 'json').toLowerCase()
    const projectId = String(req.query?.projectId || req.query?.project || '').trim() || null

    const periodRange = parsePeriodToRange(period)
    const data = await buildReportData({ db, reportType, projectId, periodRange })
    if (data?.error) return res.status(400).json({ message: data.error })

    // For now we return JSON payload for clients to render/export.
    return res.json({ report: data })
  } catch (e) {
    console.error('reports endpoint error:', e)
    return res.status(500).json({ message: e.message || 'Unable to generate report.' })
  }
})

// ─── Tasks ───────────────────────────────────────────────────
app.post('/api/tasks', async (req, res) => {
  try {
    const db = await getDB()
    const { title, description, module_id, assigned_student_id, assigned_student_email, deadline, status, project_id, priority } = req.body || {}
    if (!title) return res.status(400).json({ message: 'Task title is required.' })

    let inferredProjectId = project_id || null
    if (!inferredProjectId && module_id) {
      const mod = await db.collection('modules').findOne({ id: module_id })
      if (mod?.project_id) inferredProjectId = mod.project_id
    }

    const email = normalizeEmail(assigned_student_email || '')
    const task = {
      id: `task-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
      module_id: module_id || null,
      project_id: inferredProjectId,
      title: String(title).trim(),
      description: description || null,
      assigned_student_id: assigned_student_id || (email ? studentIdFromEmail(email) : null),
      assigned_student_email: email || null,
      deadline: deadline || null,
      status: status || 'pending',
      priority: priority || 'Medium',
      created_at: new Date().toISOString(),
    }

    await db.collection('tasks').insertOne(task)
    res.status(201).json({ message: 'Task created successfully', ...task })
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})

// ─── Submissions ─────────────────────────────────────────────
app.post('/api/student/submissions', async (req, res) => {
  try {
    const db = await getDB()
    const { student_id, student_email, task, title, task_id, type, pr_link, github_link, screenshot_link, video_link, summary, project_id } = req.body || {}
    const effectiveTask = String(task || title || '').trim()
    const email = normalizeEmail(student_email)

    if (!effectiveTask) return res.status(400).json({ message: 'Task title is required.' })
    if (!student_id && !email) return res.status(400).json({ message: 'Student identity is required.' })

    let resolvedProjectId = project_id || null
    if (!resolvedProjectId) {
      const membership = await db.collection('project_students').findOne(
        studentFilter(student_id, email)
      )
      resolvedProjectId = membership?.project_id || null
    }

    const row = {
      id: `submission-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
      project_id: resolvedProjectId,
      task_id: task_id || null,
      student_id: student_id || null,
      student_email: email || null,
      task: effectiveTask,
      type: String(type || 'Pull Request'),
      github_link: github_link || pr_link || null,
      screenshot_link: screenshot_link || null,
      video_link: video_link || null,
      summary: summary || null,
      review_status: 'pending',
      status: 'Pending',
      submitted_at: new Date().toISOString(),
    }

    await db.collection('submissions').insertOne(row)
    res.status(201).json({ message: 'Submission saved.', id: row.id })
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})

async function handleSubmissionReview(req, res) {
  try {
    const db = await getDB()
    const { submissionId } = req.params
    const { review_status, coordinator_comment, reviewed_at, task_status } = req.body || {}

    const allowed = ['pending', 'approved', 'rejected']
    const nextReview = String(review_status || '').trim().toLowerCase()
    if (!allowed.includes(nextReview)) return res.status(400).json({ message: 'Invalid review status.' })

    const submission = await db.collection('submissions').findOne({ id: submissionId })
    if (!submission) return res.status(404).json({ message: 'Submission not found.' })

    const updated = {
      ...submission,
      review_status: nextReview,
      coordinator_comment: coordinator_comment || null,
      reviewed_at: reviewed_at || new Date().toISOString(),
      status: nextReview === 'approved' ? 'Approved' : nextReview === 'rejected' ? 'Rejected' : 'Pending',
    }

    await db.collection('submissions').updateOne({ id: submissionId }, { $set: updated })

    const nextTaskStatus = task_status || (nextReview === 'approved' ? 'completed' : nextReview === 'rejected' ? 'rejected' : null)
    if (nextTaskStatus && submission.task_id) {
      await db.collection('tasks').updateOne({ id: submission.task_id }, { $set: { status: nextTaskStatus } })
    }

    // Add message to student inbox
    if (submission.student_id || submission.student_email) {
      const taskTitle = String(submission.task || 'submission').trim()
      const note = String(coordinator_comment || '').trim()
      const messageBody = nextReview === 'approved'
        ? `Your submission for "${taskTitle}" was approved.${note ? `\n\nNote: ${note}` : ''}`
        : `Your submission for "${taskTitle}" needs redo.${note ? `\n\nReason: ${note}` : ''}`

      await db.collection('messages').insertOne({
        id: `msg-${Date.now()}`,
        student_id: submission.student_id || null,
        student_email: submission.student_email || null,
        from: 'Coordinator',
        subject: nextReview === 'approved' ? 'Submission Approved' : 'Submission Needs Redo',
        message: messageBody,
        message_type: nextReview === 'approved' ? 'Review Approved' : 'Review Redo',
        created_at: new Date().toISOString(),
        read: false,
      })
    }

    res.json(updated)
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
}

app.patch('/api/coordinator/submissions/:submissionId/review', handleSubmissionReview)
app.post('/api/coordinator/submissions/:submissionId/review', handleSubmissionReview)

// ─── Messages ────────────────────────────────────────────────
app.post('/api/student/messages', async (req, res) => {
  try {
    const db = await getDB()
    const { student_id, student_email, to, message_type, subject, message } = req.body || {}
    const email = normalizeEmail(student_email)
    const body = String(message || '').trim()
    if (!body) return res.status(400).json({ message: 'Message is required.' })
    if (!student_id && !email) return res.status(400).json({ message: 'Student identity is required.' })

    const row = {
      id: `msg-${Date.now()}`,
      student_id: student_id || null,
      student_email: email || null,
      from: 'Student',
      to: String(to || 'Coordinator'),
      message_type: String(message_type || 'General Query'),
      subject: String(subject || 'No Subject').trim(),
      message: body,
      created_at: new Date().toISOString(),
      read: false,
    }

    await db.collection('messages').insertOne(row)
    res.status(201).json({ message: 'Message sent.', id: row.id })
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})

// ─── Meetings ────────────────────────────────────────────────
app.get('/api/meetings', async (req, res) => {
  try {
    const db = await getDB()
    const coordinatorId = String(req.query?.coordinator_id || '').trim()
    const filter = coordinatorId ? { coordinator_id: coordinatorId } : {}
    const meetings = await db.collection('meetings').find(filter).sort({ date: 1 }).toArray()
    res.json(meetings)
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})

app.post('/api/meetings', async (req, res) => {
  try {
    const db = await getDB()
    const { coordinator_id, coordinator_email, project_id, title, date, time, location, note } = req.body || {}
    if (!title || !date || !time) return res.status(400).json({ message: 'Title, date, and time are required.' })

    const meeting = {
      id: `meeting-${Date.now()}`,
      coordinator_id: coordinator_id || null,
      coordinator_email: coordinator_email ? normalizeEmail(coordinator_email) : null,
      project_id: project_id || null,
      title: String(title).trim(),
      date: String(date),
      time: String(time),
      location: location || null,
      note: note || null,
      created_at: new Date().toISOString(),
    }

    await db.collection('meetings').insertOne(meeting)
    res.status(201).json(meeting)
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})

// ─── Dashboard (student/director - legacy) ───────────────────
app.get('/api/dashboard/:role', async (req, res) => {
  const role = String(req.params.role || '').trim().toLowerCase()

  if (role === 'student') {
    try {
      const db = await getDB()
      const studentId = String(req.query?.studentId || '').trim()
      const studentEmail = normalizeEmail(req.query?.studentEmail || '')
      const requestedProjectId = String(req.query?.projectId || '').trim() || null

      // Find student — email is the source of truth
      let student = null
      if (studentEmail) student = await db.collection('users').findOne({ email: studentEmail })
      if (!student && studentId) student = await db.collection('users').findOne({ id: studentId })

      // Auto-create if not found
      if (!student && studentEmail) {
        const newId = studentIdFromEmail(studentEmail)
        student = { id: newId, name: studentEmail.split('@')[0], email: studentEmail, role: 'student', department: '' }
        await db.collection('users').updateOne({ email: studentEmail }, { $setOnInsert: student }, { upsert: true })
        student = await db.collection('users').findOne({ email: studentEmail })
      }

      if (!student) return res.json(buildEmptyStudentDashboard())

      // Find ALL memberships for this student
      const memberships = await db.collection('project_students').find(
        studentFilter(student.id, student.email)
      ).toArray()

      if (!memberships.length) return res.json(buildEmptyStudentDashboard(student))

      const projectIds = [...new Set(memberships.map(m => m.project_id).filter(Boolean))]
      const projects = await db.collection('projects').find({ id: { $in: projectIds } }).toArray()
      if (!projects.length) return res.json(buildEmptyStudentDashboard(student))

      // Gather all tasks across all projects
      const allTasks = []
      for (const proj of projects) {
        const projTasks = await db.collection('tasks').find(
          taskStudentFilter(proj.id, student.id, student.email)
        ).toArray()
        allTasks.push(...projTasks)
      }

      const taskIds = allTasks.map(t => t.id)
      const submissions = taskIds.length > 0
        ? await db.collection('submissions').find({
            $or: [
              { task_id: { $in: taskIds }, student_id: student.id },
              { task_id: { $in: taskIds }, student_email: student.email },
            ]
          }).sort({ submitted_at: -1 }).toArray()
        : []
      const messages = await db.collection('messages').find({
        $or: [{ student_id: student.id }, { student_email: student.email }]
      }).sort({ created_at: -1 }).toArray()

      // Use the requested project if specified, otherwise most recent
      const project = (requestedProjectId
        ? projects.find(p => p.id === requestedProjectId)
        : null) || projects.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]
      const membership = memberships.find(m => m.project_id === project.id) || memberships[0]
      const tasks = allTasks.filter(t => t.project_id === project.id)

      const teamCount = await db.collection('project_students').countDocuments({ project_id: project.id })
      const completed = tasks.filter(t => t.status === 'completed').length
      const inProgress = tasks.filter(t => t.status === 'in_progress').length
      const progress = tasks.length > 0 ? Math.round((completed / tasks.length) * 100) : 0

      const normalizedTasks = tasks.map(t => {
        const cls = toTaskClass(t.status)
        const deadline = t.deadline ? new Date(t.deadline) : null
        const daysLeft = deadline ? Math.ceil((deadline.getTime() - Date.now()) / 86400000) : null
        return {
          source_task_id: t.id,
          cls,
          check: cls === 'done' ? '✓' : cls === 'active' ? '⟳' : '○',
          title: t.title,
          sub: t.deadline ? `Due ${formatDateLabel(t.deadline)}` : 'Due TBD',
          urgent: typeof daysLeft === 'number' ? daysLeft <= 2 && cls !== 'done' : false,
        }
      })

      // Build all projects summary for the student
      const allProjectsSummary = projects.map(p => {
        const pTasks = allTasks.filter(t => t.project_id === p.id)
        const pCompleted = pTasks.filter(t => t.status === 'completed').length
        const pProgress = pTasks.length > 0 ? Math.round((pCompleted / pTasks.length) * 100) : 0
        const pMembership = memberships.find(m => m.project_id === p.id)
        return {
          id: p.id,
          title: p.title,
          module: pMembership?.module_name || '—',
          taskCount: pTasks.length,
          progress: pProgress,
          status: p.status || 'active',
        }
      })

      return res.json({
        profile: { name: student.name, role: 'Student', subtitle: student.department || '', initials: makeInitials(student.name) },
        header: { title: 'My Workspace', subtitle: '' },
        kpis: [
          { icon: '📋', bg: '#eef2ff', color: '#1a3faa', value: String(allTasks.length), label: 'Total Tasks', trend: 'up', trendTxt: 'Assigned' },
          { icon: '✔', bg: '#dcfce7', color: '#15803d', value: String(allTasks.filter(t => t.status === 'completed').length), label: 'Completed', trend: 'up', trendTxt: `${progress}%` },
          { icon: '⏳', bg: '#fef9c3', color: '#a16207', value: String(allTasks.filter(t => t.status === 'in_progress').length), label: 'In Progress', trend: 'up', trendTxt: 'Current' },
          { icon: '📁', bg: '#e0f2fe', color: '#0369a1', value: String(projects.length), label: 'Projects', trend: 'up', trendTxt: 'Assigned' },
        ],
        project: {
          id: project.id,
          title: project.title,
          status: project.status || 'active',
          desc: project.description || '',
          coordinator: project.coordinator_name || 'Coordinator',
          deadline: formatDateLabel(project.deadline),
          teamSize: `${teamCount} Members`,
          department: student.department || '',
          module: membership?.module_name || '—',
          progress,
          milestones: normalizedTasks.map(t => ({ text: t.title, state: t.cls === 'done' ? 'done' : t.cls === 'active' ? 'active' : 'todo' })),
          drive_folder_link: project.drive_folder_link || null,
        },
        allProjects: allProjectsSummary,
        epicMilestones: [],
        tasks: normalizedTasks,
        announcements: [],
        submissions: submissions.map(s => ({
          task: s.task || 'Submission',
          date: formatDateLabel(s.submitted_at),
          type: s.type || 'Submission',
          review_status: s.review_status || 'pending',
          grade: s.review_status === 'approved' ? 'Approved' : s.review_status === 'rejected' ? 'Rejected' : '—',
          status: s.review_status === 'approved' ? 'Graded' : s.review_status === 'rejected' ? 'Rejected' : 'Pending',
          reason: s.coordinator_comment || '',
          github_link: s.github_link || null,
          screenshot_link: s.screenshot_link || null,
          video_link: s.video_link || null,
        })),
        messages: messages.map(m => ({
          from: m.from || 'Coordinator',
          subject: m.subject || 'Message',
          body: m.message || '',
          message_type: m.message_type || 'General',
          time: formatDateLabel(m.created_at) || 'Just now',
          read: Boolean(m.read),
        })),
      })
    } catch (e) {
      console.error('student dashboard error:', e)
      return res.json(buildEmptyStudentDashboard())
    }
  }

  const dashboard = dashboardData[role]
  if (!dashboard) return res.status(404).json({ message: 'Dashboard not found.' })

  // For director, enrich with real MongoDB data
  if (role === 'director') {
    try {
      const db = await getDB()
      const projects = await db.collection('projects').find({}).sort({ created_at: -1 }).toArray()
      const studentCount = await db.collection('users').countDocuments({ role: 'student' })
      const coordinatorCount = await db.collection('users').countDocuments({ role: 'coordinator' })

      const enriched = {
        ...dashboard,
        kpis: [
          { icon: '📁', bg: '#eef2ff', color: '#1a3faa', value: String(projects.length), label: 'Total Projects', trend: 'up', trendTxt: 'Active' },
          { icon: '👥', bg: '#e0f2fe', color: '#0369a1', value: String(studentCount), label: 'Active Students', trend: 'up', trendTxt: '' },
          { icon: '✔', bg: '#dcfce7', color: '#15803d', value: String(projects.filter(p => p.status === 'completed').length), label: 'Completed', trend: 'up', trendTxt: '' },
          { icon: '⚠', bg: '#fee2e2', color: '#b91c1c', value: '0', label: 'At Risk', trend: 'down', trendTxt: '' },
        ],
        projects: projects.map(p => ({
          name: p.title,
          coord: p.coordinator_name || 'Coordinator',
          n: 0,
          pct: 0,
          color: '#1a3faa',
          dl: p.deadline || 'TBD',
          badge: p.status === 'completed' ? 'badge-green' : 'badge-amber',
          status: p.status === 'completed' ? 'Completed' : 'Active',
        })),
        userDistribution: [
          { name: 'Students', value: studentCount, fill: '#0052CC' },
          { name: 'Coordinators', value: coordinatorCount, fill: '#36B37E' },
        ],
      }
      return res.json(enriched)
    } catch (e) {
      console.error('director dashboard error:', e)
    }
  }

  return res.json(dashboard)
})

function buildEmptyStudentDashboard(student = {}) {
  return {
    profile: { name: student?.name || '', role: 'Student', subtitle: '', initials: makeInitials(student?.name || '', 'ST') },
    header: { title: 'My Workspace', subtitle: '' },
    kpis: [],
    project: { id: '', title: '', status: '', desc: '', coordinator: '', deadline: '', teamSize: '', department: '', progress: 0, milestones: [], drive_folder_link: null },
    epicMilestones: [], tasks: [], announcements: [], submissions: [], messages: [],
  }
}

// ─── Debug ───────────────────────────────────────────────────
app.get('/api/debug/student', async (req, res) => {
  try {
    const db = await getDB()
    const email = normalizeEmail(req.query?.email || '')
    const studentIdDerived = email ? `student-${email.replace(/[^a-z0-9]+/gi, '-')}` : null

    const user = email ? await db.collection('users').findOne({ email }) : null
    const memberships = email ? await db.collection('project_students').find({
      $or: [
        ...(user?.id ? [{ student_id: user.id }] : []),
        ...(studentIdDerived ? [{ student_id: studentIdDerived }] : []),
        { student_email: email },
      ]
    }).toArray() : []

    const projectIds = memberships.map(m => m.project_id)
    const projects = await db.collection('projects').find({ id: { $in: projectIds } }).toArray()
    const tasks = await db.collection('tasks').find({
      $or: [
        ...(user?.id ? [{ assigned_student_id: user.id }] : []),
        ...(studentIdDerived ? [{ assigned_student_id: studentIdDerived }] : []),
        ...(email ? [{ assigned_student_email: email }] : []),
      ]
    }).toArray()

    res.json({ email, user, studentIdDerived, memberships, projects, tasks })
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})


app.get('/api/notifications/:role', async (req, res) => {
  const role = String(req.params.role || '').trim().toLowerCase()
  if (!notificationReadState[role]) return res.status(404).json({ message: 'Role not found' })

  try {
    const db = await getDB()
    const coordinatorId = String(req.query?.coordinator_id || '').trim()
    const coordinatorEmail = normalizeEmail(req.query?.coordinator_email || '')
    const studentId = String(req.query?.student_id || '').trim()
    const studentEmail = normalizeEmail(req.query?.student_email || '')

    if (role === 'student') {
      const messageQuery = (studentId || studentEmail) ? studentFilter(studentId, studentEmail) : { $expr: false }
      const messages = await db.collection('messages').find(messageQuery).sort({ created_at: -1 }).toArray()

      return res.json(messages.map((message) => ({
        id: message.id,
        icon: message.message_type === 'Review Approved' ? '✅' : message.message_type === 'Review Redo' ? '⚠️' : '✉️',
        title: message.subject || 'Notification',
        body: message.message || '',
        time: formatDateLabel(message.created_at),
        read: Boolean(message.read),
      })))
    }

    const [projects, allUsers, allTasks, projectStudents] = await Promise.all([
      db.collection('projects').find({}).sort({ created_at: -1 }).toArray(),
      db.collection('users').find({}).toArray(),
      db.collection('tasks').find({}).toArray(),
      db.collection('project_students').find({}).toArray(),
    ])

    const usersById = {}
    for (const user of allUsers) {
      if (user.id) usersById[user.id] = user
      if (user.email) usersById[studentIdFromEmail(user.email)] = user
    }

    const alerts = buildAlertBundle({ projects, tasks: allTasks, projectStudents, usersById })
    const roleFeed = role === 'director' ? alerts.director.notifications : alerts.coordinator.notifications
    const filtered = roleFeed.filter((notification) => {
      const alert = alerts.all.find((item) => item.id === notification.id)
      if (!alert) return false

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
    }).map((notification) => ({
      ...notification,
      read: notificationReadState[role].has(notification.id),
    }))

    return res.json(filtered)
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Unable to load notifications.' })
  }
})

app.patch('/api/notifications/:role/read', async (req, res) => {
  const role = String(req.params.role || '').trim().toLowerCase()
  if (!notificationReadState[role]) return res.status(404).json({ message: 'Role not found' })

  try {
    const db = await getDB()
    const coordinatorId = String(req.query?.coordinator_id || '').trim()
    const coordinatorEmail = normalizeEmail(req.query?.coordinator_email || '')
    const studentId = String(req.query?.student_id || '').trim()
    const studentEmail = normalizeEmail(req.query?.student_email || '')

    if (role === 'student') {
      const messageQuery = (studentId || studentEmail) ? studentFilter(studentId, studentEmail) : { $expr: false }
      await db.collection('messages').updateMany(messageQuery, { $set: { read: true } })
      return res.json({ ok: true })
    }

    const [projects, allUsers, allTasks, projectStudents] = await Promise.all([
      db.collection('projects').find({}).sort({ created_at: -1 }).toArray(),
      db.collection('users').find({}).toArray(),
      db.collection('tasks').find({}).toArray(),
      db.collection('project_students').find({}).toArray(),
    ])

    const usersById = {}
    for (const user of allUsers) {
      if (user.id) usersById[user.id] = user
      if (user.email) usersById[studentIdFromEmail(user.email)] = user
    }

    const alerts = buildAlertBundle({ projects, tasks: allTasks, projectStudents, usersById })
    const roleFeed = role === 'director' ? alerts.director.notifications : alerts.coordinator.notifications
    const idsToMark = roleFeed
      .filter((notification) => {
        const alert = alerts.all.find((item) => item.id === notification.id)
        if (!alert) return false

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
      .map((notification) => notification.id)

    idsToMark.forEach((id) => notificationReadState[role].add(id))
    return res.json({ ok: true })
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Unable to update notifications.' })
  }
})

app.get('/api/alerts-all', async (req, res) => {
  try {
    const db = await getDB()
    const [projects, allUsers, allTasks, projectStudents] = await Promise.all([
      db.collection('projects').find({}).sort({ created_at: -1 }).toArray(),
      db.collection('users').find({}).toArray(),
      db.collection('tasks').find({}).toArray(),
      db.collection('project_students').find({}).toArray(),
    ])

    const usersById = {}
    for (const user of allUsers) {
      if (user.id) usersById[user.id] = user
      if (user.email) usersById[studentIdFromEmail(user.email)] = user
    }

    const alerts = buildAlertBundle({ projects, tasks: allTasks, projectStudents, usersById })
    
    // Convert all alerts to frontend format with additional metadata
    const formattedAlerts = alerts.all.map((alert, index) => {
      const categoryMap = {
        'overdue-project': 'Overdue Projects',
        'low-progress-project': 'Low Progress',
        'deadline-risk-project': 'Deadline Risk',
        'frequent-delay': 'Frequent Delays',
      }
      
      return {
        id: alert.id || `alert-${index}`,
        title: alert.alertType || 'Alert',
        description: alert.message || '',
        details: `
Project: ${alert.project_title}
      Coordinator: ${alert.coordinator_name || 'Coordinator'}
Student: ${alert.student_name}
Progress: ${alert.progress_value}%
${alert.deadline ? `Deadline: ${alert.deadline}` : ''}
${alert.days_left !== null ? `Days Left: ${alert.days_left}` : ''}`,
        priority: alert.priority || 'Medium',
        category: categoryMap[alert.category] || 'Other',
        timestamp: alert.created_at || new Date().toISOString(),
        read: notificationReadState['director']?.has(alert.id) || notificationReadState['coordinator']?.has(alert.id) || false,
        affectedCount: 1,
        project_id: alert.project_id,
        project_title: alert.project_title,
        coordinator_name: alert.coordinator_name || 'Coordinator',
        student_name: alert.student_name,
        progress: alert.progress_value,
      }
    })

    return res.json(formattedAlerts)
  } catch (error) {
    console.error('alerts-all error:', error)
    return res.status(500).json({ message: error.message || 'Unable to load alerts.' })
  }
})

// ─── Start ───────────────────────────────────────────────────
connectDB().then(() => {
  app.listen(port, () => {
    console.log(`ProjectFlow backend running on http://localhost:${port}`)
  })
}).catch(err => {
  console.error('Failed to connect to MongoDB:', err.message)
  process.exit(1)
})
