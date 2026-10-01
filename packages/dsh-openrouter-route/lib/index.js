/** DeepSeek Harness Host plugin: OpenRouter provider routing control.
 *
 * Owns a loopback proxy that sits between the harness and OpenRouter. The
 * plugin points the `openrouter` route's `baseURL` at the proxy (a live
 * settings write — the pi-ai adapter re-reads profiles per operation, so the
 * next request picks it up without a restart) and, per request, injects the
 * OpenRouter `provider` routing object derived from the user's selection:
 *
 * - pin:    `{ order: [provider], allow_fallbacks: true }`
 * - auto:   `{ sort: "price", allow_fallbacks: true }` (cost-first, OpenRouter-maintained)
 *
 * `allow_fallbacks` stays true in both modes so a pinned provider's outage
 * degrades to OpenRouter's fallback instead of failing the session.
 *
 * The relay also taps the response stream: OpenRouter stream chunks and JSON
 * bodies carry the `provider` that actually served the request, which becomes
 * the "currently used" readout. The per-provider table (price, uptime, status)
 * comes from OpenRouter's public endpoints endpoint, cached with a TTL.
 *
 * Removing the plugin restores the direct `baseURL` on disposal.
 */

import { readFile, writeFile, appendFile, mkdir } from "node:fs/promises"
import { join, dirname } from "node:path"
import { homedir } from "node:os"
import { createHash } from "node:crypto"

export const name = "dsh-openrouter-route"
export const inject = ["settings"]

const ROUTE_OPS = "/api/dsh-openrouter-route"
const ROUTE_PROXY = "/api/dsh-openrouter-route/v1"
const UPSTREAM = "https://openrouter.ai/api/v1"
const NAMESPACE = "llm-pi-ai"
const PROVIDER = "openrouter"

/** Hard cap on a proxied request body. The relay buffers JSON before injecting provider routing. */
export const MAX_REQUEST_BYTES = 64 * 1024 * 1024
/** Stop scanning a response for the serving provider after this many bytes. */
const PROVIDER_SCAN_LIMIT = 256 * 1024
/** Request timeout for the endpoints listing (metadata, not the relay). */
const ENDPOINTS_TIMEOUT_MS = 30 * 1000
/** Endpoints cache TTL; the dropdown serves stale and refreshes behind it. */
const ENDPOINTS_TTL_MS = 6 * 60 * 60 * 1000
/** Largest endpoints listing accepted. */
const MAX_ENDPOINTS_BYTES = 4 * 1024 * 1024
/** Largest model identifier admitted to diagnostics before grammar validation. */
const DIAGNOSTIC_MODEL_MAX_LENGTH = 160
/** Largest provider selection or request identifier admitted to diagnostics. */
const DIAGNOSTIC_FIELD_MAX_LENGTH = 160
/** Shared bound and grammar for provider selections accepted by ops and relay. */
const PROVIDER_SELECTION_MAX_LENGTH = DIAGNOSTIC_FIELD_MAX_LENGTH
const PROVIDER_SELECTION_RE = /^[A-Za-z0-9][A-Za-z0-9 ._-]*$/
/** Maximum accepted in-flight diagnostic records, including the active write. */
export const DIAGNOSTIC_MAX_PENDING = 64
/** Only these upstream response headers may contribute request identifiers. */
const DIAGNOSTIC_REQUEST_ID_HEADERS = ["x-openrouter-id", "x-request-id", "cf-ray"]

/** In-memory caches; the state file is the durable layer. */
let state = null
let stateWrite = null
/** model id -> { at, providers: [...] } */
const endpointsCache = new Map()
/** model id -> in-flight endpoints fetch (dedupe). */
const endpointsInFlight = new Map()

export class RequestBodyTooLargeError extends Error {
  constructor(limit) {
    super(`request body exceeds ${limit} bytes`)
    this.name = "RequestBodyTooLargeError"
    this.limit = limit
  }
}

function dshHomeDir() {
  return process.env.DSH_HOME && process.env.DSH_HOME.length > 0
    ? process.env.DSH_HOME
    : join(homedir(), ".dsh")
}

function statePath() {
  return join(dshHomeDir(), "openrouter-route.json")
}

function diagnosticsPath() {
  return join(dshHomeDir(), "openrouter-diagnostics.jsonl")
}

function emptyState() {
  return { selections: {}, lastServed: {}, baseURL: null }
}

