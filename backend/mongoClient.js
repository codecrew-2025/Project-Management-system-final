import dotenv from 'dotenv'
import { MongoClient } from 'mongodb'
import { readFile, writeFile } from 'fs/promises'
import { fileURLToPath } from 'url'
import path from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.resolve(__dirname, '..', '.env') })

const usersFile = path.join(__dirname, 'data', 'users.json')
const graphStoreFile = path.join(__dirname, 'data', 'coordinatorGraphStore.json')

const uri = process.env.MONGODB_URI
const mongoClient = uri ? new MongoClient(uri) : null
let db = null

const seedUsers = [
  { id: '11111111-1111-1111-1111-111111111111', name: 'Dr. Rajesh Mehta', email: 'director@pf.com', password: 'Admin@123', role: 'director', department: 'Administration', phone: '9000000001' },
  { id: '22222222-2222-2222-2222-222222222222', name: 'Dr. Priya Sharma', email: 'coord@pf.com', password: 'Coord@123', role: 'coordinator', department: 'Computer Science', phone: '9000000002' },
  { id: '33333333-3333-3333-3333-333333333333', name: 'Aanya Singh', email: 'student@pf.com', password: 'Student@123', role: 'student', department: 'Computer Science', phone: '9000000003' },
]

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : []
}

function matchesCondition(fieldValue, condition) {
  if (isObject(condition)) {
    if (Array.isArray(condition.$in)) {
      return condition.$in.some((allowed) => fieldValue === allowed)
    }

    if (Object.prototype.hasOwnProperty.call(condition, '$regex')) {
      const flags = String(condition.$options || '')
      const regex = new RegExp(String(condition.$regex), flags)
      return regex.test(String(fieldValue || ''))
    }

    return fieldValue === condition
  }

  return fieldValue === condition
}

function matchesQuery(doc, query = {}) {
  if (!isObject(query) || Object.keys(query).length === 0) return true

  for (const [key, condition] of Object.entries(query)) {
    if (key === '$or') {
      if (!Array.isArray(condition) || !condition.some((part) => matchesQuery(doc, part))) {
        return false
      }
      continue
    }

    if (!matchesCondition(doc?.[key], condition)) {
      return false
    }
  }

  return true
}

function applyUpdate(target, update = {}, { isInsert = false } = {}) {
  if (isObject(update.$set)) {
    Object.assign(target, update.$set)
  }

  if (isInsert && isObject(update.$setOnInsert)) {
    for (const [key, value] of Object.entries(update.$setOnInsert)) {
      if (!Object.prototype.hasOwnProperty.call(target, key)) {
        target[key] = value
      }
    }
  }
}

function sortRows(rows, sortSpec = {}) {
  const entries = Object.entries(sortSpec)
  if (entries.length === 0) return rows

  return rows.sort((a, b) => {
    for (const [field, direction] of entries) {
      const av = a?.[field]
      const bv = b?.[field]

      if (av === bv) continue
      if (av == null) return direction >= 0 ? -1 : 1
      if (bv == null) return direction >= 0 ? 1 : -1

      if (av < bv) return direction >= 0 ? -1 : 1
      if (av > bv) return direction >= 0 ? 1 : -1
    }
    return 0
  })
}

class LocalCursor {
  constructor(rows) {
    this.rows = rows
  }

  sort(sortSpec) {
    this.rows = sortRows(this.rows, sortSpec)
    return this
  }

  async toArray() {
    return clone(this.rows)
  }
}

class LocalCollection {
  constructor(name, state, persist) {
    this.name = name
    this.state = state
    this.persist = persist
  }

  list() {
    if (!Array.isArray(this.state[this.name])) this.state[this.name] = []
    return this.state[this.name]
  }

  async createIndex() {
    return 'local-index-noop'
  }

  find(query = {}) {
    const rows = this.list().filter((row) => matchesQuery(row, query))
    return new LocalCursor(rows)
  }

  async findOne(query = {}) {
    const row = this.list().find((item) => matchesQuery(item, query))
    return row ? clone(row) : null
  }

  async insertOne(doc) {
    this.list().push(clone(doc))
    await this.persist()
    return { acknowledged: true, insertedId: doc?.id || null }
  }

