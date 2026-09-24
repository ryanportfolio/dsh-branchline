/** Worker thread that owns one long-lived inspect.ps1 -Serve process. */
import { spawn } from 'node:child_process'
import { parentPort, workerData } from 'node:worker_threads'

const { exe, helper, port, signal } = workerData
const pending = []
let buffer = ''
let dead = false

function reply(message) {
  port.postMessage(message)
  Atomics.store(signal, 0, 1)
  Atomics.notify(signal, 0)
}

function fail() {
  if (dead) return
  dead = true
  for (const id of pending.splice(0)) reply({ id, fault: true })
  child.kill()
}

const child = spawn(exe, ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', helper, '-Serve'], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] })
child.on('error', fail)
child.on('exit', fail)
child.stdin.on('error', fail)
child.stdout.setEncoding('utf8')
child.stdout.on('data', (chunk) => {
  buffer += chunk
  for (let index; (index = buffer.indexOf('\n')) >= 0;) {
    const line = buffer.slice(0, index).trim()
    buffer = buffer.slice(index + 1)
    const id = pending.shift()
    if (id === undefined) return fail()
    reply({ id, line })
  }
})

parentPort.on('message', ({ id, line, close }) => {
  if (close) { fail(); parentPort.close(); return }
  if (dead) { reply({ id, fault: true }); return }
  pending.push(id)
  child.stdin.write(`${line}\n`)
})