async function readState() {
  if (state !== null) return state
  try {
    const raw = await readFile(statePath(), "utf8")
    const parsed = JSON.parse(raw)
    state = parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? {
          selections: parsed.selections && typeof parsed.selections === "object" ? parsed.selections : {},
          lastServed: parsed.lastServed && typeof parsed.lastServed === "object" ? parsed.lastServed : {},
          baseURL: typeof parsed.baseURL === "string" ? parsed.baseURL : null,
        }
      : emptyState()
  } catch {
    state = emptyState()
  }
  return state
}

async function persistState() {
  const snapshot = state
  if (snapshot === null || stateWrite !== null) return stateWrite
  stateWrite = (async () => {
    try {
      await mkdir(dirname(statePath()), { recursive: true })
      await writeFile(statePath(), JSON.stringify(snapshot, null, 2), "utf8")
    } catch (error) {
      console.error("dsh-openrouter-route: state write failed", error)
    } finally {
      stateWrite = null
    }
  })()
  return stateWrite
}

// ---------------------------------------------------------------------------
// Selection -> OpenRouter `provider` routing object.
// ---------------------------------------------------------------------------

/** Pure mapping, exported for tests. */
export function providerRoutingFor(selection) {
  if (typeof selection === "string" && selection.length > 0 && selection !== "auto") {
    return { order: [selection], allow_fallbacks: true }
  }
  return { sort: "price", allow_fallbacks: true }
}

async function selectionFor(modelId) {
  const current = await readState()
  const chosen = current.selections[modelId]
  return typeof chosen === "string" && chosen.length > 0 ? chosen : "auto"
}

// ---------------------------------------------------------------------------
// Settings baseURL wiring: flip on activate, restore on dispose.
// ---------------------------------------------------------------------------

function storedBaseURL(ctx) {
  const document = ctx.settings && ctx.settings.document ? ctx.settings.document : {}
  const section = document[NAMESPACE]
  const providers = section && typeof section === "object" ? section.providers : undefined
  const route = providers && typeof providers === "object" ? providers[PROVIDER] : undefined
  if (!route || typeof route !== "object") return undefined
  return typeof route.baseURL === "string" && route.baseURL.length > 0 ? route.baseURL : undefined
}

/**
 * Point the openrouter route at the proxy. Idempotent. Returns the action
 * taken; a non-openrouter custom baseURL is left strictly alone.
 */
async function wireBaseURL(ctx, proxyURL) {
  const current = storedBaseURL(ctx)
  if (current === proxyURL) {
    const s = await readState()
    s.baseURL = proxyURL
    await persistState()
    return "already"
  }
  if (current !== undefined && current !== UPSTREAM) return "left-alone"
  const s = await readState()
  s.baseURL = proxyURL
  await persistState()
  await ctx.settings.update(NAMESPACE, { providers: { [PROVIDER]: { baseURL: proxyURL } } })
  return "flipped"
}

/** Restore the direct upstream URL when this plugin owned the flip. */
async function unwireBaseURL(ctx) {
  const s = await readState()
  if (s.baseURL === null) return
  const current = storedBaseURL(ctx)
  if (current !== s.baseURL) return // someone changed it after us; do not clobber
  try {
    await ctx.settings.update(NAMESPACE, { providers: { [PROVIDER]: { baseURL: UPSTREAM } } })
  } catch (error) {
    console.error("dsh-openrouter-route: baseURL restore failed", error)
  }
  s.baseURL = null
  await persistState()
}

// ---------------------------------------------------------------------------
// Endpoints listing (per-provider price/uptime/status).
// ---------------------------------------------------------------------------

function timeoutSignal(ms) {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(ms)
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  timer.unref?.()
  return controller.signal
}

function isPosNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
}

/** Raw endpoints entry -> the row shape the client dropdown renders. */
function mapEndpoint(raw) {
  if (!raw || typeof raw !== "object") return undefined
  const name = typeof raw.provider_name === "string" ? raw.provider_name : undefined
  if (name === undefined || name.length === 0) return undefined
  const pricing = raw.pricing && typeof raw.pricing === "object" ? raw.pricing : {}
  const perMillion = (value) => {
    const perToken = typeof value === "string" ? Number.parseFloat(value) : typeof value === "number" ? value : NaN
    if (!Number.isFinite(perToken) || perToken < 0) return undefined
    return Math.round(perToken * 1_000_000 * 10000) / 10000
  }
  return {
    name,
    input: perMillion(pricing.prompt),
    output: perMillion(pricing.completion),
    cacheRead: perMillion(pricing.input_cache_read),
    discount: isPosNumber(pricing.discount) ? pricing.discount : undefined,
    uptime1d: isPosNumber(raw.uptime_last_1d) ? raw.uptime_last_1d : undefined,
    uptime30m: isPosNumber(raw.uptime_last_30m) ? raw.uptime_last_30m : undefined,
    status: typeof raw.status === "number" ? raw.status : undefined,
    quantization: typeof raw.quantization === "string" ? raw.quantization : undefined,
  }
}

