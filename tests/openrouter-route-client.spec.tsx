// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import * as React from 'react'

type BundleDefinition = {
  readonly factory: (require: (id: string) => unknown) => { readonly apply: (ctx: Record<string, unknown>) => void }
}
type Chip = (props: Record<string, unknown>) => React.ReactNode
type Current = { readonly provider: string, readonly model: string } | null

afterEach(() => {
  cleanup()
  document.querySelector('style[data-plugin-css="dsh-openrouter-route"]')?.remove()
  vi.restoreAllMocks()
})

function createStore<T>(initial: T): { readonly subscribe: (fn: () => void) => () => void, readonly getSnapshot: () => T, readonly set: (next: T) => void } {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    subscribe: (fn) => { listeners.add(fn); return () => { listeners.delete(fn) } },
    getSnapshot: () => value,
    set: (next) => { value = next; for (const fn of [...listeners]) fn() },
  }
}

async function loadChip(fetchMock: ReturnType<typeof vi.fn>, directoryStore: ReturnType<typeof createStore<{ current: Current }>>): Promise<Chip> {
  const source = await readFile(resolve('packages/dsh-openrouter-route/lib/client.cjs'), 'utf8')
  let definition: BundleDefinition | undefined
  Object.defineProperty(window, '__ModuleLoader__', {
    configurable: true,
    value: { load: (next: BundleDefinition) => { definition = next } },
  })
  Object.defineProperty(window, 'fetch', { configurable: true, writable: true, value: fetchMock })
  window.eval(source)
  if (definition === undefined) throw new Error('openrouter route bundle did not register')
  const bundle = definition.factory((id) => {
    if (id === 'react') return React
    throw new Error(`unexpected client dependency: ${id}`)
  })
  let chip: Chip | undefined
  const sessionList = createStore({ current: 'session-1', byId: { 'session-1': { running: false } } })
  bundle.apply({
    sessions: { list: sessionList },
    modelDirectories: { directoryFor: () => ({ store: directoryStore }) },
    slots: {
      inject: (_name: string, install: () => void) => { install() },
      register: (_config: unknown, component: Chip) => { chip = component; return () => undefined },
    },
  })
  if (chip === undefined) throw new Error('provider chip was not registered')
  return chip
}

function statusResponse(selection: string): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ ok: true, value: { selection, wired: true, providers: [{ name: 'Alpha', input: 1, output: 2 }] } }),
  } as Response
}

describe('dsh-openrouter-route provider chip', () => {
  it('follows the model directory store without an owner re-render', async () => {
    const directoryStore = createStore<{ current: Current }>({ current: null })
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => statusResponse('Alpha'))
    const ChipComponent = await loadChip(fetchMock, directoryStore)
    render(React.createElement(ChipComponent, { session: { id: 'session-1' } }))
    expect(screen.queryByRole('button', { name: 'OpenRouter provider' })).toBeNull()

    act(() => { directoryStore.set({ current: { provider: 'openrouter', model: 'vendor/model' } }) })
    await screen.findByText('Alpha')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('model=vendor%2Fmodel')

    act(() => { directoryStore.set({ current: { provider: 'other', model: 'x' } }) })
    await waitFor(() => expect(screen.queryByRole('button', { name: 'OpenRouter provider' })).toBeNull())
  })

  it('shares one in-flight status read between chips for the same model', async () => {
    const directoryStore = createStore<{ current: Current }>({ current: { provider: 'openrouter', model: 'vendor/model' } })
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => statusResponse('Alpha'))
    const ChipComponent = await loadChip(fetchMock, directoryStore)
    render(React.createElement(React.Fragment, null,
      React.createElement(ChipComponent, { key: 'a', session: { id: 'session-1' } }),
      React.createElement(ChipComponent, { key: 'b', session: { id: 'session-1' } })))
    await waitFor(() => expect(screen.getAllByText('Alpha')).toHaveLength(2))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
