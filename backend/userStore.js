import { randomUUID } from 'crypto'
import { getDB } from './mongoClient.js'

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

function studentIdFromEmail(email) {
  return `student-${normalizeEmail(email).replace(/[^a-z0-9]+/gi, '-')}`
}

function sanitizeUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, department: user.department, phone: user.phone }
}

export async function authenticateUser(email, password) {
  const db = await getDB()
  const user = await db.collection('users').findOne({ email: normalizeEmail(email), password })
  return user ? sanitizeUser(user) : null
}

export async function registerUser(input) {
  const db = await getDB()
  const email = normalizeEmail(input.email)
  const role = input.role || 'student'

  const existing = await db.collection('users').findOne({ email })
  if (existing) {
    const err = new Error('This email is already registered.')
    err.status = 409
    throw err
  }

  // Use email-derived ID for students so coordinator-created records match
  const id = role === 'student' ? studentIdFromEmail(email) : randomUUID()

  const user = {
    id,
    name: String(input.name || '').trim(),
    email,
    password: String(input.password || '123456'),
    role,
    department: String(input.department || '').trim(),
    phone: String(input.phone || '').trim(),
    roll_no: String(input.roll_no || '').trim() || null,
    created_at: new Date().toISOString(),
  }

  await db.collection('users').insertOne(user)
  return sanitizeUser(user)
}

function canCreateRole(creatorRole, targetRole) {
  const normalizedCreator = String(creatorRole || '').trim().toLowerCase()
  const normalizedTarget = String(targetRole || '').trim().toLowerCase()
  if (normalizedCreator === 'director' && normalizedTarget === 'coordinator') return true
  if (normalizedCreator === 'coordinator' && normalizedTarget === 'student') return true
  return false
}

export async function createManagedUser(input) {
  const db = await getDB()
  const creatorEmail = normalizeEmail(input.creatorEmail)
  const creatorRole = String(input.creatorRole || '').trim().toLowerCase()
  const role = String(input.role || '').trim().toLowerCase()
  const email = normalizeEmail(input.email)
  const name = String(input.name || '').trim()

  if (!name || !email || !role) {
    const err = new Error('Name, email, and role are required.')
    err.status = 400
    throw err
  }

  if (!canCreateRole(creatorRole, role)) {
    const err = new Error('You are not allowed to create this user role.')
    err.status = 403
    throw err
  }

  const creator = creatorEmail ? await db.collection('users').findOne({
    email: creatorEmail,
    role: creatorRole,
  }) : null

  const existing = await db.collection('users').findOne({ email })
  if (existing) {
    const err = new Error('This email is already registered.')
    err.status = 409
    throw err
  }

  const id = role === 'student' ? studentIdFromEmail(email) : randomUUID()
  const user = {
    id,
    name,
    email,
    password: '123456',
    role,
    department: String(input.department || creator.department || '').trim(),
    phone: String(input.phone || '').trim(),
    roll_no: String(input.roll_no || '').trim() || null,
    created_at: new Date().toISOString(),
  }

  await db.collection('users').insertOne(user)
  return sanitizeUser(user)
}

export async function changePassword({ email, currentPassword, newPassword }) {
  const db = await getDB()
  const normalizedEmail = normalizeEmail(email)
  const current = String(currentPassword || '')
  const next = String(newPassword || '')

  if (!normalizedEmail || !current || !next) {
    const err = new Error('Email, current password, and new password are required.')
    err.status = 400
    throw err
  }

  const user = await db.collection('users').findOne({ email: normalizedEmail, password: current })
  if (!user) {
    const err = new Error('Current password is incorrect.')
    err.status = 401
    throw err
  }

  await db.collection('users').updateOne(
    { email: normalizedEmail },
    { $set: { password: next } }
  )

  return sanitizeUser({ ...user, password: next })
}

export function getRedirectPath(role) {
  return `/${role}`
}