async function readBounded(response, maxBytes) {
  if (!response.ok) {
    throw new Error(`OpenRouter answered ${response.status}`)
  }
  if (response.body === null) return ""
  const reader = response.body.getReader()
  const chunks = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) throw new Error(`OpenRouter listing exceeds ${maxBytes} bytes`)
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

async function fetchEndpoints(modelId) {
  const signal = timeoutSignal(ENDPOINTS_TIMEOUT_MS)
  const response = await fetch(`${UPSTREAM}/models/${modelId}/endpoints`, {
    method: "GET",
    headers: { accept: "application/json", "user-agent": "dsh-openrouter-route/0.1" },
    ...(signal === undefined ? {} : { signal }),
  })
  const text = await readBounded(response, MAX_ENDPOINTS_BYTES)
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error("OpenRouter did not answer with JSON")
  }
  const data = parsed && typeof parsed.data === "object" && parsed.data !== null ? parsed.data : {}
  const raw = Array.isArray(data.endpoints) ? data.endpoints : []
  const providers = raw.map(mapEndpoint).filter((row) => row !== undefined)
  if (providers.length === 0) throw new Error("OpenRouter listed no usable endpoints")
  return { providers, at: new Date().toISOString() }
}

/**
 * Cached listing for one model. Serves stale immediately and refreshes in the
 * background; concurrent callers share one fetch.
 */
function endpointsFor(ctx, modelId, force = false) {
  const cached = endpointsCache.get(modelId)
  const fresh = cached !== undefined && Date.now() - Date.parse(cached.at) < ENDPOINTS_TTL_MS
  if (!force && fresh) return { promise: null, cached }
  let inflight = endpointsInFlight.get(modelId)
  if (inflight === undefined) {
    inflight = fetchEndpoints(modelId)
      .then((entry) => {
        endpointsCache.set(modelId, entry)
        return entry
      })
      .catch((error) => {
        ctx.logger?.warn?.(`dsh-openrouter-route: endpoints fetch failed for "${modelId}": ${errorMessage(error)}`)
        return null
      })
      .finally(() => {
        endpointsInFlight.delete(modelId)
      })
    endpointsInFlight.set(modelId, inflight)
  }
  return { promise: inflight, cached }
}

// ---------------------------------------------------------------------------
// Bounded request diagnostics.
// ---------------------------------------------------------------------------

const DIAGNOSTIC_MODEL_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,62}\/[A-Za-z0-9][A-Za-z0-9._:-]{0,126}$/
const DIAGNOSTIC_SECRET_LIKE_RE = /(?:^|[._ -])(?:sk|pk|api[-_ ]?key|access[-_ ]?key|token|secret|bearer|auth)(?:[-_:=]|$)/i
const DIAGNOSTIC_SECRET_ENTROPY_RE = /^[A-Za-z0-9_-]{32,}$/
const DIAGNOSTIC_REQUEST_ID_RE = /^[A-Za-z0-9_-]{1,128}$/
const DIAGNOSTIC_CF_RAY_RE = /^[A-Fa-f0-9]{8,64}(?:-[A-Za-z]{3,8})?$/
const DIAGNOSTIC_HASH_RE = /^[a-f0-9]{16}$/
const DIAGNOSTIC_ERROR_CODES = new Set([
  "request_body",
  "aborted",
  "relay",
  "upstream_fetch",
  "upstream_http",
  "stream",
  "ABORT_ERR",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
  "EPIPE",
  "ETIMEDOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_SOCKET",
])
const DIAGNOSTIC_ERROR_MESSAGES = Object.freeze({
  request_body: "request body too large",
  aborted: "request aborted",
  relay: "relay failed",
  upstream_fetch: "upstream fetch failed",
  upstream_http: "upstream HTTP request failed",
  stream: "response stream failed",
})

function diagnosticHash(value) {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 16)
}

