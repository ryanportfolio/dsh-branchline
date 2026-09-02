import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// @ts-expect-error plain-JS host bundle without type declarations
import { apply as applyHost } from '../packages/dsh-session-delete/lib/index.js'

const SESSION = 'session-11111111-1111-4111-8111-111111111111'
const OTHER = 'session-33333333-3333-4333-8333-333333333333'
const TASK_ID = 'wt-22222222-2222-4222-8222-222222222222'

let home = ''
let worktreePath = ''
let repositoryPath = ''
let sessionDir = ''

const envRestore = process.env.DSH_HOME

beforeAll(async () => {
  home = await mkdtemp(join(tmpdir(), 'dsh-session-delete-'))
  process.env.DSH_HOME = home
  repositoryPath = join(home, 'repo')
  worktreePath = join(home, 'managed', 'worktrees', 'repo0', 'task-22222222')
  sessionDir = join(home, 'sessions', '--C--repo--', SESSION)
  await mkdir(join(worktreePath, 'nested'), { recursive: true })
  await mkdir(repositoryPath, { recursive: true })
  await mkdir(sessionDir, { recursive: true })
  await writeFile(join(worktreePath, 'file.txt'), 'worktree\n')
  await writeFile(join(sessionDir, 'session.jsonl.zstd'), 'log\n')
  await mkdir(join(home, 'storages'), { recursive: true })
  await writeFile(join(home, 'storages', 'session_projcache.json'), JSON.stringify({
    unit: { name: 'session_projcache', version: 3 },
    global: null,
    tables: { sessions: { [SESSION]: { rows: {} }, kept: { rows: {} } } },
  }), 'utf8')
  await writeFile(join(home, 'storages', 'message_feedback.json'), JSON.stringify({
    unit: { name: 'message_feedback', version: 0 },
    global: null,
    tables: { sessions: { [SESSION]: { rows: [] }, kept: { rows: [] } } },
  }), 'utf8')
})

afterAll(async () => {
  if (envRestore === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = envRestore
  await rm(home, { recursive: true, force: true, maxRetries: 3 })
})

function taskView(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: TASK_ID,
    title: 'Purge target',
    path: worktreePath,
    branch: 'dsh/task-22222222',
    repository: repositoryPath,
    phase: 'active',
    exists: true,
    changes: { dirty: false, staged: 0, unstaged: 0, untracked: 0, commitsAhead: 0 },
    ...overrides,
  }
}

interface SessionReply {
  readonly status: number
  readonly body: any
}

