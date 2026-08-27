/** DeepSeek Harness Host plugin: OpenRouter model-list sync.

Keeps the `openrouter` route's model list in the `llm-pi-ai` user-settings
section current. OpenRouter's models are served to the model picker from that
list, so refreshing it is what makes new releases appear and keeps the picker
sorted newest-first by release date. The pi-ai catalog is static at install
time; this plugin pulls the live endpoint instead.

Refresh replaces the configured `models` list with the live snapshot sorted by
`created` (newest first), then appends any configured ids the live endpoint no
longer lists (pseudo-models like openrouter/auto, or a model the user added by
hand) so a refresh never deletes an id the user curated. A daily timer runs the
same refresh; a manual button on the client calls the same path over HTTP.
*/

import { readFile, writeFile, mkdir } from "node:fs/promises"
import { join, dirname } from "node:path"
import { homedir } from "node:os"

export const name = "dsh-openrouter-sync"
export const inject = ["settings", "timer"]

const ROUTE = "/api/dsh-openrouter-sync"
const BODY_LIMIT_BYTES = 256 * 1024
const ENDPOINT = "https://openrouter.ai/api/v1/models"
const NAMESPACE = "llm-pi-ai"
const PROVIDER = "openrouter"
/** Check cadence for the auto-refresh timer. */
const AUTO_CHECK_MS = 6 * 60 * 60 * 1000
/** A refresh is due when the last successful one is older than this. */
const STALE_AFTER_MS = 24 * 60 * 60 * 1000
/** First auto-check delay after boot. */
const FIRST_CHECK_DELAY_MS = 30 * 1000
/** Request timeout for the live fetch. */
const FETCH_TIMEOUT_MS = 30 * 1000
/** Refuse a listing larger than this (bytes read, not declared). */
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024
/** Hard cap on live entries kept, newest first, to bound the settings document. */
const MAX_LIVE_MODELS = 800

let inFlight = null

function dshHomeDir() {
  return process.env.DSH_HOME && process.env.DSH_HOME.length > 0
    ? process.env.DSH_HOME
    : join(homedir(), ".dsh")
}

function statePath() {
  return join(dshHomeDir(), "openrouter-sync.json")
}

async function readState() {
  try {
    const raw = await readFile(statePath(), "utf8")
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === "object") return parsed
    return {}
  } catch {
    return {}
  }
}

async function writeState(state) {
  try {
    await mkdir(dirname(statePath()), { recursive: true })
    await writeFile(statePath(), JSON.stringify(state, null, 2), "utf8")
  } catch (error) {
    // State persistence is best-effort; a failed write must not fail a refresh.
    console.error("dsh-openrouter-sync: state write failed", error)
  }
}

/** The `providers.openrouter` route as currently stored in the user section, or undefined. */
function storedRoute(ctx) {
  const document = ctx.settings && ctx.settings.document ? ctx.settings.document : {}
  const section = document[NAMESPACE]
  if (!section || typeof section !== "object") return undefined
  const providers = section.providers
  if (!providers || typeof providers !== "object") return undefined
  const route = providers[PROVIDER]
  return route && typeof route === "object" ? route : undefined
}

function configuredModels(route) {
  if (!route) return []
  const models = route.models
  return Array.isArray(models) ? models : []
}

function isPosInt(value) {
  return typeof value === "number" && Number.isInteger(value) && value > 0
}

/**
 * Map one live OpenRouter listing entry to the harness model-entry shape.
 * Only fields the `llm-pi-ai` route schema accepts are carried.
 */
function mapEntry(raw) {
  const id = typeof raw.id === "string" && raw.id.length > 0 ? raw.id : undefined
  if (id === undefined) return undefined
  const name = typeof raw.name === "string" && raw.name.length > 0 ? raw.name : id
  const contextWindow = isPosInt(raw.context_length) ? raw.context_length : undefined
  const top = raw.top_provider && typeof raw.top_provider === "object" ? raw.top_provider : undefined
  const maxTokens = top && isPosInt(top.max_completion_tokens) ? top.max_completion_tokens : undefined
  return {
    id,
    ...(name !== id ? { name } : {}),
    ...(contextWindow === undefined ? {} : { contextWindow }),
    ...(maxTokens === undefined ? {} : { maxTokens }),
  }
}

/**
 * Sort live entries newest-first by release timestamp, then merge the
 * configured entries the live list no longer describes (kept in their current
 * order, fields untouched) so a refresh never drops a hand-curated id.
 */
