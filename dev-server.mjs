import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import path from 'path'

const rootDir = path.dirname(fileURLToPath(import.meta.url))
const nodeCommand = process.execPath
let shuttingDown = false

function startProcess(label, command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: false,
    ...options,
  })

  child.on('exit', (code, signal) => {
    if (shuttingDown) return
    shuttingDown = true
    if (signal) {
      console.log(`[${label}] exited with signal ${signal}`)
    } else {
      console.log(`[${label}] exited with code ${code}`)
    }
    if (!backend.killed) backend.kill()
    if (!frontend.killed) frontend.kill()
    process.exit(code || 0)
  })

  return child
}

const backend = startProcess('backend', nodeCommand, [path.join(rootDir, 'backend', 'server.js')], {
  cwd: rootDir,
})

const frontend = startProcess('frontend', nodeCommand, [path.join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '0.0.0.0'], {
  cwd: rootDir,
})

function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  if (!backend.killed) backend.kill()
  if (!frontend.killed) frontend.kill()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)