/** Admit only bounded model shapes; return non-reversible metadata, never the model. */
export function sanitizeDiagnosticModel(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > DIAGNOSTIC_MODEL_MAX_LENGTH) return undefined
  if (!DIAGNOSTIC_MODEL_ID_RE.test(value)) return undefined
  return { modelHash: diagnosticHash(value), modelLength: value.length }
}

function sanitizeDiagnosticModelMetadata(value) {
  if (!value || typeof value !== "object") return undefined
  const { modelHash, modelLength } = value
  if (typeof modelHash !== "string" || !DIAGNOSTIC_HASH_RE.test(modelHash)) return undefined
  if (!Number.isSafeInteger(modelLength) || modelLength <= 0 || modelLength > DIAGNOSTIC_MODEL_MAX_LENGTH) return undefined
  return { modelHash, modelLength }
}

function isSecretLikeDiagnosticSelection(value) {
  return DIAGNOSTIC_SECRET_LIKE_RE.test(value) || DIAGNOSTIC_SECRET_ENTROPY_RE.test(value)
}

function isValidProviderSelection(value) {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= PROVIDER_SELECTION_MAX_LENGTH &&
    PROVIDER_SELECTION_RE.test(value) &&
    !isSecretLikeDiagnosticSelection(value)
}

function diagnosticSelectionMetadata(value) {
  if (value === "auto") return { value: "auto" }
  if (typeof value !== "string" || value.length === 0 || value.length > PROVIDER_SELECTION_MAX_LENGTH) return undefined
  if (!isValidProviderSelection(value)) return { hash: diagnosticHash(value) }
  return { value }
}

function providerMetadataFromValidated(value, validated) {
  if (validated?.value === "auto") return { value: "auto" }
  if (typeof value !== "string" || value.length === 0 || value.length > PROVIDER_SELECTION_MAX_LENGTH) return undefined
  if (validated?.hash !== undefined) return { hash: validated.hash, length: value.length }
  return { hash: diagnosticHash(value), length: value.length }
}

/** Keep outbound provider names raw; diagnostics validate, then retain only hash metadata. */
function diagnosticProviderMetadata(value) {
  return providerMetadataFromValidated(value, diagnosticSelectionMetadata(value))
}

function sanitizeDiagnosticProviderMetadata(value) {
  if (!value || typeof value !== "object") return undefined
  const { providerHash, providerLength } = value
  if (typeof providerHash !== "string" || !DIAGNOSTIC_HASH_RE.test(providerHash)) return undefined
  if (!Number.isSafeInteger(providerLength) || providerLength <= 0 || providerLength > PROVIDER_SELECTION_MAX_LENGTH) return undefined
  return { providerHash, providerLength }
}

function diagnosticRequestIdHash(name, value) {
  if (typeof value !== "string" || value.length === 0 || value.length > DIAGNOSTIC_FIELD_MAX_LENGTH) return undefined
  const valid = name === "cf-ray"
    ? DIAGNOSTIC_CF_RAY_RE.test(value)
    : DIAGNOSTIC_REQUEST_ID_RE.test(value)
  if (!valid) return undefined
  return diagnosticHash(value)
}

/** Validate each allowlisted ID, then reduce it to a short log-safe correlation hash. */
export function sanitizeDiagnosticRequestIds(headers) {
  try {
    const hashes = []
    for (const name of DIAGNOSTIC_REQUEST_ID_HEADERS) {
      const raw = typeof headers?.get === "function" ? headers.get(name) : headers?.[name]
      const requestIdHash = diagnosticRequestIdHash(name, raw)
      if (requestIdHash !== undefined) hashes.push({ header: name, requestIdHash })
    }
    return hashes.length === 0 ? undefined : hashes
  } catch {
    return undefined
  }
}

function sanitizeDiagnosticRequestIdHashes(value) {
  if (!Array.isArray(value)) return undefined
  const hashes = []
  for (const item of value) {
    if (!item || typeof item !== "object") continue
    const { header, requestIdHash } = item
    if (!DIAGNOSTIC_REQUEST_ID_HEADERS.includes(header)) continue
    if (typeof requestIdHash !== "string" || !DIAGNOSTIC_HASH_RE.test(requestIdHash)) continue
    hashes.push({ header, requestIdHash })
  }
  return hashes.length === 0 ? undefined : hashes
}

function diagnosticErrorCode(error) {
  try {
    const code = error?.code
    return typeof code === "string" && DIAGNOSTIC_ERROR_CODES.has(code) ? code : undefined
  } catch {
    return undefined
  }
}

