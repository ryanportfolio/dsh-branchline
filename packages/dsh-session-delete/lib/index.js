/** DeepSeek Harness Host plugin: permanent session deletion with worktree cleanup. */

import { readFile, realpath, rename, rm, rmdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'

export const name = 'dsh-session-delete'
export const inject = ['sessionQuery', 'sessionPersistence', 'workspaceRegistry', 'worktreeStudio']

const ROUTE = '/api/dsh-session-delete'
const BODY_LIMIT_BYTES = 256 * 1024
const SESSION_ID_PATTERN = /^session-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu
const PINS_FILE = join(homedir(), '.dsh', 'storages', 'dsh-session-pins.json')

export function apply(ctx) {
  ctx.inject(['webServer'], (webCtx) => webCtx.effect(() => registerWeb(webCtx), 'dsh-session-delete.web'))
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
        const sessionId = requiredSessionId(body)
        if (op === 'preview') {
          send(response, 200, { ok: true, value: await preview(ctx, sessionId) })
          return
        }
        if (op === 'delete') {
          const confirmation = requiredString(body, 'confirmation')
          const force = body.force === true
          send(response, 200, { ok: true, value: await deleteSession(ctx, sessionId, { confirmation, force }) })
          return
        }
        send(response, 400, { ok: false, error: { code: 'invalid-input', message: `unsupported operation: ${op}` } })
      } catch (error) {
        const status = error instanceof HttpError ? error.status : 400
        const code = error instanceof HttpError ? error.code : 'invalid-input'
        send(response, status, { ok: false, error: { code, message: errorMessage(error) } })
      }
    },
  })
}

class HttpError extends Error {
  constructor(code, message, status = 400) {
    super(message)
    this.code = code
    this.status = status
  }
}

/** Build the deletion preview for one session, including attached worktree state. */
async function preview(ctx, sessionId) {
  const record = await findSession(ctx, sessionId)
  if (record === undefined) throw new HttpError('session-not-found', `unknown session ${sessionId}`, 404)
  return await previewFromRecord(ctx, record)
}

async function previewFromRecord(ctx, record) {
  const header = record.header ?? {}
  const sessionId = header.id
  const cwd = typeof header.cwd === 'string' ? header.cwd : ''
  const summary = {
    sessionId,
    title: await readTitle(ctx, sessionId),
    cwd,
    createdAt: header.createdAt,
    live: isLive(ctx, sessionId),
    worktree: null,
  }
  if (cwd !== '') {
    const view = await resolveWorktree(ctx, cwd)
    if (view !== null) {
      const otherSessions = await countOtherSessions(ctx, view.path, sessionId)
      summary.worktree = {
        taskId: String(view.id),
        title: view.title,
        path: view.path,
        branch: view.branch,
        repository: view.repository,
        exists: view.exists,
        dirty: view.changes.dirty,
        staged: view.changes.staged,
        unstaged: view.changes.unstaged,
        untracked: view.changes.untracked,
        commitsAhead: view.changes.commitsAhead,
        otherSessions,
        forceAllowed: otherSessions === 0,
        blockers: worktreeBlockers(view, otherSessions),
      }
    }
  }
  return summary
}

/** Permanently delete one session: worktree, registry state, log, and sidecars. */
async function deleteSession(ctx, sessionId, { confirmation, force }) {
  if (confirmation !== sessionId) {
    throw new HttpError('invalid-input', 'confirmation must equal the session id')
  }
  const record = await findSession(ctx, sessionId)
  if (record === undefined) throw new HttpError('session-not-found', `unknown session ${sessionId}`, 404)
  const summary = await previewFromRecord(ctx, record)
  if (summary.live) {
    throw new HttpError('session-live', 'stop the session before deleting it; live sessions cannot be deleted', 409)
  }
  const logTarget = locateSessionLog(ctx, record)
  let purge = null
  if (summary.worktree !== null) {
    const blockers = summary.worktree.blockers
    if (summary.worktree.otherSessions > 0) {
      throw new HttpError('worktree-blocked', 'delete the other sessions using this worktree before removing it', 409)
    }
    if (blockers.length > 0 && force !== true) {
      throw new HttpError('worktree-blocked', `worktree removal is blocked: ${blockers.join('; ')}`, 409)
    }
    purge = await ctx.worktreeStudio.purge(summary.worktree.taskId)
  }
  const log = await removeSessionLog(logTarget)
  const registry = await unarchiveEverywhere(ctx, sessionId)
  const accounting = await unaccountSession(ctx, sessionId)
  const sidecars = await pruneSidecars(sessionId)
  return { sessionId, title: summary.title, worktree: purge, log, registry, accounting, sidecars }
}

