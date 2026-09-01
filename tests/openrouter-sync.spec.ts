import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'

type OpenRouterSyncModule = {
  readonly apply: (ctx: Record<string, unknown>) => void
  readonly buildModelEntries: (
    live: readonly Record<string, unknown>[],
    configured: readonly Record<string, unknown>[],
  ) => readonly Record<string, unknown>[]
  readonly maybeAutoRefresh: (ctx: Record<string, unknown>) => Promise<void>
  readonly costsOf: (live: readonly Record<string, unknown>[]) => Record<string, { readonly input?: number, readonly output?: number }>
  readonly contextsOf: (live: readonly Record<string, unknown>[]) => Record<string, number>
  readonly modelMetadataOf: (
    ctx: Record<string, unknown>,
    state: Record<string, unknown>,
  ) => { readonly costs: Record<string, unknown>, readonly contexts: Record<string, number>, readonly at: string | null }
}

const plugin = await import(new URL('../packages/dsh-openrouter-sync/lib/index.js', import.meta.url).href) as OpenRouterSyncModule
const temporaryRoots: string[] = []

afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  await Promise.all(temporaryRoots.splice(0).map(async (root) => { await rm(root, { recursive: true, force: true }) }))
})

function settingsContext(models: readonly Record<string, unknown>[]): Record<string, unknown> {
  return {
    settings: {
      document: {
        'llm-pi-ai': {
          providers: {
            openrouter: { models },
          },
        },
      },
    },
  }
}