function buildModelEntries(live, configured) {
  const byId = new Map()
  for (const raw of live) {
    const entry = mapEntry(raw)
    if (entry !== undefined && !byId.has(entry.id)) {
      byId.set(entry.id, { entry, created: typeof raw.created === "number" ? raw.created : 0 })
    }
  }
  const sorted = [...byId.values()]
    .sort((a, b) => (b.created - a.created) || a.entry.id.localeCompare(b.entry.id))
    .map((item) => item.entry)
  const capped = sorted.slice(0, MAX_LIVE_MODELS)
  const liveIds = new Set(capped.map((entry) => entry.id))
  const extras = configured.filter((entry) => entry && typeof entry.id === "string" && !liveIds.has(entry.id))
  return [...capped, ...extras]
}
export { buildModelEntries }

/** OpenRouter's `pricing` is per-token USD; report dollars per 1M tokens. */
function dollarsPerMillion(value) {
  const perToken = typeof value === "string" ? Number.parseFloat(value) : typeof value === "number" ? value : NaN
  if (!Number.isFinite(perToken) || perToken < 0) return undefined
  return Math.round(perToken * 1_000_000 * 10000) / 10000
}

/**
 * Per-model input/output cost in dollars per 1M tokens, keyed by model id.
 * Models with no usable pricing are omitted.
 */
export function costsOf(live) {
  const costs = {}
  for (const raw of live) {
    if (typeof raw.id !== "string" || raw.id.length === 0) continue
    const pricing = raw.pricing && typeof raw.pricing === "object" ? raw.pricing : undefined
    if (pricing === undefined) continue
    const input = dollarsPerMillion(pricing.prompt)
    const output = dollarsPerMillion(pricing.completion)
    if (input === undefined && output === undefined) continue
    costs[raw.id] = {
      ...(input === undefined ? {} : { input }),
      ...(output === undefined ? {} : { output }),
    }
  }
  return costs
}

/**
 * Per-model context window (tokens), keyed by model id. Models without a
 * usable declared context are omitted.
 */
export function contextsOf(live) {
  const contexts = {}
  for (const raw of live) {
    if (typeof raw.id !== "string" || raw.id.length === 0) continue
    if (typeof raw.context_length === "number" && Number.isInteger(raw.context_length) && raw.context_length > 0) {
      contexts[raw.id] = raw.context_length
    }
  }
  return contexts
}

function normalizeCosts(value) {
  if (!isRecord(value)) return {}
  const costs = {}
  for (const [id, raw] of Object.entries(value)) {
    if (id.length === 0 || !isRecord(raw)) continue
    const input = typeof raw.input === "number" && Number.isFinite(raw.input) && raw.input >= 0 ? raw.input : undefined
    const output = typeof raw.output === "number" && Number.isFinite(raw.output) && raw.output >= 0 ? raw.output : undefined
    if (input === undefined && output === undefined) continue
    costs[id] = {
      ...(input === undefined ? {} : { input }),
      ...(output === undefined ? {} : { output }),
    }
  }
  return costs
}

function normalizeContexts(value) {
  if (!isRecord(value)) return {}
  const contexts = {}
  for (const [id, contextWindow] of Object.entries(value)) {
    if (id.length > 0 && isPosInt(contextWindow)) contexts[id] = contextWindow
  }
  return contexts
}

function configuredContexts(ctx) {
  const contexts = {}
  for (const model of configuredModels(storedRoute(ctx))) {
    if (!isRecord(model) || typeof model.id !== "string" || model.id.length === 0) continue
    if (isPosInt(model.contextWindow)) contexts[model.id] = model.contextWindow
  }
  return contexts
}

/** Validated cached metadata, with configured OpenRouter contexts as fallback. */
export function modelMetadataOf(ctx, state) {
  return {
    costs: normalizeCosts(state.costs),
    contexts: { ...configuredContexts(ctx), ...normalizeContexts(state.contexts) },
    at: typeof state.costsAt === "string" ? state.costsAt : null,
  }
}

/**
 * Fetch the live list purely to refresh the cached cost and context tables,
 * without touching the configured model list or settings document.
 */
export async function fetchLiveCosts(ctx) {
  const signal = timeoutSignal()
  const live = await fetchLive(signal)
  const costs = costsOf(live)
  const contexts = contextsOf(live)
  const state = await readState()
  const at = new Date().toISOString()
  await writeState({ ...state, costs, contexts, costsAt: at })
  return { costs, contexts, at }
}

function fetchLiveModels(signal) {
  return fetch(ENDPOINT, {
    method: "GET",
    headers: {
      accept: "application/json",
      "user-agent": "dsh-openrouter-sync/0.1",
    },
    ...(signal === undefined ? {} : { signal }),
  })
}

