// @vitest-environment jsdom

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import * as React from 'react'

type Model = { readonly id: string, readonly name: string, readonly description?: string }
type Group = { readonly id: string, readonly name: string, readonly models: readonly Model[] }
type DirectoryState = {
  readonly groups: readonly Group[]
  readonly current: null
  readonly status: 'ready'
  readonly error: null
  readonly failures: readonly unknown[]
}
type PickerProps = {
  readonly locked: boolean
  readonly available: boolean
  readonly directory: { readonly subscribe: (listener: () => void) => () => void, readonly getSnapshot: () => DirectoryState }
  readonly load: () => void
  readonly select: () => Promise<boolean>
  readonly sessions: { readonly list: { readonly subscribe: (listener: () => void) => () => void, readonly getSnapshot: () => { readonly byId: Record<string, unknown> } } }
  readonly sessionId: string
}
type Picker = (props: PickerProps) => React.ReactNode
type Component = (props: Record<string, unknown>) => React.ReactNode
type BundleDefinition = {
  readonly factory: (require: (id: string) => unknown) => { readonly apply: (ctx: Record<string, unknown>) => void }
}

let source = ''

beforeAll(async () => {
  source = await readFile(resolve('packages/dsh-session-extras/lib/client.cjs'), 'utf8')
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  document.querySelector('style[data-plugin-css="dsh-session-extras"]')?.remove()
  vi.restoreAllMocks()
})

function jsonResponse(value: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 503,
    json: async () => value,
  } as Response
}

function loadPicker(fetchMock: ReturnType<typeof vi.fn>): Picker {
  let definition: BundleDefinition | undefined
  Object.defineProperty(window, '__ModuleLoader__', {
    configurable: true,
    value: { load: (next: BundleDefinition) => { definition = next } },
  })
  Object.defineProperty(window, 'fetch', { configurable: true, writable: true, value: fetchMock })
  window.eval(source)
  if (definition === undefined) throw new Error('session extras bundle did not register')
  const bundle = definition.factory((id) => {
    if (id === 'react') return React
    throw new Error(`unexpected client dependency: ${id}`)
  })
  let picker: Picker | undefined
  const slots = {
    inject: (_name: string, install: () => void) => { install() },
    register: (config: { readonly name: string }, component: Picker) => {
      if (config.name === 'conversation.input.model') picker = component
      return () => undefined
    },
  }
  bundle.apply({
    slots,
    sessions: {},
    conversation: {},
    modelDirectories: {},
  })
  if (picker === undefined) throw new Error('model picker slot was not registered')
  return picker
}

function pickerProps(groups: readonly Group[]): PickerProps {
  const snapshot: DirectoryState = { groups, current: null, status: 'ready', error: null, failures: [] }
  return {
    locked: false,
    available: true,
    directory: { subscribe: () => () => undefined, getSnapshot: () => snapshot },
    load: vi.fn(),
    select: vi.fn().mockResolvedValue(true),
    sessions: { list: { subscribe: () => () => undefined, getSnapshot: () => ({ byId: {} }) } },
    sessionId: 'session-1',
  }
}

async function openModelPane(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: 'Select model' }))
  fireEvent.click(screen.getByRole('menuitem'))
  await screen.findByRole('button', { name: '256k' })
}

