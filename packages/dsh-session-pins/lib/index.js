/** DeepSeek Harness Host plugin: pinned sessions (persisted pin list + JSON route). */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

export const name = 'dsh-session-pins'
export const inject = ['sessionQuery']

const ROUTE = '/api/dsh-session-pins'
const BODY_LIMIT_BYTES = 64 * 1024
const MAX_PINS = 200

const STORE_DIR = path.join(os.homedir(), '.dsh', 'storages')
const STORE_FILE = path.join(STORE_DIR, 'dsh-session-pins.json')

/** Serialized write chain: pin toggles from rapid clicks never interleave. */
let writeChain = Promise.resolve()

export function apply(ctx) {
  ctx.inject(['webServer'], (webCtx) => webCtx.effect(() => registerWeb(webCtx), 'dsh-session-pins.web'))
}

function registerWeb(ctx) {
  return ctx.webServer.register({
    kind: 'exact',
    path: ROUTE,
    async handler(request, response) {
      if (!isLoopbackSameOrigin(request)) {
        send(response, 403, { ok: false, error: { code: 'forbidden', message: 'loopback same-origin access is required' } })
        return
      }
      try {
        if (request.method !== 'POST') {
          send(response, 405, { ok: false, error: { code: 'method-not-allowed', message: 'POST is required' } })
          return
        }
        const body = await readBody(request)
        const op = requiredString(body, 'op')
        const value = await dispatch(ctx, op, body)
        send(response, 200, { ok: true, value })
      } catch (error) {
        send(response, 400, { ok: false, error: { code: 'invalid-input', message: errorMessage(error) } })
      }
    },
  })
}

async function dispatch(ctx, op, body) {
  if (op === 'list') return listPins(ctx)
  if (op === 'pin') return pinSession(requiredString(body, 'sessionId'))
  if (op === 'unpin') return unpinSession(requiredString(body, 'sessionId'))
  throw new Error(`unsupported operation: ${op}`)
}

/** List pins oldest-pin-first, dropping ids that no longer resolve to a session. */
async function listPins(ctx) {
  const pins = await readStore()
  let known = null
  try {
    const records = await ctx.sessionQuery.listSessions()
    known = new Set(records.map((r) => r.header.id))
  } catch (error) {
    known = null
  }
  const present = known === null ? pins : pins.filter((p) => known.has(p.sessionId))
  return { pins: present }
}

async function pinSession(sessionId) {
  await writeChain.then(async () => {
    const pins = await readStore()
    if (pins.some((p) => p.sessionId === sessionId)) return
    const next = [{ sessionId, pinnedAt: Date.now() }, ...pins].slice(0, MAX_PINS)
    await writeStore(next)
  })
  return { ok: true }
}

async function unpinSession(sessionId) {
  await writeChain.then(async () => {
    const pins = await readStore()
    if (!pins.some((p) => p.sessionId === sessionId)) return
    await writeStore(pins.filter((p) => p.sessionId !== sessionId))
  })
  return { ok: true }
}

function normalizePins(value) {
  if (!Array.isArray(value)) return []
  const seen = new Set()
  const pins = []
  for (const entry of value) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) continue
    if (typeof entry.sessionId !== 'string' || entry.sessionId === '') continue
    if (seen.has(entry.sessionId)) continue
    seen.add(entry.sessionId)
    pins.push({
      sessionId: entry.sessionId,
      pinnedAt: typeof entry.pinnedAt === 'number' && Number.isFinite(entry.pinnedAt) ? entry.pinnedAt : 0,
    })
  }
  return pins.slice(0, MAX_PINS)
}

async function readStore() {
  let raw
  try {
    raw = await readFile(STORE_FILE, 'utf8')
  } catch (error) {
    if (error && error.code === 'ENOENT') return []
    throw error
  }
  try {
    return normalizePins(JSON.parse(raw))
  } catch (error) {
    throw new Error(`pin store is not valid JSON: ${errorMessage(error)}`)
  }
}

async function writeStore(pins) {
  const atomic = async () => {
    await mkdir(STORE_DIR, { recursive: true })
    const tmp = STORE_FILE + '.tmp'
    await writeFile(tmp, JSON.stringify(pins, null, 2) + '\n', 'utf8')
    await rename(tmp, STORE_FILE)
  }
  const run = writeChain.then(atomic, atomic)
  writeChain = run.catch(() => {})
  await run
}

function errorMessage(error) {
  return error && typeof error.message === 'string' ? error.message : String(error)
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredString(input, key) {
  const value = input[key]
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${key} must be a non-empty string`)
  return value
}

async function readBody(request) {
  const contentType = request.headers['content-type']
  if (typeof contentType !== 'string' || !contentType.toLocaleLowerCase().startsWith('application/json')) {
    throw new Error('content-type must be application/json')
  }
  const chunks = []
  let size = 0
  for await (const raw of request) {
    const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw)
    size += chunk.length
    if (size > BODY_LIMIT_BYTES) throw new Error('request body exceeds 64 KiB')
    chunks.push(chunk)
  }
  let parsed
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch (error) {
    throw new Error(`request body is not valid JSON: ${errorMessage(error)}`)
  }
  if (!isRecord(parsed)) throw new Error('request body must be a JSON object')
  return parsed
}

function isLoopbackSameOrigin(request) {
  const address = request.socket.remoteAddress
  if (address !== '127.0.0.1' && address !== '::1' && address !== '::ffff:127.0.0.1') return false
  const host = request.headers.host
  if (typeof host !== 'string') return false
  let hostUrl
  try {
    hostUrl = new URL(`http://${host}`)
  } catch {
    return false
  }
  if (hostUrl.hostname !== 'localhost' && hostUrl.hostname !== '127.0.0.1' && hostUrl.hostname !== '[::1]') return false
  if (request.headers['sec-fetch-site'] === 'cross-site') return false
  const origin = request.headers.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === hostUrl.host
  } catch {
    return false
  }
}

function send(response, status, value) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  response.end(JSON.stringify(value))
}