function diagnosticErrorCategory(error, fallback) {
  if (error instanceof RequestBodyTooLargeError) return "request_body"
  if (error && typeof error.name === "string" && error.name === "AbortError") return "aborted"
  return Object.hasOwn(DIAGNOSTIC_ERROR_MESSAGES, fallback) ? fallback : "relay"
}

export function newRelayDiagnostic() {
  return {
    startedAt: Date.now(),
    modelHash: undefined,
    modelLength: undefined,
    selectedProviderRouting: undefined,
    providerHash: undefined,
    providerLength: undefined,
    upstreamStatus: undefined,
    upstreamRequestIdHashes: undefined,
    responseBytes: 0,
    streamChunkCount: 0,
    errorCategory: undefined,
    errorCode: undefined,
  }
}

export function markDiagnosticError(diagnostic, category, error) {
  if (diagnostic.errorCategory !== undefined) return
  diagnostic.errorCategory = diagnosticErrorCategory(error, category)
  diagnostic.errorCode = diagnosticErrorCode(error)
}

export function relayDiagnosticRecord(diagnostic) {
  const record = { timestamp: new Date().toISOString() }
  const model = sanitizeDiagnosticModelMetadata({
    modelHash: diagnostic.modelHash,
    modelLength: diagnostic.modelLength,
  })
  if (model !== undefined) {
    record.modelHash = model.modelHash
    record.modelLength = model.modelLength
  }
  const provider = diagnosticProviderMetadata(diagnostic.selectedProviderRouting)
  if (provider?.value === "auto") record.selectedProviderRouting = "auto"
  const providerMetadata = provider?.hash !== undefined
    ? { providerHash: provider.hash, providerLength: provider.length }
    : sanitizeDiagnosticProviderMetadata(diagnostic)
  if (providerMetadata !== undefined) {
    record.providerHash = providerMetadata.providerHash
    record.providerLength = providerMetadata.providerLength
  }
  if (Number.isInteger(diagnostic.upstreamStatus) && diagnostic.upstreamStatus >= 100 && diagnostic.upstreamStatus <= 599) {
    record.upstreamStatus = diagnostic.upstreamStatus
  }
  const requestIdHashes = sanitizeDiagnosticRequestIdHashes(diagnostic.upstreamRequestIdHashes)
  if (requestIdHashes !== undefined) record.upstreamRequestIdHashes = requestIdHashes
  record.responseBytes = Number.isSafeInteger(diagnostic.responseBytes) && diagnostic.responseBytes >= 0
    ? diagnostic.responseBytes
    : 0
  record.streamChunkCount = Number.isSafeInteger(diagnostic.streamChunkCount) && diagnostic.streamChunkCount >= 0
    ? diagnostic.streamChunkCount
    : 0
  record.durationMs = Math.max(0, Date.now() - diagnostic.startedAt)
  if (diagnostic.errorCategory !== undefined) {
    const category = diagnosticErrorCategory(undefined, diagnostic.errorCategory)
    record.errorCategory = category
    record.errorMessage = DIAGNOSTIC_ERROR_MESSAGES[category]
    const code = diagnosticErrorCode({ code: diagnostic.errorCode })
    if (code !== undefined) record.errorCode = code
  }
  return record
}

/** Serialize writes with a hard pending-record bound. Overflow records are dropped. */
export function createBoundedDiagnosticWriter(writeLine, maxPending = DIAGNOSTIC_MAX_PENDING) {
  let tail = Promise.resolve()
  let pending = 0
  return {
    enqueue(line) {
      if (pending >= maxPending) return false
      pending += 1
      tail = tail
        .then(() => writeLine(line))
        .catch(() => {})
        .finally(() => {
          pending -= 1
        })
      return true
    },
    flush() {
      return tail
    },
    get pending() {
      return pending
    },
  }
}

const diagnosticWriter = createBoundedDiagnosticWriter(async (line) => {
  await mkdir(dshHomeDir(), { recursive: true })
  await appendFile(diagnosticsPath(), line, { encoding: "utf8", mode: 0o600 })
})

function writeRelayDiagnostic(diagnostic) {
  try {
    const line = `${JSON.stringify(relayDiagnosticRecord(diagnostic))}\n`
    return diagnosticWriter.enqueue(line)
  } catch {
    // Diagnostics are best effort; never affect relay completion.
    return false
  }
}

// ---------------------------------------------------------------------------
// Proxy relay.
// ---------------------------------------------------------------------------

