import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

type Model = Record<string, unknown>
const plugin = await import(new URL('../packages/dsh-openrouter-sync/lib/index.js', import.meta.url).href) as {
  buildModelEntries: (live: Model[], configured: Model[]) => Model[]
  refreshOpenRouter: (ctx: unknown) => Promise<{ ok: boolean }>
  maybeAutoRefresh: (ctx: unknown) => Promise<void>
}
const roots: string[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})
async function context(state: Model = {}) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-efforts-'))
  roots.push(root)
  vi.stubEnv('DSH_HOME', root)
  await writeFile(join(root, 'openrouter-sync.json'), JSON.stringify(state))
  const route = { models: [{ id: 'vendor/one', compat: { keep: true } }] as Model[], apiKey: 'test-key' }
  const document = { 'llm-pi-ai': { providers: { openrouter: route, other: { untouched: true } } }, unrelated: { keep: true } }
  const update = vi.fn(async (_namespace: string, patch: { providers: { openrouter: { models: Model[] } } }) => { route.models = patch.providers.openrouter.models })
  const ctx = { settings: { document, writable: true, update }, logger: { warn: vi.fn(), info: vi.fn() } }
  return { root, route, document, update, ctx }
}
function response(data: Model[]) { return new Response(JSON.stringify({ data }), { status: 200 }) }

describe('automatic OpenRouter reasoning metadata', () => {
  it('imports the advertised Muse route fixtures and unrelated models generically', () => {
    // OpenRouter /api/v1/models snapshot, 2026-09-20: both routes advertise max.
    const reasoning = { mandatory: true, supported_efforts: ['max', 'xhigh', 'high', 'medium', 'low', 'minimal'], default_effort: 'medium' }
    const rows = plugin.buildModelEntries([
      { id: 'meta/muse-spark-1.3', reasoning },
      { id: 'meta/muse-spark-1.3-contributor', reasoning },
      { id: 'other/alpha', reasoning: { supported_efforts: ['low', 'high'] } },
      { id: 'another/beta', reasoning: { supported_efforts: ['minimal', 'xhigh'] } },
    ], [])
    const byId = Object.fromEntries(rows.map(row => [row.id as string, row]))
    for (const id of ['meta/muse-spark-1.3', 'meta/muse-spark-1.3-contributor']) {
      expect(byId[id]?.reasoningEfforts).toEqual({ minimal: 'minimal', low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max' })
      expect(byId[id]).not.toHaveProperty('default_effort')
    }
    expect(byId['other/alpha']?.reasoningEfforts).toEqual({ low: 'low', high: 'high' })
    expect(byId['another/beta']?.reasoningEfforts).toEqual({ minimal: 'minimal', xhigh: 'xhigh' })
  })

  it('maps none to off only when optional and ignores unrecognized values', () => {
    expect(plugin.buildModelEntries([{ id: 'a', reasoning: { supported_efforts: ['none', 'high', 'future', null, {}, 'high'] } }], [])[0]?.reasoningEfforts).toEqual({ off: 'none', high: 'high' })
    expect(plugin.buildModelEntries([{ id: 'a', reasoning: { mandatory: true, supported_efforts: ['none', 'high'] } }], [])[0]?.reasoningEfforts).toEqual({ high: 'high' })
  })

  it('keeps fallback for missing, malformed, empty, unknown and mandatory-none metadata', () => {
    for (const reasoning of [undefined, null, [], 'bad', {}, { supported_efforts: 'high' }, { supported_efforts: [] }, { supported_efforts: ['none'] }, { mandatory: 'false', supported_efforts: ['none', 'high'] }, { supported_efforts: ['future'] }, { mandatory: true, supported_efforts: ['none'] }]) {
      const live = [{ id: 'a', reasoning, supported_parameters: ['reasoning', 'reasoning_effort'] }]
      expect(plugin.buildModelEntries(live, [])[0]).not.toHaveProperty('reasoningEfforts')
      expect(plugin.buildModelEntries(live, [{ id: 'a', reasoningEfforts: { high: 'custom' } }])[0]?.reasoningEfforts).toEqual({ high: 'custom' })
    }
  })

  it('replaces stale maps wholesale while preserving false and configured-only entries', () => {
    const live = [{ id: 'a', reasoning: { supported_efforts: ['high'] } }, { id: 'b', reasoning: { supported_efforts: ['max'] } }]
    const extra = { id: 'manual', reasoningEfforts: { low: 'custom' }, input: ['image'] }
    const first = plugin.buildModelEntries(live, [{ id: 'a', reasoningEfforts: { low: 'custom', off: null }, compat: { keep: true } }, { id: 'b', reasoningEfforts: false }, extra])
    expect(first).toEqual([{ id: 'a', reasoningEfforts: { high: 'high' }, compat: { keep: true } }, { id: 'b', reasoningEfforts: false }, extra])
    expect(plugin.buildModelEntries([{ id: 'a', reasoning: { supported_efforts: ['max'] } }], first)[0]?.reasoningEfforts).toEqual({ max: 'max' })
  })

  it('uses current settings after the fetch and preserves unrelated settings through refresh', async () => {
    const { ctx, route, document, update } = await context()
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      route.models = [{ id: 'vendor/one', compat: { edited: true } }, { id: 'manual', reasoningEfforts: false }]
      return response([{ id: 'vendor/one', reasoning: { supported_efforts: ['high'] } }])
    })
    expect((await plugin.refreshOpenRouter(ctx)).ok).toBe(true)
    expect(route.models).toEqual([{ id: 'vendor/one', compat: { edited: true }, reasoningEfforts: { high: 'high' } }, { id: 'manual', reasoningEfforts: false }])
    expect(update).toHaveBeenCalledWith('llm-pi-ai', { providers: { openrouter: { models: route.models } } })
    expect(route.apiKey).toBe('test-key')
    expect(document.unrelated).toEqual({ keep: true })
    expect(document['llm-pi-ai'].providers.other).toEqual({ untouched: true })
  })

  it('backfills recent caches once, then honors the refresh cadence', async () => {
    const { ctx, root, route } = await context({ costsAt: new Date().toISOString(), lastRunAt: new Date().toISOString() })
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => response([{ id: 'vendor/one', reasoning: { supported_efforts: ['high'] } }]))
    await plugin.maybeAutoRefresh(ctx)
    expect(route.models[0]?.reasoningEfforts).toEqual({ high: 'high' })
    expect(JSON.parse(await readFile(join(root, 'openrouter-sync.json'), 'utf8')).reasoningMetadataVersion).toBe(1)
    await plugin.maybeAutoRefresh(ctx)
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('preserves auto-refresh opt-out', async () => {
    const { ctx } = await context({ auto: false })
    const fetch = vi.spyOn(globalThis, 'fetch')
    await plugin.maybeAutoRefresh(ctx)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('does not mark failed settings writes complete and retries the backfill', async () => {
    const { ctx, root, update } = await context({ costsAt: new Date().toISOString(), lastRunAt: new Date().toISOString() })
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => response([{ id: 'vendor/one', reasoning: { supported_efforts: ['high'] } }]))
    update.mockRejectedValueOnce(new Error('write failed'))
    await plugin.maybeAutoRefresh(ctx)
    expect(JSON.parse(await readFile(join(root, 'openrouter-sync.json'), 'utf8'))).not.toHaveProperty('reasoningMetadataVersion')
    await plugin.maybeAutoRefresh(ctx)
    expect(update).toHaveBeenCalledTimes(2)
  })
})