function makeHarness(options: {
  readonly tasks?: readonly Record<string, unknown>[]
  readonly sessions?: Array<{ header: { id: string, cwd: string, createdAt?: string } }>
  readonly attached?: readonly string[]
  readonly agentStatus?: Readonly<Record<string, 'idle' | 'running'>>
  readonly trackHandle?: boolean
  readonly locateMode?: 'ok' | 'none' | 'throw' | 'weird'
} = {}): {
  readonly request: (body: unknown) => Promise<SessionReply>
  readonly disposeAgent: ReturnType<typeof vi.fn>
  readonly purge: ReturnType<typeof vi.fn>
  readonly resumeAgent: () => Promise<unknown>
  readonly setState: ReturnType<typeof vi.fn>
} {
  const listed = options.sessions ?? [
    { header: { id: SESSION, cwd: worktreePath, createdAt: '2026-09-01T00:00:00.000Z' } },
    { header: { id: OTHER, cwd: repositoryPath } },
  ]
  const purge = vi.fn(async (id: string) => ({ id, worktreeRemoved: true, branchRemoved: true, recordRemoved: true }))
  const setState = vi.fn(async () => undefined)
  const attached = new Set(options.attached ?? [])
  const agentById = new Map(Object.entries(options.agentStatus ?? {}).map(([id, status]) => [id, { id, status }]))
  for (const id of agentById.keys()) attached.add(id)
  const sessions = {
    get: (id: string) => (attached.has(id) ? { id } : undefined),
  }
  class TestAgentRegistry {
    get(id: string) {
      return agentById.get(id)
    }

    async create() {
      throw new Error('not used by this harness')
    }

    async resume() {
      const agent = agentById.get(SESSION)
      if (agent === undefined) throw new Error('no agent to resume')
      return { agent, dispose: disposeAgent }
    }
  }
  const agents = new TestAgentRegistry()
  const disposeAgent = vi.fn(async () => {
    agentById.delete(SESSION)
    attached.delete(SESSION)
  })
  const captured: Array<{ handler: (request: unknown, response: unknown) => Promise<void> }> = []
  const locateMode = options.locateMode ?? 'ok'
  const ctx: Record<string, unknown> = {
    sessionQuery: {
      listSessions: async () => listed,
      readTitleSnapshots: async (ids: readonly string[]) => ids.map((id) => ({
        status: 'fulfilled',
        value: { session: { id }, title: id === SESSION ? 'My session' : undefined },
      })),
    },
    sessionPersistence: {
      locate: (header: { id: string }) => {
        if (locateMode === 'throw') throw new Error('persistence unavailable')
        if (locateMode === 'weird' && header.id === SESSION) {
          return { kind: 'jsonl', path: join(home, 'outside-sessions', SESSION, 'artifact.jsonl') }
        }
        return locateMode === 'none' || header.id !== SESSION
          ? undefined
          : { kind: 'jsonl', path: join(sessionDir, 'session.jsonl.zstd') }
      },
    },
    workspaceRegistry: {
      archivedSessionIds: [SESSION],
      enqueueOperation: async (fn: () => Promise<void>) => fn(),
      requireState: () => ({ archivedSessionIds: [SESSION, OTHER] }),
      setState,
    },
    worktreeStudio: {
      dashboard: async () => ({ tasks: options.tasks ?? [taskView()], repositories: [], deliveryEnabled: false }),
      purge,
    },
    storageDomain: { get: () => undefined },
    sessions,
    agents,
    get(name: string) {
      return (this as Record<string, unknown>)[name]
    },
    effect(fn: () => unknown) {
      return fn()
    },
    inject(_names: readonly string[], install: (webCtx: Record<string, unknown>) => void) {
      install({
        ...ctx,
        webServer: {
          register: (registered: { handler: (request: unknown, response: unknown) => Promise<void> }) => {
            captured.push(registered)
            return () => undefined
          },
        },
        effect: (fn: () => unknown) => fn(),
      })
    },
  }
  applyHost(ctx)
  const agent = agentById.get(SESSION)
  if (agent !== undefined && options.trackHandle !== false) {
    const methodOwner = Object.getPrototypeOf(agents) as Record<PropertyKey, any>
    const tracker = methodOwner[Symbol.for('dsh-session-delete.agent-handle-tracker.v1')]
    tracker.handles.set(agent, { agent, dispose: disposeAgent })
  }
  const registered = captured[0]
  if (registered === undefined) throw new Error('route was not registered')
  const handler = registered.handler
  async function request(body: unknown): Promise<SessionReply> {
    const payload = Buffer.from(JSON.stringify(body))
    const fakeRequest = {
      method: 'POST',
      headers: { 'content-type': 'application/json', host: 'localhost' },
      socket: { remoteAddress: '127.0.0.1' },
      async *[Symbol.asyncIterator]() {
        yield payload
      },
    }
    const state: { status?: number, body?: any } = {}
    const response = {
      writeHead(status: number) {
        state.status = status
      },
      end(bodyText: string) {
        state.body = JSON.parse(bodyText)
      },
    }
    await handler(fakeRequest, response)
    if (state.status === undefined || state.body === undefined) throw new Error('handler produced no response')
    return { status: state.status, body: state.body }
  }
  return { request, disposeAgent, purge, resumeAgent: () => agents.resume(), setState }
}

