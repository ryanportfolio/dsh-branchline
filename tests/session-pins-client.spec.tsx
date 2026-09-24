// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import * as React from 'react'

type BundleDefinition = {
  readonly factory: (require: (id: string) => unknown) => { readonly apply: (ctx: Record<string, unknown>) => void }
}

afterEach(() => {
  document.querySelector('style[data-plugin-css="dsh-session-pins"]')?.remove()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

async function loadPins(fetchMock: ReturnType<typeof vi.fn>): Promise<{ readonly dispose: () => void }> {
  const source = await readFile(resolve('packages/dsh-session-pins/lib/client.cjs'), 'utf8')
  let definition: BundleDefinition | undefined
  Object.defineProperty(window, '__ModuleLoader__', {
    configurable: true,
    value: { load: (next: BundleDefinition) => { definition = next } },
  })
  Object.defineProperty(window, 'fetch', { configurable: true, writable: true, value: fetchMock })
  window.eval(source)
  if (definition === undefined) throw new Error('session pins bundle did not register')
  const bundle = definition.factory((id) => {
    if (id === 'react') return React
    throw new Error(`unexpected client dependency: ${id}`)
  })
  const disposers: (() => void)[] = []
  bundle.apply({
    sessions: {},
    effect: (fn: () => (() => void) | void) => {
      const dispose = fn()
      if (typeof dispose === 'function') disposers.push(dispose)
    },
    slots: {
      inject: (_name: string, install: () => void) => { install() },
      register: () => () => undefined,
    },
  })
  return { dispose: () => { for (const dispose of disposers) dispose() } }
}

describe('dsh-session-pins focus refresh', () => {
  it('throttles focus refetches, skips hidden windows, and detaches on dispose', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(1_000_000)
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true, value: { pins: [] } }) }))
    const plugin = await loadPins(fetchMock)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    window.dispatchEvent(new Event('focus'))
    expect(fetchMock).toHaveBeenCalledTimes(1)

    vi.setSystemTime(1_000_000 + 30_000)
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    window.dispatchEvent(new Event('focus'))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    hidden.mockRestore()

    window.dispatchEvent(new Event('focus'))
    expect(fetchMock).toHaveBeenCalledTimes(2)

    plugin.dispose()
    vi.setSystemTime(1_000_000 + 120_000)
    window.dispatchEvent(new Event('focus'))
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