async function findSession(ctx, sessionId) {
  const records = await ctx.sessionQuery.listSessions()
  return records.find((record) => record?.header?.id === sessionId)
}

function isLive(ctx, sessionId) {
  const sessions = typeof ctx.get === 'function' ? ctx.get('sessions') : undefined
  if (sessions !== undefined && sessions !== null && typeof sessions.get === 'function' && sessions.get(sessionId) !== undefined) {
    return true
  }
  const agents = typeof ctx.get === 'function' ? ctx.get('agents') : undefined
  if (agents !== undefined && agents !== null && typeof agents.get === 'function' && agents.get(sessionId) !== undefined) {
    return true
  }
  return false
}

async function readTitle(ctx, sessionId) {
  try {
    const results = await ctx.sessionQuery.readTitleSnapshots([sessionId])
    const first = results[0]
    if (first === undefined || first.status !== 'fulfilled') return undefined
    return unwrapTitle(first.value?.title)
  } catch {
    return undefined
  }
}

function unwrapTitle(value) {
  if (typeof value === 'string' && value.trim() !== '') return value
  if (value !== null && typeof value === 'object' && typeof value.title === 'string' && value.title.trim() !== '') {
    return value.title
  }
  return undefined
}

/** Find the branchline task whose worktree owns the session's cwd, when one exists. */
async function resolveWorktree(ctx, cwd) {
  const canonical = await canonicalize(cwd)
  const dashboard = await ctx.worktreeStudio.dashboard()
  for (const view of dashboard.tasks) {
    const key = await canonicalize(view.path)
    if (key === canonical || canonical.startsWith(key + separator())) return view
  }
  return null
}

async function countOtherSessions(ctx, worktreePath, exceptSessionId) {
  const key = canonicalKey(worktreePath)
  const prefix = key + separator()
  const records = await ctx.sessionQuery.listSessions()
  let count = 0
  for (const record of records) {
    if (record?.header?.id === exceptSessionId) continue
    const cwd = typeof record?.header?.cwd === 'string' ? record.header.cwd : ''
    if (cwd === '') continue
    let canonical
    try {
      canonical = await canonicalize(cwd)
    } catch {
      continue
    }
    if (canonical === key || canonical.startsWith(prefix)) count += 1
  }
  return count
}

function worktreeBlockers(view, otherSessions) {
  const blockers = []
  if (view.changes.dirty) blockers.push('worktree has uncommitted changes')
  if (view.changes.commitsAhead > 0) {
    blockers.push(`branch has ${view.changes.commitsAhead} commit(s) not in the base ref`)
  }
  if (otherSessions > 0) blockers.push(`${otherSessions} other session(s) still use this worktree`)
  return blockers
}

/** Resolve and validate the durable log directory before any destructive worktree action. */
function locateSessionLog(ctx, record) {
  let location
  try {
    location = ctx.sessionPersistence.locate(record.header)
  } catch (error) {
    throw new HttpError('log-removal-failed', `cannot locate the session artifact: ${errorMessage(error)}`, 500)
  }
  if (location === undefined || location === null || typeof location.path !== 'string' || location.path === '') {
    return null
  }
  const sessionId = record?.header?.id
  const sessionsRoot = resolve(dshHome(), 'sessions')
  const dir = resolve(dirname(location.path))
  const rel = relative(sessionsRoot, dir)
  const outsideRoot = rel === '' || rel === '..' || rel.startsWith(`..${separator()}`) || isAbsolute(rel)
  if (typeof sessionId !== 'string' || basename(dir) !== sessionId || outsideRoot) {
    throw new HttpError('log-removal-failed', `session artifact layout is unexpected: ${location.path}`, 500)
  }
  return dir
}

/** Delete the validated session log directory. */
async function removeSessionLog(dir) {
  if (dir === null) return { removed: false, reason: 'no-artifact' }
  try {
    await rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  } catch (error) {
    throw new HttpError('log-removal-failed', `could not delete the session log directory: ${errorMessage(error)}`, 500)
  }
  await rmdir(dirname(dir)).catch(() => undefined)
  return { removed: true, path: dir }
}

/** Remove the session from the registry-global archive set when present. */
async function unarchiveEverywhere(ctx, sessionId) {
  const registry = ctx.workspaceRegistry
  if (typeof registry.enqueueOperation !== 'function' || typeof registry.requireState !== 'function' || typeof registry.setState !== 'function') {
    return { unarchived: false }
  }
  let unarchived = false
  await registry.enqueueOperation(async () => {
    const state = registry.requireState()
    if (!Array.isArray(state.archivedSessionIds) || !state.archivedSessionIds.includes(sessionId)) return
    await registry.setState({
      ...state,
      archivedSessionIds: state.archivedSessionIds.filter((id) => id !== sessionId),
    })
    unarchived = true
  })
  return { unarchived }
}

