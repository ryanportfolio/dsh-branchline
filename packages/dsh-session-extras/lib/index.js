/** DeepSeek Harness Host plugin: session UI extras (model context, archived sessions). */

export const name = 'dsh-session-extras'
export const inject = ['sessionQuery', 'llm', 'workspaceRegistry']

const ROUTE = '/api/dsh-session-extras'
const BODY_LIMIT_BYTES = 256 * 1024

export function apply(ctx) {
  ctx.inject(['webServer'], (webCtx) => webCtx.effect(() => registerWeb(webCtx), 'dsh-session-extras.web'))
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
        if (request.method === 'POST') {
          const body = await readBody(request)
          const op = requiredString(body, 'op')
          const value = await dispatch(ctx, op, body)
          send(response, 200, { ok: true, value })
          return
        }
        if (request.method === 'GET') {
          const url = new URL(request.url ?? ROUTE, 'http://localhost')
          const op = url.searchParams.get('op') ?? ''
          if (op === 'context') {
            const value = await contextModel(ctx, url.searchParams.get('sessionId') ?? undefined)
            send(response, 200, { ok: true, value })
            return
          }
          send(response, 400, { ok: false, error: { code: 'invalid-input', message: `unsupported GET op: ${op}` } })
          return
        }
        send(response, 405, { ok: false, error: { code: 'method-not-allowed', message: 'GET or POST is required' } })
      } catch (error) {
        send(response, 400, { ok: false, error: { code: 'invalid-input', message: errorMessage(error) } })
      }
    },
  })
}

async function dispatch(ctx, op, body) {
  if (op === 'archived-list') return archivedList(ctx)
  if (op === 'archived-restore') return archivedRestore(ctx, requiredString(body, 'sessionId'))
  if (op === 'context') return contextModel(ctx, optionalString(body, 'sessionId'))
  throw new Error(`unsupported operation: ${op}`)
}

/** List archived sessions with titles and workspace names. */
async function archivedList(ctx) {
  const sessionQuery = ctx.sessionQuery
  const workspaceRegistry = ctx.workspaceRegistry
  const archivedIds = workspaceRegistry.archivedSessionIds || []
  const records = await sessionQuery.listSessions()
  const byId = new Map(records.map((r) => [r.header.id, r]))
  const present = archivedIds.filter((id) => byId.has(id))
  const titleResults = await sessionQuery.readTitleSnapshots(present)
  const titles = new Map()
  for (const res of titleResults) {
    if (res.status !== 'fulfilled') continue
    const display = titleString(res.value.title)
    if (display !== undefined) titles.set(res.value.session.id, display)
  }
  const workspaces = workspaceRegistry.list().map((w) => ({ path: w.path, title: w.title }))
  const sessions = present.map((id) => {
    const header = byId.get(id).header
    const cwd = header.cwd
    let workspaceName
    if (typeof cwd === 'string') {
      const match = workspaces.find((w) => cwd === w.path || cwd.startsWith(w.path + '/') || cwd.startsWith(w.path + '\\'))
      workspaceName = match ? match.title : basenameOf(cwd)
    }
    return {
      id,
      title: titles.get(id) || 'Untitled session',
      workspaceName,
      createdAt: header.createdAt,
    }
  })
  return { sessions }
}

/** Restore one archived session id (same write path as archive). */
async function archivedRestore(ctx, sessionId) {
  const workspaceRegistry = ctx.workspaceRegistry
  await workspaceRegistry.enqueueOperation(async () => {
    const state = workspaceRegistry.requireState()
    if (!state.archivedSessionIds.includes(sessionId)) return
    await workspaceRegistry.setState({
      ...state,
      archivedSessionIds: state.archivedSessionIds.filter((id) => id !== sessionId),
    })
  })
  return { ok: true }
}

/** Resolve the last request/context model for one session (in-flight or last). */
async function contextModel(ctx, sessionId) {
  if (typeof sessionId !== 'string' || sessionId === '') return { hasRun: false }
  const loaded = await ctx.sessionQuery.readSession(sessionId)
  let provider
  let model
  let contextWindow
  const events = loaded == null ? [] : loaded.events
  if (Array.isArray(events)) {
    for (const ev of events) {
      if (ev != null && ev.type === 'request/context' && ev.data != null) {
        if (typeof ev.data.provider === 'string' && typeof ev.data.model === 'string') {
          provider = ev.data.provider
          model = ev.data.model
          contextWindow = ev.data.contextWindow
        }
      }
    }
  }
  if (provider === undefined || model === undefined) return { hasRun: false }
  let name = provider + '/' + model
  let window = contextWindow
  let info = null
  try {
    info = await ctx.llm.resolveModelInfo(provider, model)
  } catch (error) {
    info = null
  }
  if (info != null && typeof info.name === 'string' && info.name !== '') name = info.name
  const w = info != null && info.context != null ? info.context.contextWindow : undefined
  if (typeof w === 'number' && Number.isInteger(w) && w > 0) window = w
  return { hasRun: true, provider, model, name, contextWindow: window }
}

function basenameOf(p) {
  if (typeof p !== 'string' || p.length === 0) return undefined
  const parts = p.split(/[\\/]+/).filter((x) => x.length > 0)
  return parts.length === 0 ? p : parts[parts.length - 1]
}

function titleString(snap) {
  if (typeof snap === 'string') return snap
  if (snap && typeof snap === 'object' && typeof snap.title === 'string') return snap.title
  return undefined
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

function optionalString(input, key) {
  const value = input[key]
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string') throw new Error(`${key} must be a string`)
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
    if (size > BODY_LIMIT_BYTES) throw new Error('request body exceeds 256 KiB')
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