describe('dsh-session-delete host route', () => {
  it('previews the session with its attached worktree and no blockers when clean', async () => {
    const { request } = makeHarness()
    const { status, body } = await request({ op: 'preview', sessionId: SESSION })
    expect(status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.value).toMatchObject({
      sessionId: SESSION,
      title: 'My session',
      attached: false,
      running: false,
      worktree: {
        taskId: TASK_ID,
        branch: 'dsh/task-22222222',
        dirty: false,
        commitsAhead: 0,
        otherSessions: 0,
        forceAllowed: true,
        blockers: [],
      },
    })
  })

  it('rejects unknown sessions, bad ids, and wrong confirmations', async () => {
    const { request } = makeHarness()
    expect((await request({ op: 'preview', sessionId: 'session-44444444-4444-4444-8444-444444444444' })).status).toBe(404)
    expect((await request({ op: 'preview', sessionId: 'not-a-session' })).status).toBe(400)
    const wrong = await request({ op: 'delete', sessionId: SESSION, confirmation: 'nope' })
    expect(wrong.status).toBe(400)
    expect(wrong.body.error.code).toBe('invalid-input')
  })

  it('reports an attached idle session separately from active work', async () => {
    const { request } = makeHarness({ agentStatus: { [SESSION]: 'idle' } })
    const { status, body } = await request({ op: 'preview', sessionId: SESSION })
    expect(status).toBe(200)
    expect(body.value).toMatchObject({ attached: true, running: false })
  })

  it('refuses to delete a running session', async () => {
    const { request, purge } = makeHarness({ agentStatus: { [SESSION]: 'running' } })
    const { status, body } = await request({ op: 'delete', sessionId: SESSION, confirmation: SESSION })
    expect(status).toBe(409)
    expect(body.error.code).toBe('session-running')
    expect(body.error.message).toContain('active')
    expect(purge).not.toHaveBeenCalled()
  })

  it('disposes an idle attached session before deleting it', async () => {
    const { request, disposeAgent, purge } = makeHarness({
      agentStatus: { [SESSION]: 'idle' },
      sessions: [{ header: { id: SESSION, cwd: join(home, 'elsewhere') } }],
      tasks: [],
      locateMode: 'none',
    })
    const { status, body } = await request({ op: 'delete', sessionId: SESSION, confirmation: SESSION })
    expect(status).toBe(200)
    expect(body.ok).toBe(true)
    expect(disposeAgent).toHaveBeenCalledTimes(1)
    expect(purge).not.toHaveBeenCalled()
  })

  it('rejects an attached session whose lifecycle handle was not tracked', async () => {
    const { request, disposeAgent, purge } = makeHarness({ agentStatus: { [SESSION]: 'idle' }, trackHandle: false })
    const { status, body } = await request({ op: 'delete', sessionId: SESSION, confirmation: SESSION })
    expect(status).toBe(409)
    expect(body.error.code).toBe('session-attached')
    expect(body.error.message).toContain('restart DSH')
    expect(disposeAgent).not.toHaveBeenCalled()
    expect(purge).not.toHaveBeenCalled()
  })

  it('captures handles returned by the public agent resume lifecycle', async () => {
    const harness = makeHarness({
      agentStatus: { [SESSION]: 'idle' },
      trackHandle: false,
      sessions: [{ header: { id: SESSION, cwd: join(home, 'elsewhere') } }],
      tasks: [],
      locateMode: 'none',
    })
    await harness.resumeAgent()

    const { status, body } = await harness.request({ op: 'delete', sessionId: SESSION, confirmation: SESSION })
    expect(status).toBe(200)
    expect(body.ok).toBe(true)
    expect(harness.disposeAgent).toHaveBeenCalledTimes(1)
  })

  it('blocks a dirty worktree without force, purges everything with force', async () => {
    const dirty = makeHarness({ tasks: [taskView({ changes: { dirty: true, staged: 0, unstaged: 1, untracked: 2, commitsAhead: 0 } })] })
    const blocked = await dirty.request({ op: 'delete', sessionId: SESSION, confirmation: SESSION })
    expect(blocked.status).toBe(409)
    expect(blocked.body.error.code).toBe('worktree-blocked')
    expect(dirty.purge).not.toHaveBeenCalled()
    expect(existsSync(sessionDir)).toBe(true)

    const forced = await dirty.request({ op: 'delete', sessionId: SESSION, confirmation: SESSION, force: true })
    expect(forced.status).toBe(200)
    expect(forced.body.ok).toBe(true)
    expect(forced.body.value.worktree).toMatchObject({ worktreeRemoved: true, branchRemoved: true, recordRemoved: true })
  })

  it('blocks deletion while other sessions still use the worktree', async () => {
    const shared = makeHarness({
      sessions: [
        { header: { id: SESSION, cwd: worktreePath } },
        { header: { id: OTHER, cwd: worktreePath } },
      ],
    })
    const { status, body } = await shared.request({ op: 'delete', sessionId: SESSION, confirmation: SESSION })
    expect(status).toBe(409)
    expect(body.error.code).toBe('worktree-blocked')
    expect(body.error.message).toContain('other session')
    expect(shared.purge).not.toHaveBeenCalled()

    const forced = await shared.request({ op: 'delete', sessionId: SESSION, confirmation: SESSION, force: true })
    expect(forced.status).toBe(409)
    expect(forced.body.error.code).toBe('worktree-blocked')
    expect(shared.purge).not.toHaveBeenCalled()
  })

  it('deletes the worktree, log directory, and sidecars, and unarchives the session', async () => {
    const { request, purge, setState } = makeHarness()
    const { status, body } = await request({ op: 'delete', sessionId: SESSION, confirmation: SESSION })
    expect(status).toBe(200)
    expect(body.ok).toBe(true)
    expect(purge).toHaveBeenCalledWith(TASK_ID)
    expect(body.value.log).toMatchObject({ removed: true })
    expect(existsSync(sessionDir)).toBe(false)
    expect(existsSync(join(home, 'sessions', '--C--repo--'))).toBe(false)

    const next = setState.mock.calls[0]?.[0] as { archivedSessionIds?: string[] }
    expect(next.archivedSessionIds).toEqual([OTHER])

    const projcache = JSON.parse(await readFile(join(home, 'storages', 'session_projcache.json'), 'utf8'))
    expect(projcache.tables.sessions[SESSION]).toBeUndefined()
    expect(projcache.tables.sessions.kept).toBeDefined()
    const feedback = JSON.parse(await readFile(join(home, 'storages', 'message_feedback.json'), 'utf8'))
    expect(feedback.tables.sessions[SESSION]).toBeUndefined()
    // The pins store lives under the real user home (the pins plugin hardcodes it);
    // the fixture id never matches it, so the prune must report zero without writing.
    expect(body.value.sidecars['dsh-session-pins.json']).toMatchObject({ pruned: 0 })
  })

  it('leaves nothing behind when the session has no worktree and no artifact', async () => {
    const plain = makeHarness({
      sessions: [{ header: { id: SESSION, cwd: join(home, 'elsewhere') } }],
      tasks: [],
      locateMode: 'none',
    })
    const { status, body } = await plain.request({ op: 'delete', sessionId: SESSION, confirmation: SESSION })
    expect(status).toBe(200)
    expect(body.value.worktree).toBeNull()
    expect(body.value.log).toMatchObject({ removed: false, reason: 'no-artifact' })
    expect(plain.purge).not.toHaveBeenCalled()
  })

  it('fails loud instead of reporting success when the artifact cannot be located', async () => {
    const failing = makeHarness({ locateMode: 'throw' })
    await mkdir(sessionDir, { recursive: true })
    await writeFile(join(sessionDir, 'session.jsonl.zstd'), 'log\n')
    const { status, body } = await failing.request({ op: 'delete', sessionId: SESSION, confirmation: SESSION })
    expect(status).toBe(500)
    expect(body.error.code).toBe('log-removal-failed')
    expect(failing.purge).not.toHaveBeenCalled()
    expect(existsSync(sessionDir)).toBe(true)
  })

  it('fails loud when the artifact layout is unexpected', async () => {
    const weird = makeHarness({ locateMode: 'weird' })
    await mkdir(sessionDir, { recursive: true })
    await writeFile(join(sessionDir, 'session.jsonl.zstd'), 'log\n')
    const { status, body } = await weird.request({ op: 'delete', sessionId: SESSION, confirmation: SESSION })
    expect(status).toBe(500)
    expect(body.error.code).toBe('log-removal-failed')
    expect(weird.purge).not.toHaveBeenCalled()
    expect(existsSync(sessionDir)).toBe(true)
  })
})
