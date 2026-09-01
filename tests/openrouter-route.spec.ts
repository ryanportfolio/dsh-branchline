import { describe, expect, it } from 'vitest'
import { Readable } from 'node:stream'

type OpenRouterRouteModule = {
  readonly MAX_REQUEST_BYTES: number
  readonly RequestBodyTooLargeError: new (limit: number) => Error & { readonly limit: number }
  readonly providerRoutingFor: (selection: string) => Record<string, unknown>
  readonly readBody: (request: Readable, maxBytes?: number) => Promise<Buffer>
  readonly relayFailureFor: (error: unknown) => {
    readonly status: number
    readonly body: { readonly error: { readonly message: string } }
  }
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
  })
})
