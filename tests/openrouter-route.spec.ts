import { describe, expect, it } from 'vitest'
import { EventEmitter } from 'node:events'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable, Writable } from 'node:stream'

type RelayDiagnostic = {
  startedAt: number
  modelHash?: unknown
  modelLength?: unknown
  selectedProviderRouting?: unknown
  providerHash?: unknown
  providerLength?: unknown
  upstreamStatus?: unknown
  upstreamRequestIdHashes?: unknown
  responseBytes: number
  streamChunkCount: number
  errorCategory?: unknown
  errorCode?: unknown
}

type DiagnosticModelMetadata = {
  modelHash: string
  modelLength: number
}

type DiagnosticRequestIdHash = {
  header: string
  requestIdHash: string
}

type DiagnosticRecord = {
  timestamp: string
  modelHash?: string
  modelLength?: number
  selectedProviderRouting?: 'auto'
  providerHash?: string
  providerLength?: number
  upstreamStatus?: number
  upstreamRequestIdHashes?: DiagnosticRequestIdHash[]
  responseBytes: number
  streamChunkCount: number
  durationMs: number
  errorCategory?: string
  errorMessage?: string
  errorCode?: string
}

type DiagnosticWriter = {
  enqueue: (line: string) => boolean
  flush: () => Promise<void>
  readonly pending: number
}

type DrainEventTarget = EventEmitter & { writableNeedDrain: boolean }
type DrainRequest = EventEmitter & { complete?: boolean; destroyed?: boolean; aborted?: boolean }
type RelayRequest = Readable & DrainRequest & {
  headers: Record<string, string>
  url: string
  method: string
}
type RelayResponse = Writable & {
  headersSent: boolean
  statusCode?: number
  responseHeaders?: Record<string, string>
  writeHead: (status: number, headers: Record<string, string>) => Writable
}

class CompletedCloseRequest extends Readable implements RelayRequest {
  complete = false
  aborted = false
  closeEmitted = false
  headers = { 'content-type': 'application/json', host: 'localhost' }
  url = '/api/dsh-openrouter-route/v1/chat/completions'
  method = 'POST'

  constructor(body: string) {
    super({ autoDestroy: false, emitClose: false })
    this.push(body)
    this.push(null)
  }

  override _read(): void {}

  emitCompletedClose(): void {
    this.complete = true
    this.destroyed = true
    this.closeEmitted = true
    this.emit('close')
  }
}

class DeferredBodyRequest extends EventEmitter {
  complete = false
  aborted = false
  headers = { 'content-type': 'application/json', host: 'localhost' }
  url = '/api/dsh-openrouter-route/v1/chat/completions'
  method = 'POST'
  readonly bodyReadStarted: Promise<void>
  private markBodyReadStarted!: () => void
  private pendingNext: ((result: IteratorResult<string | Buffer>) => void) | undefined
  private bufferedBody: string | Buffer | undefined
  private ended = false

  constructor() {
    super()
    this.on('error', () => {})
    this.bodyReadStarted = new Promise((resolve) => { this.markBodyReadStarted = resolve })
  }

  [Symbol.asyncIterator](): AsyncIterator<string | Buffer> {
    return {
      next: (): Promise<IteratorResult<string | Buffer>> => {
        this.markBodyReadStarted()
        if (this.bufferedBody !== undefined) {
          const value = this.bufferedBody
          this.bufferedBody = undefined
          return Promise.resolve({ value, done: false })
        }
        if (this.ended) return Promise.resolve({ value: undefined, done: true })
        return new Promise((resolve) => { this.pendingNext = resolve })
      },
    }
  }

  emitIncompleteClose(): void {
    this.aborted = true
    this.emit('aborted')
    this.emit('error', Object.assign(new Error('aborted'), { name: 'AbortError' }))
    this.emit('close')
  }

  finish(body: string): void {
    this.bufferedBody = body
    this.ended = true
    const resolve = this.pendingNext
    this.pendingNext = undefined
    if (resolve !== undefined) {
      const value = this.bufferedBody
      this.bufferedBody = undefined
      resolve({ value, done: false })
    }
  }
}

