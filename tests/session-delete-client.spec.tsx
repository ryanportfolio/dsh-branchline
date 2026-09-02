// @vitest-environment jsdom

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import * as React from 'react'

const SESSION = 'session-11111111-1111-4111-8111-111111111111'

type Component = (props: any) => React.ReactNode
type BundleDefinition = {
  readonly factory: (require: (id: string) => unknown) => { readonly apply: (ctx: Record<string, unknown>) => void }
}

let source = ''

beforeAll(async () => {
  source = await readFile(resolve('packages/dsh-session-delete/lib/client.cjs'), 'utf8')
})

afterEach(() => {
  cleanup()
  document.querySelector('style[data-plugin-css="dsh-session-delete"]')?.remove()
  vi.restoreAllMocks()
})

function jsonResponse(value: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 409,
    json: async () => value,
  } as Response
}

function loadBundle(fetchMock: ReturnType<typeof vi.fn>): {
  readonly headerAction: Component
  readonly overlay: Component
  readonly refresh: ReturnType<typeof vi.fn>
} {
  let definition: BundleDefinition | undefined
  Object.defineProperty(window, '__ModuleLoader__', {
    configurable: true,
    value: { load: (next: BundleDefinition) => { definition = next } },
  })
  Object.defineProperty(window, 'fetch', { configurable: true, writable: true, value: fetchMock })
  window.eval(source)
  if (definition === undefined) throw new Error('session delete bundle did not register')
  const bundle = definition.factory((id) => {
    if (id === 'react') return React
    throw new Error(`unexpected client dependency: ${id}`)
  })
  const registered = new Map<string, Component>()
  const refresh = vi.fn(async () => undefined)
  const slots = {
    inject: (_name: string, install: () => void) => { install() },
    register: (config: { readonly name: string }, component: Component) => {
      registered.set(config.name, component)
      return () => undefined
    },
  }
  const ctx = {
    slots,
    workspaces: { refresh },
    effect: (fn: () => unknown) => fn(),
  }
  bundle.apply(ctx)
  const headerAction = registered.get('conversation.session.header.actions')
  const overlay = registered.get('shell.overlay')
  if (headerAction === undefined || overlay === undefined) throw new Error('session delete slots were not registered')
  return { headerAction, overlay, refresh }
}

describe('dsh-session-delete client', () => {
  it('renders the header action only with a session id and opens the dialog from it', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse({
      ok: true,
      value: { sessionId: SESSION, title: 'Purge me', cwd: '', live: false, worktree: null },
    }))
    const { headerAction, overlay } = loadBundle(fetchMock)

    const { container } = render(React.createElement(headerAction, {}))
    expect(container.textContent).toBe('')

    render(React.createElement(headerAction, { sessionId: SESSION }))
    render(React.createElement(overlay, {}))
    fireEvent.click(screen.getByRole('button', { name: 'Delete session permanently' }))

    await screen.findByText('No worktree attached. Only the session log and registry metadata will be removed.')
    expect(fetchMock.mock.calls[0]?.[1]?.body).toContain('"op":"preview"')
  })

  it('deletes from the dialog and refreshes workspaces on success', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = String(init?.body ?? '')
      if (body.includes('"op":"preview"')) {
        return jsonResponse({
          ok: true,
          value: { sessionId: SESSION, title: 'Purge me', cwd: 'C:\\wt', live: false, worktree: null },
        })
      }
      return jsonResponse({ ok: true, value: { sessionId: SESSION, worktree: null } })
    })
    const { headerAction, overlay, refresh } = loadBundle(fetchMock)
    render(React.createElement(headerAction, { sessionId: SESSION }))
    render(React.createElement(overlay, {}))
    fireEvent.click(screen.getByRole('button', { name: 'Delete session permanently' }))

    await screen.findByText('Purge me')
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }))

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
    const deleteCall = fetchMock.mock.calls.find(([, init]) => String(init?.body ?? '').includes('"op":"delete"'))
    expect(deleteCall).toBeDefined()
    expect(deleteCall?.[1]?.body).toContain(`"confirmation":"${SESSION}"`)
    await waitFor(() => expect(screen.queryByText('Delete session')).toBeNull())
  })

  it('lists blockers and offers force deletion when the worktree blocks removal', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = String(init?.body ?? '')
      if (body.includes('"op":"preview"')) {
        return jsonResponse({
          ok: true,
          value: {
            sessionId: SESSION,
            title: 'Purge me',
            cwd: 'C:\\wt',
            live: false,
            worktree: {
              taskId: 'wt-22222222-2222-4222-8222-222222222222',
              title: 'Task',
              path: 'C:\\wt',
              branch: 'dsh/task',
              repository: 'C:\\repo',
              exists: true,
              dirty: true,
              staged: 0,
              unstaged: 2,
              untracked: 1,
              commitsAhead: 3,
              otherSessions: 0,
              blockers: ['worktree has uncommitted changes', 'branch has 3 commit(s) not in the base ref'],
            },
          },
        })
      }
      return jsonResponse({ ok: true, value: {} })
    })
    const { headerAction, overlay } = loadBundle(fetchMock)
    render(React.createElement(headerAction, { sessionId: SESSION }))
    render(React.createElement(overlay, {}))
    fireEvent.click(screen.getByRole('button', { name: 'Delete session permanently' }))

    await screen.findByText('worktree has uncommitted changes')
    expect(screen.queryByRole('button', { name: 'Delete permanently' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Delete anyway' }))

    await waitFor(() => {
      const deleteCall = fetchMock.mock.calls.find(([, init]) => String(init?.body ?? '').includes('"op":"delete"'))
      expect(deleteCall?.[1]?.body).toContain('"force":true')
    })
  })

  it('opens the dialog from the archived-rows bridge event', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => jsonResponse({
      ok: true,
      value: { sessionId: SESSION, title: 'Bridged', cwd: '', live: false, worktree: null },
    }))
    const { overlay } = loadBundle(fetchMock)
    render(React.createElement(overlay, {}))

    window.dispatchEvent(new CustomEvent('dsh-session-delete:confirm', { detail: { sessionId: SESSION } }))

    await screen.findByText('Bridged')
  })

  it('does not offer force deletion while another session uses the worktree', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      ok: true,
      value: {
        sessionId: SESSION,
        title: 'Shared worktree',
        cwd: 'C:\\wt',
        live: false,
        worktree: {
          taskId: 'wt-22222222-2222-4222-8222-222222222222',
          title: 'Task',
          path: 'C:\\wt',
          branch: 'dsh/task',
          repository: 'C:\\repo',
          exists: true,
          dirty: false,
          staged: 0,
          unstaged: 0,
          untracked: 0,
          commitsAhead: 0,
          otherSessions: 1,
          forceAllowed: false,
          blockers: ['1 other session(s) still use this worktree'],
        },
      },
    }))
    const { headerAction, overlay } = loadBundle(fetchMock)
    render(React.createElement(headerAction, { sessionId: SESSION }))
    render(React.createElement(overlay, {}))
    fireEvent.click(screen.getByRole('button', { name: 'Delete session permanently' }))

    await screen.findByText('1 other session(s) still use this worktree')
    expect(screen.queryByRole('button', { name: 'Delete anyway' })).toBeNull()
    expect((screen.getByRole('button', { name: 'Delete other sessions first' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