async function readBounded(response) {
  if (!response.ok) {
    throw new Error(`OpenRouter answered ${response.status}${response.status === 401 || response.status === 403 ? "; check the API key" : ""}`)
  }
  const declared = Number(response.headers.get("content-length") ?? NaN)
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    throw new Error(`OpenRouter listing exceeds ${MAX_RESPONSE_BYTES} bytes`)
  }
  if (response.body === null) return ""
  const reader = response.body.getReader()
  const chunks = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_RESPONSE_BYTES) throw new Error(`OpenRouter listing exceeds ${MAX_RESPONSE_BYTES} bytes`)
    chunks.push(value)
  }
  await reader.cancel().catch(() => {})
  const body = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(body)
}

/** Pull the live OpenRouter model list (id, name, context, maxTokens). */
export async function fetchLive(signal) {
  const response = await fetchLiveModels(signal)
  const text = await readBounded(response)
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error("OpenRouter did not answer with JSON")
  }
  const data = parsed && Array.isArray(parsed.data) ? parsed.data : []
  return data
}

function timeoutSignal() {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(FETCH_TIMEOUT_MS)
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  timer.unref?.()
  return controller.signal
}

/**
 * Run one refresh: fetch live, merge with configured extras, and write the
 * sorted list back into the `llm-pi-ai` user section.
 * @returns a report of what changed.
 */
export async function refreshOpenRouter(ctx) {
  if (inFlight !== null) return inFlight
  inFlight = (async () => {
    const route = storedRoute(ctx)
    if (route === undefined) {
      return { ok: false, reason: "no-route", message: `settings.yaml has no "${PROVIDER}" route under "${NAMESPACE}.providers"; nothing to refresh` }
    }
    const settings = ctx.settings
    if (settings && settings.writable === false) {
      return { ok: false, reason: "read-only", message: "the settings document is read-only in this session" }
    }
    const before = configuredModels(route)
    const signal = timeoutSignal()
    const live = await fetchLive(signal)
    const next = buildModelEntries(live, before)
    const costs = costsOf(live)
    const contexts = contextsOf(live)
    const beforeIds = new Set(before.map((entry) => entry.id).filter((id) => typeof id === "string"))
    const nextIds = new Set(next.map((entry) => entry.id).filter((id) => typeof id === "string"))
    const added = nextIds.size - beforeIds.size
    const removed = [...beforeIds].filter((id) => !nextIds.has(id)).length
    const unchanged = JSON.stringify(next) === JSON.stringify(before)
    const at = new Date().toISOString()
    if (!unchanged && settings) {
      await settings.update(NAMESPACE, { providers: { [PROVIDER]: { models: next } } })
    }
    const state = await readState()
    await writeState({ ...state, lastRunAt: at, lastRunCount: next.length, lastAdded: added, lastRemoved: removed, costs, contexts, costsAt: at })
    return {
      ok: true,
      updated: !unchanged,
      count: next.length,
      added,
      removed,
      at,
    }
  })().finally(() => {
    inFlight = null
  })
  return inFlight
}

async function maybeAutoRefresh(ctx) {
  const state = await readState()
  if (state.auto === false) return
  if (typeof state.lastRunAt === "string") {
    const age = Date.now() - new Date(state.lastRunAt).getTime()
    if (Number.isFinite(age) && age >= 0 && age < STALE_AFTER_MS) return
  }
  try {
    const result = await refreshOpenRouter(ctx)
    if (!result.ok) {
      ctx.logger.warn("dsh-openrouter-sync: auto-refresh skipped: %s", result.message)
    } else if (result.updated) {
      ctx.logger.info("dsh-openrouter-sync: refreshed %d OpenRouter models (%d new)", result.count, Math.max(0, result.added))
    }
  } catch (error) {
    ctx.logger.warn("dsh-openrouter-sync: auto-refresh failed: %s", errorMessage(error))
  }
}
export { maybeAutoRefresh }

async function statusOf(ctx) {
  const state = await readState()
  const route = storedRoute(ctx)
  const models = configuredModels(route)
  const lastRunAt = typeof state.lastRunAt === "string" ? state.lastRunAt : null
  let nextRunAt = null
  if (lastRunAt !== null && state.auto !== false) {
    const next = new Date(lastRunAt).getTime() + STALE_AFTER_MS
    if (Number.isFinite(next)) nextRunAt = new Date(next).toISOString()
  }
  return {
    routeConfigured: route !== undefined,
    modelsConfigured: models.length,
    auto: state.auto !== false,
    lastRunAt,
    lastRunCount: typeof state.lastRunCount === "number" ? state.lastRunCount : null,
    lastAdded: typeof state.lastAdded === "number" ? state.lastAdded : null,
    lastRemoved: typeof state.lastRemoved === "number" ? state.lastRemoved : null,
    nextRunAt,
  }
}
export { statusOf }