describe('dsh-session-extras OpenRouter metadata', () => {
  it('defaults to 256,000 tokens and scopes filtering and costs to OpenRouter', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('dsh-openrouter-sync')) {
        return jsonResponse({
          ok: true,
          value: {
            costs: {
              'vendor/qualifies': { input: 1.25, output: 2.5 },
              'vendor/below': { input: 99, output: 99 },
              'vendor/malformed': null,
            },
            contexts: {
              'vendor/below': 255999,
              'vendor/qualifies': 256000,
              'vendor/million': 1000000,
              'vendor/malformed': 256000,
            },
          },
        })
      }
      return jsonResponse({ ok: true, value: null })
    })
    const PickerComponent = loadPicker(fetchMock)
    render(React.createElement(PickerComponent, pickerProps([
      {
        id: 'openrouter',
        name: 'OpenRouter',
        models: [
          { id: 'vendor/below', name: 'Below threshold' },
          { id: 'vendor/qualifies', name: 'At threshold' },
          { id: 'vendor/million', name: 'One million' },
          { id: 'vendor/malformed', name: 'Malformed cost' },
          { id: 'vendor/unknown', name: 'Unknown context' },
        ],
      },
      {
        id: 'other',
        name: 'Other provider',
        models: [{ id: 'vendor/below', name: 'Other provider collision' }],
      },
    ])))

    await openModelPane()

    expect((screen.getByRole('button', { name: '256k' }) as HTMLButtonElement).ariaPressed).toBe('true')
    expect(screen.queryByText('Below threshold')).toBeNull()
    expect(screen.getByText('At threshold')).toBeTruthy()
    expect(screen.getByText('One million')).toBeTruthy()
    expect(screen.getByText('Other provider collision')).toBeTruthy()
    expect(screen.queryByText('Unknown context')).toBeNull()
    expect(screen.getByText('2 hidden')).toBeTruthy()
    const cost = screen.getByTitle('Input / output cost per 1M tokens (OpenRouter)')
    expect(cost.textContent).toBe('I 1.25 · O 2.50')
    expect([...cost.querySelectorAll('strong')].map((node) => node.textContent)).toEqual(['1.25', '2.50'])
    expect(screen.queryByText('I 99 · O 99')).toBeNull()
    expect(screen.getByText('Malformed cost')).toBeTruthy()
  })

  it('shows unavailable state and retries metadata without remounting', async () => {
    let attempts = 0
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (!String(input).includes('dsh-openrouter-sync')) return jsonResponse({ ok: true, value: null })
      attempts += 1
      if (attempts === 1) return jsonResponse({ ok: false, error: { code: 'unavailable', message: 'not ready' } }, false)
      return jsonResponse({ ok: true, value: { costs: {}, contexts: { 'vendor/model': 256000 } } })
    })
    const PickerComponent = loadPicker(fetchMock)
    render(React.createElement(PickerComponent, pickerProps([
      { id: 'openrouter', name: 'OpenRouter', models: [{ id: 'vendor/model', name: 'Model' }] },
    ])))

    fireEvent.click(screen.getByRole('button', { name: 'Select model' }))
    fireEvent.click(screen.getByRole('menuitem'))
    await screen.findByText('Context data unavailable')
    expect(screen.queryByRole('button', { name: '256k' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    await screen.findByRole('button', { name: '256k' })
    expect(attempts).toBe(2)
  })

  it('refetches metadata whenever the model pane is re-entered', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('dsh-openrouter-sync')) {
        return jsonResponse({ ok: true, value: { costs: {}, contexts: { 'vendor/model': 256000 } } })
      }
      return jsonResponse({ ok: true, value: null })
    })
    const PickerComponent = loadPicker(fetchMock)
    render(React.createElement(PickerComponent, pickerProps([
      { id: 'openrouter', name: 'OpenRouter', models: [{ id: 'vendor/model', name: 'Model' }] },
    ])))

    await openModelPane()
    fireEvent.keyDown(screen.getByRole('menu', { name: 'Model and reasoning effort' }), { key: 'Escape' })
    fireEvent.click(screen.getByRole('menuitem'))

    await waitFor(() => {
      const metadataCalls = fetchMock.mock.calls.filter(([input]) => String(input).includes('dsh-openrouter-sync'))
      expect(metadataCalls).toHaveLength(2)
    })
  })

  it('offers permanent delete on archived rows and reloads after a deletion event', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      ok: true,
      value: { sessions: [{ id: 'session-a', title: 'Pinned work', workspaceName: 'repo' }] },
    }))
    let definition: BundleDefinition | undefined
    Object.defineProperty(window, '__ModuleLoader__', {
      configurable: true,
      value: { load: (next: BundleDefinition) => { definition = next } },
    })
    Object.defineProperty(window, 'fetch', { configurable: true, writable: true, value: fetchMock })
    window.eval(source)
    if (definition === undefined) throw new Error('session extras bundle did not register')
    const bundle = definition.factory((id) => {
      if (id === 'react') return React
      throw new Error(`unexpected client dependency: ${id}`)
    })
    let settingsPage: Component | undefined
    bundle.apply({
      slots: {
        inject: (_name: string, install: () => void) => { install() },
        register: (config: { readonly name: string }, component: Component) => {
          if (config.name === 'settings.section') settingsPage = component
          return () => undefined
        },
      },
      sessions: {},
      conversation: {},
      modelDirectories: {},
    })
    if (settingsPage === undefined) throw new Error('archived settings page was not registered')
    render(React.createElement(settingsPage, {}))
    await screen.findByText('Pinned work')

    const seen: string[] = []
    const listener = (event: Event): void => {
      seen.push((event as CustomEvent).detail.sessionId as string)
    }
    window.addEventListener('dsh-session-delete:confirm', listener)
    fireEvent.click(screen.getByRole('button', { name: 'Delete session: Pinned work' }))
    window.removeEventListener('dsh-session-delete:confirm', listener)
    expect(seen).toEqual(['session-a'])

    window.dispatchEvent(new CustomEvent('dsh-session-deleted', { detail: { sessionId: 'session-a' } }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  })
})