/** Best-effort removal of the session's workspace accounting slots. */
async function unaccountSession(ctx, sessionId) {
  try {
    const domain = ctx.storageDomain?.get?.('workspace')
    if (domain === undefined || domain === null) return { updated: 0 }
    const table = domain.table('workspaces')
    let updated = 0
    for (const [id, record] of [...table.entries()]) {
      if (!Array.isArray(record?.sessionIds) || !record.sessionIds.includes(sessionId)) continue
      await table.put(id, {
        ...record,
        sessionIds: record.sessionIds.filter((sid) => sid !== sessionId),
        updatedAt: new Date().toISOString(),
      })
      updated += 1
    }
    return { updated }
  } catch {
    return { updated: 0 }
  }
}

/** Prune session-keyed sidecar stores; each failure is reported, never fatal. */
async function pruneSidecars(sessionId) {
  const results = {}
  const storages = join(dshHome(), 'storages')
  for (const name of ['session_projcache.json', 'message_feedback.json']) {
    results[name] = await pruneTableSessions(join(storages, name), sessionId)
  }
  // The pins plugin resolves its store from os.homedir() alone (it ignores DSH_HOME),
  // so pruning must target the same path that plugin actually writes.
  results['dsh-session-pins.json'] = await prunePins(PINS_FILE, sessionId)
  return results
}

async function pruneTableSessions(filename, sessionId) {
  try {
    const parsed = await readJson(filename)
    if (parsed === undefined) return { pruned: 0 }
    const sessions = parsed?.tables?.sessions
    if (sessions === null || typeof sessions !== 'object' || !Object.hasOwn(sessions, sessionId)) {
      return { pruned: 0 }
    }
    delete sessions[sessionId]
    await writeJsonAtomic(filename, parsed)
    return { pruned: 1 }
  } catch (error) {
    return { pruned: 0, error: errorMessage(error) }
  }
}

async function prunePins(filename, sessionId) {
  try {
    const parsed = await readJson(filename)
    if (!Array.isArray(parsed)) return { pruned: 0 }
    const next = parsed.filter((entry) => entry?.sessionId !== sessionId)
    if (next.length === parsed.length) return { pruned: 0 }
    await writeJsonAtomic(filename, next)
    return { pruned: parsed.length - next.length }
  } catch (error) {
    return { pruned: 0, error: errorMessage(error) }
  }
}

async function readJson(filename) {
  const text = await readFile(filename, 'utf8')
  return JSON.parse(text)
}

async function writeJsonAtomic(filename, value) {
  const temporary = `${filename}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await rename(temporary, filename)
}

function dshHome() {
  return resolve(process.env.DSH_HOME?.trim() || join(homedir(), '.dsh'))
}

async function canonicalize(path) {
  try {
    return canonicalKey(await realpath(path))
  } catch {
    return canonicalKey(path)
  }
}

function canonicalKey(path) {
  const absolute = resolve(path)
  return process.platform === 'win32' ? absolute.toLowerCase() : absolute
}

function separator() {
  return process.platform === 'win32' ? '\\' : '/'
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

/** Read one bounded JSON object from the request. */
async function readBody(request) {
  const contentType = request.headers['content-type']
  if (typeof contentType !== 'string' || !contentType.toLocaleLowerCase().startsWith('application/json')) {
    throw new HttpError('invalid-input', 'content-type must be application/json')
  }
  const chunks = []
  let size = 0
  for await (const raw of request) {
    const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw)
    size += chunk.length
    if (size > BODY_LIMIT_BYTES) throw new HttpError('invalid-input', 'request body exceeds 256 KiB')
    chunks.push(chunk)
  }
  let parsed
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch (error) {
    throw new HttpError('invalid-input', `request body is not valid JSON: ${errorMessage(error)}`)
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new HttpError('invalid-input', 'request body must be a JSON object')
  }
  return parsed
}

/** Keep privileged deletion local even when the Web server binds widely. */
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

function requiredString(body, key) {
  const value = body[key]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new HttpError('invalid-input', `${key} must be a non-empty string`)
  }
  return value
}

function requiredSessionId(body) {
  const value = requiredString(body, 'sessionId')
  if (!SESSION_ID_PATTERN.test(value)) {
    throw new HttpError('invalid-input', 'sessionId is not a valid session id')
  }
  return value
}