class BackpressuredResponse extends Writable implements RelayResponse {
  headersSent = false
  statusCode?: number
  responseHeaders?: Record<string, string>
  chunks: Buffer[] = []
  drainObserved = false
  readonly writeStarted: Promise<void>
  private readonly drainGate: Promise<void>
  private markWriteStarted!: () => void
  private releaseDrainCallback!: () => void

  constructor() {
    super({ autoDestroy: false, highWaterMark: 1 })
    this.writeStarted = new Promise((resolve) => { this.markWriteStarted = resolve })
    this.drainGate = new Promise((resolve) => { this.releaseDrainCallback = resolve })
    this.on('drain', () => { this.drainObserved = true })
  }

  override _write(
    chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.chunks.push(Buffer.from(chunk))
    this.markWriteStarted()
    void this.drainGate.then(() => callback())
  }

  releaseDrain(): void {
    this.releaseDrainCallback()
  }

  writeHead(status: number, headers: Record<string, string>): Writable {
    this.statusCode = status
    this.responseHeaders = headers
    this.headersSent = true
    return this
  }
}

type OpenRouterRouteModule = {
  readonly MAX_REQUEST_BYTES: number
  readonly RequestBodyTooLargeError: new (limit: number) => Error & { readonly limit: number }
  readonly providerRoutingFor: (selection: string) => Record<string, unknown>
  readonly readBody: (request: Readable, maxBytes?: number) => Promise<Buffer>
  readonly relayFailureFor: (error: unknown) => {
    readonly status: number
    readonly body: { readonly error: { readonly message: string } }
  }
  readonly newRelayDiagnostic: () => RelayDiagnostic
  readonly markDiagnosticError: (diagnostic: RelayDiagnostic, category: string, error?: unknown) => void
  readonly relayDiagnosticRecord: (diagnostic: RelayDiagnostic) => DiagnosticRecord
  readonly sanitizeDiagnosticModel: (value: unknown) => DiagnosticModelMetadata | undefined
  readonly sanitizeDiagnosticRequestIds: (headers: unknown) => DiagnosticRequestIdHash[] | undefined
  readonly createBoundedDiagnosticWriter: (
    writeLine: (line: string) => Promise<void> | void,
    maxPending?: number,
  ) => DiagnosticWriter
  readonly waitForResponseDrain: (
    response: DrainEventTarget,
    request: DrainRequest,
    signal: AbortSignal,
  ) => Promise<void>
  readonly relayRequest: (
    ctx: unknown,
    request: RelayRequest,
    response: RelayResponse,
    diagnostic: RelayDiagnostic,
  ) => Promise<void>
}

const plugin = await import(new URL('../packages/dsh-openrouter-route/lib/index.js', import.meta.url).href) as OpenRouterRouteModule