const PROVIDER_RE = /"provider"\s*:\s*"([^"]+)"/

function requestCloseShouldAbort(request) {
  return request.aborted === true || !request.complete
}

/** Wait for downstream capacity without outliving socket or request termination. */
export function waitForResponseDrain(response, request, signal) {
  return new Promise((resolve, reject) => {
    let settled = false
    const cleanup = () => {
      response.removeListener("drain", onDrain)
      response.removeListener("close", onTerminal)
      response.removeListener("error", onTerminal)
      request.removeListener("aborted", onAbort)
      request.removeListener("close", onRequestClose)
      signal.removeEventListener("abort", onAbort)
    }
    const finish = (callback, value) => {
      if (settled) return
      settled = true
      cleanup()
      callback(value)
    }
    const onDrain = () => finish(resolve)
    const onTerminal = () => finish(reject, new Error("response closed before drain"))
    const onAbort = () => finish(reject, new Error("request aborted before drain"))
    const onRequestClose = () => {
      if (requestCloseShouldAbort(request)) onAbort()
    }

    response.once("drain", onDrain)
    response.once("close", onTerminal)
    response.once("error", onTerminal)
    request.once("aborted", onAbort)
    request.once("close", onRequestClose)
    signal.addEventListener("abort", onAbort, { once: true })
    if (signal.aborted || request.aborted || (request.destroyed && !request.complete)) onAbort()
    else if (response.destroyed || response.writableEnded) onTerminal()
    else if (response.writableNeedDrain === false) onDrain()
  })
}

async function relay(ctx, request, response) {
  const diagnostic = newRelayDiagnostic()
  try {
    await relayRequest(ctx, request, response, diagnostic)
  } catch (error) {
    markDiagnosticError(diagnostic, diagnosticErrorCategory(error, "relay"), error)
    throw error
  } finally {
    writeRelayDiagnostic(diagnostic)
  }
}

/**
 * One proxy dispatch: read the inbound body, inject `provider` routing,
 * forward to OpenRouter, stream the answer back while tapping it for the
 * serving provider. Aborts propagate inbound -> upstream.
 */
