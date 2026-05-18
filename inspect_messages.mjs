import { getDB } from './backend/mongoClient.js'

const db = await getDB()
const msgs = await db.collection('messages').find({}).sort({ created_at: -1 }).toArray()
console.log('messages count', msgs.length)
console.log(JSON.stringify(msgs.slice(0, 10), null, 2))