describe('dsh-openrouter-route proxy', () => {
  it('allows request bodies up to 64 MiB', () => {
    expect(plugin.MAX_REQUEST_BYTES).toBe(64 * 1024 * 1024)
  })

  it('accepts the exact body limit and rejects the next byte', async () => {
    await expect(plugin.readBody(Readable.from([Buffer.alloc(4), Buffer.alloc(4)]), 8))
      .resolves.toEqual(Buffer.alloc(8))
    await expect(plugin.readBody(Readable.from([Buffer.alloc(8), Buffer.alloc(1)]), 8))
      .rejects.toThrow('request body exceeds 8 bytes')
  })

  it('turns oversized bodies into a descriptive 413 response', () => {
    expect(plugin.relayFailureFor(new plugin.RequestBodyTooLargeError(8))).toEqual({
      status: 413,
      body: { error: { message: 'DSH OpenRouter proxy request exceeds 8 bytes' } },
    })
  })

  it('keeps unexpected pre-response relay failures descriptive', () => {
    expect(plugin.relayFailureFor(new Error('socket broke'))).toEqual({
      status: 502,
      body: { error: { message: 'dsh-openrouter-route relay failed: socket broke' } },
    })
  })

  it('maps automatic and pinned provider routing', () => {
    expect(plugin.providerRoutingFor('auto')).toEqual({ sort: 'price', allow_fallbacks: true })
    expect(plugin.providerRoutingFor('DeepSeek')).toEqual({ order: ['DeepSeek'], allow_fallbacks: true })
    const rawSelection = 'sk-test-7e95f4f4b1c2d3e4f5a6b7c8d9e0f1a2'
    expect(plugin.providerRoutingFor(rawSelection)).toEqual({ order: [rawSelection], allow_fallbacks: true })
  })

  it('falls back safely without provider diagnostics for secret-shaped persisted state', async () => {
    const relayPlugin = await import(new URL('../packages/dsh-openrouter-route/lib/index.js?relay-selection-state-test', import.meta.url).href) as OpenRouterRouteModule
    const originalFetch = globalThis.fetch
    const originalHome = process.env.DSH_HOME
    const home = await mkdtemp(join(tmpdir(), 'dsh-openrouter-route-'))
    const model = 'deepseek/deepseek-chat'
    const secretSelection = 'PROVIDER_API_KEY_7E95F4F4'
    let forwardedBody: unknown
    try {
      process.env.DSH_HOME = home
      await writeFile(join(home, 'openrouter-route.json'), JSON.stringify({
        selections: { [model]: secretSelection },
        lastServed: {},
        baseURL: null,
      }), 'utf8')
      globalThis.fetch = async (_input, init) => {
        forwardedBody = JSON.parse(String(init?.body)) as unknown
        return new Response('ok', { status: 200 })
      }

      const request = new CompletedCloseRequest(JSON.stringify({ model }))
      const response = new BackpressuredResponse()
      response.releaseDrain()
      const diagnostic = relayPlugin.newRelayDiagnostic()
      await relayPlugin.relayRequest({}, request, response, diagnostic)

      expect(forwardedBody).toEqual({
        model,
        provider: { sort: 'price', allow_fallbacks: true },
      })
      const record = relayPlugin.relayDiagnosticRecord(diagnostic)
      expect(JSON.stringify(record)).not.toContain(secretSelection)
      expect(record).not.toHaveProperty('selectedProviderRouting')
      expect(record).not.toHaveProperty('providerHash')
      expect(record).not.toHaveProperty('providerLength')
      expect(response.statusCode).toBe(200)
    } finally {
      globalThis.fetch = originalFetch
      if (originalHome === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = originalHome
      await rm(home, { recursive: true, force: true })
    }
  })

  it('preserves an edge-valid provider selected by ops through relay routing', async () => {
    const relayPlugin = await import(new URL('../packages/dsh-openrouter-route/lib/index.js?relay-edge-selection-state-test', import.meta.url).href) as OpenRouterRouteModule
    const originalFetch = globalThis.fetch
    const originalHome = process.env.DSH_HOME
    const home = await mkdtemp(join(tmpdir(), 'dsh-openrouter-route-'))
    const model = 'deepseek/deepseek-chat'
    const edgeProvider = `Edge ${'x'.repeat(60)} `
    let forwardedBody: unknown
    try {
      process.env.DSH_HOME = home
      await writeFile(join(home, 'openrouter-route.json'), JSON.stringify({
        selections: { [model]: edgeProvider },
        lastServed: {},
        baseURL: null,
      }), 'utf8')
      globalThis.fetch = async (_input, init) => {
        forwardedBody = JSON.parse(String(init?.body)) as unknown
        return new Response('ok', { status: 200 })
      }

      const request = new CompletedCloseRequest(JSON.stringify({ model }))
      const response = new BackpressuredResponse()
      response.releaseDrain()
      const diagnostic = relayPlugin.newRelayDiagnostic()
      await relayPlugin.relayRequest({}, request, response, diagnostic)

      expect(forwardedBody).toEqual({
        model,
        provider: { order: [edgeProvider], allow_fallbacks: true },
      })
      const record = relayPlugin.relayDiagnosticRecord(diagnostic)
      expect(record).toMatchObject({
        providerHash: expect.stringMatching(/^[a-f0-9]{16}$/),
        providerLength: edgeProvider.length,
      })
      expect(record).not.toHaveProperty('selectedProviderRouting')
      expect(JSON.stringify(record)).not.toContain(edgeProvider)
      expect(response.statusCode).toBe(200)
    } finally {
      globalThis.fetch = originalFetch
      if (originalHome === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = originalHome
      await rm(home, { recursive: true, force: true })
    }
  })

  it('omits raw model, provider, request-ID, and error-code canaries from JSONL', async () => {
    const modelFixture = 'sk-or-v1-0123456789abcdef/MODEL-SECRET-7E95F4F4'
    const providerCanary = 'sk-test-7e95f4f4b1c2d3e4f5a6b7c8d9e0f1a2'
    const providerApiKeyCanary = 'PROVIDER_API_KEY_7E95F4F4'
    const uppercaseTokenCanary = 'CANARY_SECRET_TOKEN_7E95F4F4'
    const requestIdCanary = 'REQUEST_ID_CANARY_7E95F4F4'
    const canaries = [modelFixture, providerCanary, providerApiKeyCanary, uppercaseTokenCanary, requestIdCanary]
    const modelMetadata = plugin.sanitizeDiagnosticModel(modelFixture)!

    const diagnostic = plugin.newRelayDiagnostic()
    diagnostic.modelHash = modelMetadata.modelHash
    diagnostic.modelLength = modelMetadata.modelLength
    diagnostic.selectedProviderRouting = providerCanary
    diagnostic.upstreamRequestIdHashes = [
      { header: 'x-openrouter-id', requestIdHash: requestIdCanary },
    ]
    diagnostic.upstreamStatus = 401
    const failure = Object.assign(new Error(`upstream failed: ${canaries.join(' ')}`), { code: uppercaseTokenCanary })
    plugin.markDiagnosticError(diagnostic, 'upstream_fetch', failure)

    const record = plugin.relayDiagnosticRecord(diagnostic)
    const jsonl: string[] = []
    const writer = plugin.createBoundedDiagnosticWriter((line) => { jsonl.push(line) })
    expect(writer.enqueue(`${JSON.stringify(record)}\n`)).toBe(true)
    await writer.flush()

    const written = jsonl.join('')
    for (const canary of canaries) expect(written).not.toContain(canary)
    const parsed = JSON.parse(written) as DiagnosticRecord
    expect(parsed).toMatchObject({
      modelHash: modelMetadata.modelHash,
      modelLength: modelMetadata.modelLength,
      providerHash: expect.stringMatching(/^[a-f0-9]{16}$/),
      providerLength: providerCanary.length,
      upstreamStatus: 401,
      errorCategory: 'upstream_fetch',
      errorMessage: 'upstream fetch failed',
    })
    expect(parsed).not.toHaveProperty('model')
    expect(parsed).not.toHaveProperty('selectedProviderRouting')
    expect(parsed).not.toHaveProperty('upstreamRequestIdHashes')
    expect(parsed).not.toHaveProperty('errorCode')
  })

  it('omits oversized secret-shaped model input', async () => {
    const invalidModelCanary = `sk-or-v1-${'a'.repeat(64)}/MODEL-SECRET-7E95F4F4`
    expect(plugin.sanitizeDiagnosticModel(invalidModelCanary)).toBeUndefined()

    const diagnostic = plugin.newRelayDiagnostic()
    const record = plugin.relayDiagnosticRecord(diagnostic)
    const jsonl: string[] = []
    const writer = plugin.createBoundedDiagnosticWriter((line) => { jsonl.push(line) })
    expect(writer.enqueue(`${JSON.stringify(record)}\n`)).toBe(true)
    await writer.flush()

    expect(jsonl.join('')).not.toContain(invalidModelCanary)
    expect(record).not.toHaveProperty('modelHash')
    expect(record).not.toHaveProperty('modelLength')
  })

  it('admits bounded model and header-specific request IDs', () => {
    expect(plugin.sanitizeDiagnosticModel('deepseek/deepseek-chat')).toEqual({
      modelHash: expect.stringMatching(/^[a-f0-9]{16}$/),
      modelLength: 22,
    })
    expect(plugin.sanitizeDiagnosticModel(`deepseek/${'x'.repeat(200)}`)).toBeUndefined()

    const headers = new Map([
      ['x-openrouter-id', 'req_ABC-123'],
      ['x-request-id', 'request_ABC_123'],
      ['cf-ray', '8a12b3c4d5e6f789-DFW'],
    ])
    expect(plugin.sanitizeDiagnosticRequestIds(headers)).toEqual([
      { header: 'x-openrouter-id', requestIdHash: '3c3141d35217f692' },
      { header: 'x-request-id', requestIdHash: 'ebbeefa1a7be0f0f' },
      { header: 'cf-ray', requestIdHash: 'cf18f60905a9db96' },
    ])
    expect(plugin.sanitizeDiagnosticRequestIds({
      'x-request-id': 'valid-looking secret',
      'cf-ray': '8a12b3c4d5e6f789-SECRET-HEADER',
    })).toBeUndefined()
  })

  it('keeps auto literal and hashes non-auto provider metadata', () => {
    const automatic = plugin.newRelayDiagnostic()
    automatic.selectedProviderRouting = 'auto'
    const automaticRecord = plugin.relayDiagnosticRecord(automatic)
    expect(automaticRecord.selectedProviderRouting).toBe('auto')
    expect(automaticRecord.providerHash).toBeUndefined()
    expect(automaticRecord.providerLength).toBeUndefined()

    const provider = 'Amazon Bedrock'
    const pinned = plugin.newRelayDiagnostic()
    pinned.selectedProviderRouting = provider
    const pinnedRecord = plugin.relayDiagnosticRecord(pinned)
    expect(pinnedRecord.selectedProviderRouting).toBeUndefined()
    expect(pinnedRecord.providerHash).toMatch(/^[a-f0-9]{16}$/)
    expect(pinnedRecord.providerLength).toBe(provider.length)

    const invalidProvider = 'x'.repeat(200)
    const invalid = plugin.newRelayDiagnostic()
    invalid.selectedProviderRouting = invalidProvider
    const invalidRecord = plugin.relayDiagnosticRecord(invalid)
    expect(invalidRecord).not.toHaveProperty('selectedProviderRouting')
    expect(invalidRecord).not.toHaveProperty('providerHash')
    expect(invalidRecord).not.toHaveProperty('providerLength')
  })

  it('keeps only known diagnostic error codes', () => {
    const known = plugin.newRelayDiagnostic()
    plugin.markDiagnosticError(known, 'upstream_fetch', Object.assign(new Error('known'), { code: 'ECONNRESET' }))
    expect(plugin.relayDiagnosticRecord(known)).toMatchObject({
      errorCategory: 'upstream_fetch',
      errorCode: 'ECONNRESET',
      errorMessage: 'upstream fetch failed',
    })

    const unknown = plugin.newRelayDiagnostic()
    plugin.markDiagnosticError(unknown, 'upstream_fetch', Object.assign(new Error('unknown'), {
      code: 'CANARY_SECRET_TOKEN_7E95F4F4',
    }))
    const record = plugin.relayDiagnosticRecord(unknown)
    expect(record).toMatchObject({
      errorCategory: 'upstream_fetch',
      errorMessage: 'upstream fetch failed',
    })
    expect(record).not.toHaveProperty('errorCode')
  })

  it('hashes realistic request-ID canaries before JSONL', async () => {
    const openRouterRequestIdCanary = 'sk-or-v1-' + '0123456789abcdef'.repeat(4)
    const genericApiKeyCanary = 'sk-test-7e95f4f4b1c2d3e4f5a6b7c8d9e0f1a2'
    const requestIdHashes = plugin.sanitizeDiagnosticRequestIds({
      'x-openrouter-id': openRouterRequestIdCanary,
      'x-request-id': genericApiKeyCanary,
    })
    expect(requestIdHashes).toEqual([
      { header: 'x-openrouter-id', requestIdHash: '6f3fc1fd3a97c370' },
      { header: 'x-request-id', requestIdHash: '132a573abf73f20a' },
    ])

    const diagnostic = plugin.newRelayDiagnostic()
    diagnostic.upstreamRequestIdHashes = requestIdHashes
    const jsonl: string[] = []
    const writer = plugin.createBoundedDiagnosticWriter((line) => { jsonl.push(line) })
    expect(writer.enqueue(`${JSON.stringify(plugin.relayDiagnosticRecord(diagnostic))}\n`)).toBe(true)
    await writer.flush()

    const written = jsonl.join('')
    expect(written).not.toContain(openRouterRequestIdCanary)
    expect(written).not.toContain(genericApiKeyCanary)
    expect(JSON.parse(written)).toMatchObject({ upstreamRequestIdHashes: requestIdHashes })
  })

  it('serializes concurrent diagnostic records as parseable JSONL', async () => {
    const written: string[] = []
    let active = 0
    let maxActive = 0
    const writer = plugin.createBoundedDiagnosticWriter(async (line) => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await Promise.resolve()
      written.push(line)
      active -= 1
    }, 32)

    for (let index = 0; index < 25; index += 1) {
      expect(writer.enqueue(`${JSON.stringify({ index })}\n`)).toBe(true)
    }
    expect(writer.pending).toBe(25)
    await writer.flush()

    expect(maxActive).toBe(1)
    expect(written).toHaveLength(25)
    expect(written.every((line) => line.endsWith('\n'))).toBe(true)
    expect(written.map((line) => JSON.parse(line).index)).toEqual(Array.from({ length: 25 }, (_, index) => index))
    expect(writer.pending).toBe(0)
  })

  it('drops diagnostic records above the pending bound', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    let started = 0
    const writer = plugin.createBoundedDiagnosticWriter(async () => {
      started += 1
      await gate
    }, 2)

    expect(writer.enqueue('first\n')).toBe(true)
    expect(writer.enqueue('second\n')).toBe(true)
    expect(writer.enqueue('dropped\n')).toBe(false)
    await Promise.resolve()
    expect(started).toBe(1)
    expect(writer.pending).toBe(2)

    release()
    await writer.flush()
    expect(writer.pending).toBe(0)
  })

  it('aborts upstream when the request closes during body read', async () => {
    const originalFetch = globalThis.fetch
    let upstreamSignal: AbortSignal | undefined
    try {
      globalThis.fetch = async (_input, init) => {
        upstreamSignal = init?.signal ?? undefined
        return await new Promise<Response>((_, reject) => {
          const abort = () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
          if (upstreamSignal?.aborted) abort()
          else upstreamSignal?.addEventListener('abort', abort, { once: true })
        })
      }
      const request = new DeferredBodyRequest()
      const baselineAbortedListeners = request.listenerCount('aborted')
      const baselineCloseListeners = request.listenerCount('close')
      const response = new BackpressuredResponse()
      const diagnostic = plugin.newRelayDiagnostic()

      const forwarding = plugin.relayRequest({}, request as unknown as RelayRequest, response, diagnostic)
      await request.bodyReadStarted

      request.emitIncompleteClose()
      request.finish('{"input":"hello"}')
      await forwarding

      expect(upstreamSignal?.aborted).toBe(true)
      expect(response.statusCode).toBe(502)
      expect(diagnostic.errorCategory).toBe('aborted')
      expect(request.listenerCount('aborted')).toBe(baselineAbortedListeners)
      expect(request.listenerCount('close')).toBe(baselineCloseListeners)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('forwards through drain after a completed request closes', async () => {
    const originalFetch = globalThis.fetch
    try {
      globalThis.fetch = async () => new Response('forwarded upstream', { status: 200 })
      const request = new CompletedCloseRequest('{"input":"hello"}')
      const response = new BackpressuredResponse()
      const diagnostic = plugin.newRelayDiagnostic()

      const forwarding = plugin.relayRequest({}, request, response, diagnostic)
      await response.writeStarted
      expect(request.listenerCount('close')).toBe(2)

      request.emitCompletedClose()
      response.releaseDrain()
      await forwarding
      await new Promise<void>((resolve) => setImmediate(resolve))

      expect(request.closeEmitted).toBe(true)
      expect(request.complete).toBe(true)
      expect(request.aborted).toBe(false)
      expect(response.drainObserved).toBe(true)
      expect(response.statusCode).toBe(200)
      expect(response.headersSent).toBe(true)
      expect(response.writableFinished).toBe(true)
      expect(Buffer.concat(response.chunks).toString('utf8')).toBe('forwarded upstream')
      expect(request.listenerCount('aborted')).toBe(0)
      expect(request.listenerCount('close')).toBe(0)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('aborts upstream when the request closes incomplete', async () => {
    const originalFetch = globalThis.fetch
    let upstreamSignal: AbortSignal | undefined
    let markFetchStarted!: () => void
    const fetchStarted = new Promise<void>((resolve) => { markFetchStarted = resolve })
    try {
      globalThis.fetch = async (_input, init) => {
        upstreamSignal = init?.signal ?? undefined
        markFetchStarted()
        return await new Promise<Response>((_, reject) => {
          const abort = () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
          if (upstreamSignal?.aborted) abort()
          else upstreamSignal?.addEventListener('abort', abort, { once: true })
        })
      }
      const request = new CompletedCloseRequest('{"input":"hello"}')
      const response = new BackpressuredResponse()
      const diagnostic = plugin.newRelayDiagnostic()

      const forwarding = plugin.relayRequest({}, request, response, diagnostic)
      await fetchStarted
      request.complete = false
      request.destroyed = true
      request.emit('close')
      await forwarding

      expect(upstreamSignal?.aborted).toBe(true)
      expect(response.statusCode).toBe(502)
      expect(diagnostic.errorCategory).toBe('aborted')
      expect(request.listenerCount('aborted')).toBe(0)
      expect(request.listenerCount('close')).toBe(0)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('drains after a completed request reports destroyed', async () => {
    const response = Object.assign(new EventEmitter(), { writableNeedDrain: true }) as DrainEventTarget
    const request = Object.assign(new EventEmitter(), {
      complete: true,
      destroyed: true,
      aborted: false,
    }) as DrainRequest
    const controller = new AbortController()

    const pending = plugin.waitForResponseDrain(response, request, controller.signal)
    response.emit('drain')

    await expect(pending).resolves.toBeUndefined()
    expect(response.listenerCount('drain')).toBe(0)
    expect(response.listenerCount('close')).toBe(0)
    expect(response.listenerCount('error')).toBe(0)
    expect(request.listenerCount('aborted')).toBe(0)
    expect(request.listenerCount('close')).toBe(0)
  })

  it('settles drain waits on success, response termination, and abort', async () => {
    const successfulResponse = Object.assign(new EventEmitter(), { writableNeedDrain: true }) as DrainEventTarget
    const successfulRequest = new EventEmitter()
    const successfulController = new AbortController()
    const successful = plugin.waitForResponseDrain(successfulResponse, successfulRequest, successfulController.signal)
    successfulResponse.emit('drain')
    await expect(successful).resolves.toBeUndefined()
    expect(successfulResponse.listenerCount('drain')).toBe(0)
    expect(successfulRequest.listenerCount('aborted')).toBe(0)

    const closedResponse = Object.assign(new EventEmitter(), { writableNeedDrain: true }) as DrainEventTarget
    const closedRequest = new EventEmitter()
    const closedController = new AbortController()
    const closed = plugin.waitForResponseDrain(closedResponse, closedRequest, closedController.signal)
    closedResponse.emit('close')
    await expect(closed).rejects.toThrow('response closed before drain')
    expect(closedResponse.listenerCount('close')).toBe(0)
    expect(closedRequest.listenerCount('close')).toBe(0)

    const incompleteClosedResponse = Object.assign(new EventEmitter(), { writableNeedDrain: true }) as DrainEventTarget
    const incompleteClosedRequest = Object.assign(new EventEmitter(), {
      complete: false,
      destroyed: true,
      aborted: false,
    }) as DrainRequest
    const incompleteClosedController = new AbortController()
    const incompleteClosed = plugin.waitForResponseDrain(
      incompleteClosedResponse,
      incompleteClosedRequest,
      incompleteClosedController.signal,
    )
    incompleteClosedRequest.emit('close')
    await expect(incompleteClosed).rejects.toThrow('request aborted before drain')
    expect(incompleteClosedResponse.listenerCount('drain')).toBe(0)
    expect(incompleteClosedRequest.listenerCount('close')).toBe(0)

    const erroredResponse = Object.assign(new EventEmitter(), { writableNeedDrain: true }) as DrainEventTarget
    const erroredRequest = new EventEmitter()
    const erroredController = new AbortController()
    const errored = plugin.waitForResponseDrain(erroredResponse, erroredRequest, erroredController.signal)
    erroredResponse.emit('error', new Error('socket failed'))
    await expect(errored).rejects.toThrow('response closed before drain')
    expect(erroredResponse.listenerCount('error')).toBe(0)

    const abortedResponse = Object.assign(new EventEmitter(), { writableNeedDrain: true }) as DrainEventTarget
    const abortedRequest = new EventEmitter()
    const abortedController = new AbortController()
    const aborted = plugin.waitForResponseDrain(abortedResponse, abortedRequest, abortedController.signal)
    abortedController.abort()
    await expect(aborted).rejects.toThrow('request aborted before drain')
    expect(abortedResponse.listenerCount('drain')).toBe(0)
    expect(abortedRequest.listenerCount('aborted')).toBe(0)
  })
})