export async function relayRequest(ctx, request, response, diagnostic) {
  const url = new URL(request.url ?? "/", "http://localhost")
  const suffix = url.pathname.startsWith(ROUTE_PROXY)
    ? url.pathname.slice(ROUTE_PROXY.length) || "/"
    : url.pathname
  const method = request.method ?? "GET"

  const abort = new AbortController()
  const onAbort = () => abort.abort()
  const onRequestClose = () => {
    if (requestCloseShouldAbort(request)) onAbort()
  }
  const cleanupRequestAbort = () => {
    request.removeListener("aborted", onAbort)
    request.removeListener("close", onRequestClose)
  }
  request.on("aborted", onAbort)
  request.on("close", onRequestClose)

  try {
    const body = method === "GET" || method === "HEAD" ? undefined : await readBody(request)
    let outboundBody = body
    let modelId
    if (body !== undefined) {
      try {
        const parsed = JSON.parse(body.toString("utf8"))
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          modelId = typeof parsed.model === "string" ? parsed.model : undefined
          if (modelId !== undefined) {
            const selection = await selectionFor(modelId)
            const selectionMetadata = diagnosticSelectionMetadata(selection)
            const routeSelection = isValidProviderSelection(selection) ? selection : "auto"
            const modelMetadata = sanitizeDiagnosticModel(modelId)
            if (modelMetadata !== undefined) {
              diagnostic.modelHash = modelMetadata.modelHash
              diagnostic.modelLength = modelMetadata.modelLength
            }
            if (selectionMetadata?.value !== undefined) {
              const providerMetadata = providerMetadataFromValidated(selection, selectionMetadata)
              if (providerMetadata?.value === "auto") diagnostic.selectedProviderRouting = "auto"
              else if (providerMetadata !== undefined) {
                diagnostic.providerHash = providerMetadata.hash
                diagnostic.providerLength = providerMetadata.length
              }
            }
            parsed.provider = providerRoutingFor(routeSelection)
            outboundBody = Buffer.from(JSON.stringify(parsed), "utf8")
          }
        }
      } catch {
        // Not JSON (or a stream the caller owns): relay verbatim.
        outboundBody = body
      }
    }

    const headers = {}
    for (const [name, value] of Object.entries(request.headers ?? {})) {
      const lower = name.toLowerCase()
      if (lower === "host" || lower === "content-length" || lower === "connection" || lower === "accept-encoding") continue
      headers[name] = value
    }
    headers["accept-encoding"] = "identity"
    if (outboundBody !== undefined) headers["content-length"] = String(outboundBody.length)

    let upstream
    try {
      upstream = await fetch(UPSTREAM + suffix + (url.search ?? ""), {
        method,
        headers,
        body: outboundBody,
        signal: abort.signal,
      })
    } catch (error) {
      markDiagnosticError(diagnostic, diagnosticErrorCategory(error, "upstream_fetch"), error)
      if (!response.headersSent) {
        response.writeHead(502, { "content-type": "application/json; charset=utf-8" })
      }
      response.end(JSON.stringify({ error: { message: `dsh-openrouter-route relay failed: ${errorMessage(error)}` } }))
      return
    }

    diagnostic.upstreamStatus = upstream.status
    diagnostic.upstreamRequestIdHashes = sanitizeDiagnosticRequestIds(upstream.headers)
    if (!upstream.ok) markDiagnosticError(diagnostic, "upstream_http")

    const responseHeaders = {}
    upstream.headers.forEach((value, name) => {
      const lower = name.toLowerCase()
      if (lower === "content-length" || lower === "content-encoding" || lower === "transfer-encoding" || lower === "connection") return
      responseHeaders[name] = value
    })
    response.writeHead(upstream.status, responseHeaders)

    if (upstream.body === null) {
      response.end()
      return
    }

    // Stream through, tapping the first `"provider":"..."` for the readout.
    const scan = modelId === undefined ? null : { budget: PROVIDER_SCAN_LIMIT, pending: "" }
    const reader = upstream.body.getReader()
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        diagnostic.responseBytes += value.byteLength
        diagnostic.streamChunkCount += 1
        if (scan !== null && scan.budget > 0) {
          const addition = value.byteLength > 4096 ? value.subarray(value.byteLength - 4096) : value
          scan.pending = Buffer.concat([Buffer.from(scan.pending, "latin1"), addition])
            .subarray(-4096)
            .toString("latin1")
          const match = PROVIDER_RE.exec(scan.pending)
          if (match !== null) {
            recordServed(modelId, match[1])
            scan.budget = 0
          } else {
            scan.budget -= value.byteLength
          }
        }
        if (!response.write(Buffer.from(value))) {
          await waitForResponseDrain(response, request, abort.signal)
        }
      }
      response.end()
    } catch (error) {
      markDiagnosticError(diagnostic, diagnosticErrorCategory(error, "stream"), error)
      try {
        response.destroy(error instanceof Error ? error : new Error(errorMessage(error)))
      } catch {
        // Socket already gone.
      }
    } finally {
      void reader.cancel().catch(() => {})
    }
  } finally {
    cleanupRequestAbort()
    abort.abort()
  }
}

function recordServed(modelId, provider) {
  readState().then((s) => {
    s.lastServed[modelId] = { provider, at: new Date().toISOString() }
    // Keep the map bounded: most-recent 64 models.
    const keys = Object.keys(s.lastServed)
    if (keys.length > 64) {
      for (const key of keys.slice(0, keys.length - 64)) delete s.lastServed[key]
    }
    return persistState()
  }).catch(() => {})
}

// ---------------------------------------------------------------------------
// Ops route (chip + dropdown data).
// ---------------------------------------------------------------------------

async function statusPayload(ctx, modelId) {
  const s = await readState()
  const selection = modelId === undefined ? undefined : await selectionFor(modelId)
  const served = modelId === undefined ? undefined : s.lastServed[modelId]
  const { promise, cached } = modelId === undefined ? { promise: null, cached: undefined } : endpointsFor(ctx, modelId)
  return {
    wired: storedBaseURL(ctx) === s.baseURL && s.baseURL !== null,
    proxyPath: ROUTE_PROXY,
    model: modelId,
    selection: selection === undefined ? null : selection,
    current: served === undefined ? null : served,
    providers: cached === undefined ? [] : cached.providers,
    providersAt: cached === undefined ? null : cached.at,
    refresh: promise === null
      ? null
      : promise.then((entry) => (entry === null ? null : entry)),
  }
}