describe('dsh-openrouter-sync metadata', () => {
  it('maps supported input modalities and preserves configured-only fields', () => {
    const configured = [
      { id: 'vendor/vision', name: 'Old name', input: ['text'], compat: 'keep-me', contextWindow: 128000 },
      { id: 'vendor/unknown', input: ['text', 'image'], compat: 'also-keep' },
      { id: 'vendor/text', input: ['text', 'image'] },
      { id: 'vendor/manual', name: 'Manual model', input: ['image'] },
    ]
    const live = [
      {
        id: 'vendor/vision',
        name: 'Vision model',
        created: 30,
        context_length: 256000,
        architecture: { input_modalities: ['text', 'image', 'audio'] },
      },
      { id: 'vendor/unknown', created: 20, context_length: 512000 },
      { id: 'vendor/text', created: 10, architecture: { input_modalities: ['text'] } },
    ]

    expect(plugin.buildModelEntries(live, configured)).toEqual([
      {
        id: 'vendor/vision',
        name: 'Vision model',
        input: ['text', 'image'],
        compat: 'keep-me',
        contextWindow: 256000,
      },
      {
        id: 'vendor/unknown',
        input: ['text', 'image'],
        compat: 'also-keep',
        contextWindow: 512000,
      },
      { id: 'vendor/text', input: ['text'] },
      { id: 'vendor/manual', name: 'Manual model', input: ['image'] },
    ])
  })

  it('converts usable OpenRouter costs and contexts', () => {
    const live = [
      { id: 'vendor/valid', context_length: 256000, pricing: { prompt: '0.0000015', completion: 0.000002 } },
      { id: 'vendor/partial', context_length: -1, pricing: { prompt: 'invalid', completion: '0' } },
      { id: '', context_length: 1000000, pricing: { prompt: '1' } },
    ]

    expect(plugin.costsOf(live)).toEqual({
      'vendor/valid': { input: 1.5, output: 2 },
      'vendor/partial': { output: 0 },
    })
    expect(plugin.contextsOf(live)).toEqual({ 'vendor/valid': 256000 })
  })

  it('normalizes cached rows and fills missing contexts from configured models', () => {
    const ctx = settingsContext([
      { id: 'vendor/configured', contextWindow: 256000 },
      { id: 'vendor/overridden', contextWindow: 128000 },
      { id: 'vendor/invalid', contextWindow: 0 },
    ])

    expect(plugin.modelMetadataOf(ctx, {
      costs: {
        'vendor/configured': { input: 1, output: 2 },
        'vendor/null': null,
        'vendor/negative': { input: -1 },
        'vendor/partial': { output: 3 },
      },
      contexts: {
        'vendor/overridden': 1000000,
        'vendor/bad': '256000',
      },
      costsAt: '2026-08-26T00:00:00.000Z',
    })).toEqual({
      costs: {
        'vendor/configured': { input: 1, output: 2 },
        'vendor/partial': { output: 3 },
      },
      contexts: {
        'vendor/configured': 256000,
        'vendor/overridden': 1000000,
      },
      at: '2026-08-26T00:00:00.000Z',
    })
  })

  it('serves empty-cache metadata without contacting OpenRouter', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-openrouter-sync-'))
    temporaryRoots.push(root)
    await writeFile(join(root, 'openrouter-sync.json'), '{}', 'utf8')
    vi.stubEnv('DSH_HOME', root)
    const liveFetch = vi.spyOn(globalThis, 'fetch')
    let handler: ((request: Readable & Record<string, unknown>, response: Record<string, unknown>) => Promise<void>) | undefined
    const ctx = {
      ...settingsContext([{ id: 'vendor/configured', contextWindow: 256000 }]),
      logger: { warn: vi.fn(), info: vi.fn() },
      timer: { timeout: vi.fn(), interval: vi.fn() },
      inject: (_deps: readonly string[], callback: (webCtx: Record<string, unknown>) => void) => {
        const webCtx: Record<string, unknown> = {
          ...ctx,
          effect: (effect: () => unknown) => effect(),
          webServer: {
            register: (route: { readonly handler: typeof handler }) => {
              handler = route.handler
              return () => undefined
            },
          },
        }
        callback(webCtx)
      },
    }
    plugin.apply(ctx)
    expect(handler).toBeTypeOf('function')

    const request = Readable.from([]) as Readable & Record<string, unknown>
    request.method = 'GET'
    request.url = '/api/dsh-openrouter-sync?op=costs'
    request.headers = { host: 'localhost:31415', origin: 'http://localhost:31415', 'sec-fetch-site': 'same-origin' }
    request.socket = { remoteAddress: '127.0.0.1' }
    let status = 0
    let body = ''
    const response = {
      writeHead: (nextStatus: number) => { status = nextStatus },
      end: (chunk: string) => { body = chunk },
    }

    await handler?.(request, response)

    expect(status).toBe(200)
    expect(JSON.parse(body)).toEqual({
      ok: true,
      value: {
        costs: {},
        contexts: { 'vendor/configured': 256000 },
        at: null,
      },
    })
    expect(liveFetch).not.toHaveBeenCalled()
  })

  it('backfills prices when recent legacy state has no metadata cache', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-openrouter-sync-'))
    temporaryRoots.push(root)
    await writeFile(join(root, 'openrouter-sync.json'), JSON.stringify({
      lastRunAt: new Date().toISOString(),
      lastRunCount: 1,
    }), 'utf8')
    vi.stubEnv('DSH_HOME', root)
    const liveFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      data: [{
        id: 'vendor/model',
        name: 'Vendor Model',
        created: 123,
        context_length: 256000,
        pricing: { prompt: '0.000001', completion: '0.000002' },
        top_provider: { max_completion_tokens: 4096 },
      }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    const update = vi.fn().mockResolvedValue(undefined)
    const base = settingsContext([{
      id: 'vendor/model',
      name: 'Vendor Model',
      contextWindow: 256000,
      maxTokens: 4096,
    }])
    const ctx = {
      ...base,
      settings: { ...(base.settings as Record<string, unknown>), writable: true, update },
      logger: { warn: vi.fn(), info: vi.fn() },
    }

    await plugin.maybeAutoRefresh(ctx)

    expect(liveFetch).toHaveBeenCalledOnce()
    expect(update).not.toHaveBeenCalled()
    const state = JSON.parse(await readFile(join(root, 'openrouter-sync.json'), 'utf8')) as Record<string, unknown>
    expect(state.costs).toEqual({ 'vendor/model': { input: 1, output: 2 } })
    expect(state.contexts).toEqual({ 'vendor/model': 256000 })
    expect(state.costsAt).toEqual(expect.any(String))
  })
})