  async insertMany(docs = []) {
    for (const doc of docs) this.list().push(clone(doc))
    await this.persist()
    return { acknowledged: true, insertedCount: docs.length }
  }

  async countDocuments(query = {}) {
    return this.list().filter((row) => matchesQuery(row, query)).length
  }

  async updateOne(filter = {}, update = {}, options = {}) {
    const rows = this.list()
    const index = rows.findIndex((row) => matchesQuery(row, filter))

    if (index === -1) {
      if (!options?.upsert) return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0 }

      const upsertDoc = {}
      for (const [key, value] of Object.entries(filter)) {
        if (!key.startsWith('$') && !isObject(value)) upsertDoc[key] = value
      }

      applyUpdate(upsertDoc, update, { isInsert: true })
      rows.push(upsertDoc)
      await this.persist()
      return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 1 }
    }

    applyUpdate(rows[index], update, { isInsert: false })
    await this.persist()
    return { acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedCount: 0 }
  }

  async findOneAndUpdate(filter = {}, update = {}, options = {}) {
    const rows = this.list()
    const index = rows.findIndex((row) => matchesQuery(row, filter))
    if (index === -1) return { value: null }

    applyUpdate(rows[index], update, { isInsert: false })
    await this.persist()

    const after = options?.returnDocument === 'after'
    return { value: after ? clone(rows[index]) : null }
  }
}

class LocalDb {
  constructor(state, persist) {
    this.state = state
    this.persist = persist
  }

  collection(name) {
    return new LocalCollection(name, this.state, this.persist)
  }
}

async function readJson(filePath, fallback) {
  try {
    const raw = await readFile(filePath, 'utf8')
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

async function createLocalDb() {
  const users = await readJson(usersFile, [])
  const graph = await readJson(graphStoreFile, {})

  const state = {
    users: normalizeArray(users),
    projects: normalizeArray(graph?.projects),
    modules: normalizeArray(graph?.modules),
    tasks: normalizeArray(graph?.tasks),
    project_students: normalizeArray(graph?.project_students || graph?.projectStudents),
    submissions: normalizeArray(graph?.submissions),
    meetings: normalizeArray(graph?.meetings),
    messages: normalizeArray(graph?.messages),
  }

  if (state.users.length === 0) {
    state.users = clone(seedUsers)
  }

  const persist = async () => {
    await writeFile(usersFile, `${JSON.stringify(state.users, null, 2)}\n`, 'utf8')

    const graphPayload = {
      projects: state.projects,
      modules: state.modules,
      tasks: state.tasks,
      projectStudents: state.project_students,
      submissions: state.submissions,
      meetings: state.meetings,
      messages: state.messages,
    }

    await writeFile(graphStoreFile, `${JSON.stringify(graphPayload, null, 2)}\n`, 'utf8')
  }

  return new LocalDb(state, persist)
}

async function createMongoDb() {
  await mongoClient.connect()
  const mongoDb = mongoClient.db()
  console.log('MongoDB connected:', mongoDb.databaseName)

  await mongoDb.collection('users').createIndex({ email: 1 }, { unique: true })
  await mongoDb.collection('projects').createIndex({ coordinator_id: 1 })
  await mongoDb.collection('projects').createIndex({ coordinator_email: 1 })
  await mongoDb.collection('tasks').createIndex({ project_id: 1 })
  await mongoDb.collection('submissions').createIndex({ project_id: 1 })
  await mongoDb.collection('messages').createIndex({ student_id: 1 })

  const count = await mongoDb.collection('users').countDocuments()
  if (count === 0) {
    await mongoDb.collection('users').insertMany(seedUsers)
  }

  return mongoDb
}

export async function connectDB() {
  if (db) return db

  if (mongoClient) {
    try {
      db = await createMongoDb()
      return db
    } catch (error) {
      console.warn(`MongoDB unavailable, falling back to local JSON store: ${error.message}`)
    }
  } else {
    console.warn('MONGODB_URI not set, using local JSON store.')
  }

  db = await createLocalDb()
  return db
}

export async function getDB() {
  if (!db) await connectDB()
  return db
}