async function dispatchOp(ctx, op, body, query) {
  if (op === "status") {
    const model = typeof query.get === "function" ? query.get("model") : null
    return statusPayload(ctx, typeof model === "string" && model.length > 0 ? model : undefined)
  }
  if (op === "select") {
    const model = requiredString(body, "model")
    const provider = requiredString(body, "provider")
    if (provider !== "auto" && !isValidProviderSelection(provider)) {
      throw new Error("provider must be \"auto\" or a provider name")
    }
    const s = await readState()
    if (provider === "auto") delete s.selections[model]
    else s.selections[model] = provider
    await persistState()
    return statusPayload(ctx, model)
  }
  if (op === "refresh") {
    const model = requiredString(body, "model")
    const entry = await endpointsFor(ctx, model, true).promise
    return statusPayload(ctx, model)
  }
  throw new Error(`unsupported op: ${op}`)
}

// ---------------------------------------------------------------------------
// HTTP plumbing.
// ---------------------------------------------------------------------------

function isLoopbackSameOrigin(request) {
  const address = request.socket?.remoteAddress
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

export async function readBody(request, maxBytes = MAX_REQUEST_BYTES) {
  const chunks = []
  let size = 0
  for await (const raw of request) {
    const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw)
    size += chunk.length
    if (size > maxBytes) throw new RequestBodyTooLargeError(maxBytes)
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

function requiredString(input, key) {
  const value = input?.[key]
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${key} must be a non-empty string`)
  return value
}

function errorMessage(error) {
  return error && typeof error.message === "string" ? error.message : String(error)
}

export function relayFailureFor(error) {
  if (error instanceof RequestBodyTooLargeError) {
    return {
      status: 413,
      body: {
        error: {
          message: `DSH OpenRouter proxy request exceeds ${error.limit} bytes`,
        },
      },
    }
  }
  return {
    status: 502,
    body: {
      error: {
        message: `dsh-openrouter-route relay failed: ${errorMessage(error)}`,
      },
    },
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

// ---------------------------------------------------------------------------
// Plugin wiring.
// ---------------------------------------------------------------------------

export function apply(ctx) {
  ctx.inject(["webServer"], (webCtx) => {
    const proxyURL = `http://127.0.0.1:${webCtx.webServer.port}${ROUTE_PROXY}`
    const disposeRoutes = webCtx.effect(() => {
      const d1 = webCtx.webServer.register({
        kind: "exact",
        path: ROUTE_OPS,
        async handler(request, response) {
          if (!isLoopbackSameOrigin(request)) {
            send(response, 403, { ok: false, error: { code: "forbidden", message: "loopback same-origin access is required" } })
            return
          }
          try {
            if (request.method === "POST") {
              const raw = await readBody(request)
              let body
              try {
                body = JSON.parse(raw.toString("utf8"))
              } catch {
                throw new Error("request body is not valid JSON")
              }
              if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("request body must be a JSON object")
              const value = await dispatchOp(ctx, requiredString(body, "op"), body, new URLSearchParams())
              send(response, 200, { ok: true, value })
              return
            }
            if (request.method === "GET") {
              const url = new URL(request.url ?? ROUTE_OPS, "http://localhost")
              const op = url.searchParams.get("op") ?? ""
              const value = await dispatchOp(ctx, op, {}, url.searchParams)
              send(response, 200, { ok: true, value })
              return
            }
            send(response, 405, { ok: false, error: { code: "method-not-allowed", message: "GET or POST is required" } })
          } catch (error) {
            send(response, 400, { ok: false, error: { code: "invalid-input", message: errorMessage(error) } })
          }
        },
      })
      const d2 = webCtx.webServer.register({
        kind: "prefix",
        path: ROUTE_PROXY,
        handler(request, response) {
          relay(ctx, request, response).catch((error) => {
            ctx.logger?.warn?.(`dsh-openrouter-route: relay crashed: ${errorMessage(error)}`)
            if (!response.headersSent) {
              const failure = relayFailureFor(error)
              send(response, failure.status, failure.body)
              return
            }
            response.end()
          })
        },
      })
      wireBaseURL(ctx, proxyURL).then(
        (action) => {
          if (action === "left-alone") {
            ctx.logger?.warn?.("dsh-openrouter-route: openrouter route has a custom baseURL; routing control stays unwired")
          }
        },
        (error) => ctx.logger?.warn?.(`dsh-openrouter-route: baseURL flip failed: ${errorMessage(error)}`),
      )
      return () => {
        d1()
        d2()
        unwireBaseURL(ctx).catch((error) => ctx.logger?.warn?.(`dsh-openrouter-route: dispose restore failed: ${errorMessage(error)}`))
      }
    }, "dsh-openrouter-route.web")
    return disposeRoutes
  })
}