// ---------------------------------------------------------------------------
// HTTP route (loopback same-origin only).
// ---------------------------------------------------------------------------

export function apply(ctx) {
  ctx.inject(["webServer"], (webCtx) => webCtx.effect(() => registerWeb(webCtx), "dsh-openrouter-sync.web"))
  // Auto-refresh: one check shortly after boot, then on the cadence.
  ctx.timer.timeout(() => {
    maybeAutoRefresh(ctx).catch((error) => ctx.logger.warn("dsh-openrouter-sync: first auto-refresh failed: %s", errorMessage(error)))
  }, FIRST_CHECK_DELAY_MS)
  ctx.timer.interval(() => {
    maybeAutoRefresh(ctx).catch((error) => ctx.logger.warn("dsh-openrouter-sync: auto-refresh failed: %s", errorMessage(error)))
  }, AUTO_CHECK_MS)
}

function registerWeb(ctx) {
  return ctx.webServer.register({
    kind: "exact",
    path: ROUTE,
    async handler(request, response) {
      if (!isLoopbackSameOrigin(request)) {
        send(response, 403, { ok: false, error: { code: "forbidden", message: "loopback same-origin access is required" } })
        return
      }
      try {
        if (request.method === "POST") {
          const body = await readBody(request)
          const op = requiredString(body, "op")
          if (op === "refresh") {
            const result = await refreshOpenRouter(ctx)
            if (!result.ok) {
              send(response, 400, { ok: false, error: { code: result.reason ?? "refresh-failed", message: result.message } })
              return
            }
            send(response, 200, { ok: true, value: result })
            return
          }
          if (op === "set-auto") {
            const enabled = body.enabled
            if (typeof enabled !== "boolean") {
              send(response, 400, { ok: false, error: { code: "invalid-input", message: "enabled must be a boolean" } })
              return
            }
            const state = await readState()
            await writeState({ ...state, auto: enabled })
            send(response, 200, { ok: true, value: { auto: enabled } })
            return
          }
          send(response, 400, { ok: false, error: { code: "invalid-input", message: `unsupported op: ${op}` } })
          return
        }
        if (request.method === "GET") {
          const url = new URL(request.url ?? ROUTE, "http://localhost")
          const op = url.searchParams.get("op") ?? ""
          if (op === "status") {
            send(response, 200, { ok: true, value: await statusOf(ctx) })
            return
          }
          if (op === "costs") {
            const state = await readState()
            send(response, 200, { ok: true, value: modelMetadataOf(ctx, state) })
            return
          }
          send(response, 400, { ok: false, error: { code: "invalid-input", message: `unsupported GET op: ${op}` } })
          return
        }
        send(response, 405, { ok: false, error: { code: "method-not-allowed", message: "GET or POST is required" } })
      } catch (error) {
        send(response, 400, { ok: false, error: { code: "invalid-input", message: errorMessage(error) } })
      }
    },
  })
}

function errorMessage(error) {
  return error && typeof error.message === "string" ? error.message : String(error)
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function requiredString(input, key) {
  const value = input[key]
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${key} must be a non-empty string`)
  return value
}

async function readBody(request) {
  const contentType = request.headers["content-type"]
  if (typeof contentType !== "string" || !contentType.toLocaleLowerCase().startsWith("application/json")) {
    throw new Error("content-type must be application/json")
  }
  const chunks = []
  let size = 0
  for await (const raw of request) {
    const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw)
    size += chunk.length
    if (size > BODY_LIMIT_BYTES) throw new Error("request body exceeds 256 KiB")
    chunks.push(chunk)
  }
  let parsed
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"))
  } catch {
    throw new Error("request body is not valid JSON")
  }
  if (!isRecord(parsed)) throw new Error("request body must be a JSON object")
  return parsed
}

function isLoopbackSameOrigin(request) {
  const address = request.socket.remoteAddress
  if (address !== "127.0.0.1" && address !== "::1" && address !== "::ffff:127.0.0.1") return false
  const host = request.headers.host
  if (typeof host !== "string") return false
  let hostUrl
  try {
    hostUrl = new URL(`http://${host}`)
  } catch {
    return false
  }
  if (hostUrl.hostname !== "localhost" && hostUrl.hostname !== "127.0.0.1" && hostUrl.hostname !== "[::1]") return false
  if (request.headers["sec-fetch-site"] === "cross-site") return false
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
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  })
  response.end(JSON.stringify(value))
}
