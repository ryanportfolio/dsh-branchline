import { afterEach, describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { LocalWorktreeStudioManager, type WorktreeStudioOptions } from '../src/manager.ts'
import { TaskStore } from '../src/store.ts'
import { StudioError } from '../src/errors.ts'
import { TaskId } from '../src/types.ts'
import type { GitHubClient } from '../src/github.ts'
import {
  createRepositoryFixture,
  createSubprocessFixture,
  git,
  removeFixture,
  type RepositoryFixture,
  type SubprocessFixture,
} from './helpers.ts'

const fixtures: RepositoryFixture[] = []
const managers: LocalWorktreeStudioManager[] = []
const subprocesses: SubprocessFixture[] = []

afterEach(async () => {
  await Promise.all(managers.splice(0).map(manager => manager.close()))
  await Promise.all(subprocesses.splice(0).map(subprocess => subprocess.dispose()))
  await Promise.all(fixtures.splice(0).map(fixture => removeFixture(fixture.root)))
})

function options(fixture: RepositoryFixture, requireValidation = true, allowDelivery = true): WorktreeStudioOptions {
  return {
    managedRoot: fixture.managedRoot,
    statePath: fixture.statePath,
    gitTimeoutMs: 10_000,
    terminationGraceMs: 200,
    validationTimeoutMs: 10_000,
    maxOutputBytes: 128 * 1024,
    reviewMaxBytes: 64 * 1024,
    requireValidation,
    allowDelivery,
    cloneRoot: join(fixture.root, 'clone'),
    cloneTimeoutMs: 10_000,
  }
}

async function setup(
  requireValidation = true,
  allowDelivery = true,
  github?: Pick<GitHubClient, 'findMergedPullRequest'>,
): Promise<{
  readonly fixture: RepositoryFixture
  readonly manager: LocalWorktreeStudioManager
}> {
  const fixture = await createRepositoryFixture()
  fixtures.push(fixture)
  const subprocess = await createSubprocessFixture()
  subprocesses.push(subprocess)
  const manager = new LocalWorktreeStudioManager(
    options(fixture, requireValidation, allowDelivery),
    subprocess.subprocess,
    undefined,
    undefined,
    github,
  )
  managers.push(manager)
  return { fixture, manager }
}

describe('LocalWorktreeStudioManager', () => {
  it('marks an unchanged task safe when its exact HEAD is already on fetched main', async () => {
    const { fixture, manager } = await setup(false)
    const created = await manager.create({ repository: fixture.repository, title: 'Already preserved' })

    await expect(manager.assessPreservation(created.id)).resolves.toMatchObject({
      status: 'safe',
      headCommit: created.headCommit,
      branch: created.branch,
      defaultRef: 'refs/remotes/origin/main',
    })
  })

  it('marks dirty work unsafe without consulting GitHub', async () => {
    const github = { findMergedPullRequest: async () => { throw new Error('must not run') } }
    const { fixture, manager } = await setup(false, true, github)
    const created = await manager.create({ repository: fixture.repository, title: 'Dirty work' })
    await writeFile(join(created.path, 'loose.txt'), 'not committed\n')

    await expect(manager.assessPreservation(created.id)).resolves.toMatchObject({
      status: 'unsafe',
      reason: expect.stringContaining('uncommitted'),
    })
  })

  it('blocks ignored local files that may contain unique data', async () => {
    const github = { findMergedPullRequest: async () => { throw new Error('must not run') } }
    const { fixture, manager } = await setup(false, true, github)
    const created = await manager.create({ repository: fixture.repository, title: 'Local environment' })
    await writeFile(join(created.path, '.gitignore'), '.env.local\n')
    git(created.path, ['add', '.gitignore'])
    git(created.path, ['commit', '-m', 'ignore local environment'])
    await writeFile(join(created.path, '.env.local'), 'secret=value\n')

    await expect(manager.assessPreservation(created.id)).resolves.toMatchObject({
      status: 'unsafe',
      reason: expect.stringContaining('ignored local path'),
      ignoredPaths: ['.env.local'],
    })
  })

  it('allows known disposable ignored dependency folders', async () => {
    const { fixture, manager } = await setup(false)
    await writeFile(join(fixture.repository, '.gitignore'), 'node_modules/\n')
    git(fixture.repository, ['add', '.gitignore'])
    git(fixture.repository, ['commit', '-m', 'ignore dependencies'])
    git(fixture.repository, ['push', 'origin', 'main'])
    const created = await manager.create({ repository: fixture.repository, title: 'Dependencies only' })
    await mkdir(join(created.path, 'packages', 'app', 'node_modules'), { recursive: true })
    await writeFile(join(created.path, 'packages', 'app', 'node_modules', 'cache.txt'), 'cache\n')

    await expect(manager.assessPreservation(created.id)).resolves.toMatchObject({
      status: 'safe',
      ignoredPaths: expect.arrayContaining(['packages/app/node_modules/']),
    })
  })

  it('accepts exact-head squash merge proof only when its merge commit is on main', async () => {
    let expectedHead = ''
    let mergeCommit = ''
    const github = {
      findMergedPullRequest: async (_repository: string, _branch: string, headCommit: string) => {
        if (headCommit !== expectedHead) return null
        return {
          number: 42,
          url: 'https://github.test/pr/42',
          mergedAt: '2026-09-01T00:00:00Z',
          headCommit,
          mergeCommit,
        }
      },
    }
    const { fixture, manager } = await setup(false, true, github)
    const created = await manager.create({ repository: fixture.repository, title: 'Squash merged' })
    await writeFile(join(created.path, 'feature.txt'), 'feature\n')
    git(created.path, ['add', 'feature.txt'])
    git(created.path, ['commit', '-m', 'feature'])
    expectedHead = git(created.path, ['rev-parse', 'HEAD'])

    const publisher = join(fixture.root, 'publisher')
    git(fixture.root, ['clone', fixture.origin, publisher])
    git(publisher, ['config', 'user.email', 'publisher@example.invalid'])
    git(publisher, ['config', 'user.name', 'Publisher'])
    await writeFile(join(publisher, 'feature.txt'), 'feature\n')
    git(publisher, ['add', 'feature.txt'])
    git(publisher, ['commit', '-m', 'squash feature'])
    git(publisher, ['push', 'origin', 'main'])
    mergeCommit = git(publisher, ['rev-parse', 'HEAD'])

    await expect(manager.assessPreservation(created.id)).resolves.toMatchObject({
      status: 'safe',
      reason: 'PR #42 merged and contains this exact HEAD',
      pullRequest: { number: 42, headCommit: expectedHead, mergeCommit },
    })
  })

  it('marks a clean unmerged head unsafe and blocks guarded purge', async () => {
    const github = { findMergedPullRequest: async () => null }
    const { fixture, manager } = await setup(false, true, github)
    const created = await manager.create({ repository: fixture.repository, title: 'Not merged' })
    await writeFile(join(created.path, 'feature.txt'), 'feature\n')
    git(created.path, ['add', 'feature.txt'])
    git(created.path, ['commit', '-m', 'feature'])

    await expect(manager.assessPreservation(created.id)).resolves.toMatchObject({
      status: 'unsafe',
      reason: expect.stringContaining('no matching merged pull request'),
    })
    await expect(manager.purge(created.id, { requirePreserved: true })).rejects.toMatchObject({ code: 'state-conflict' })
    expect(existsSync(created.path)).toBe(true)
  })

  it('reports unknown when remote proof cannot be refreshed', async () => {
    const { fixture, manager } = await setup(false)
    const created = await manager.create({ repository: fixture.repository, title: 'Offline proof' })
    git(fixture.repository, ['remote', 'remove', 'origin'])

    await expect(manager.assessPreservation(created.id)).resolves.toMatchObject({
      status: 'unknown',
      reason: expect.stringContaining('could not refresh origin'),
    })
  })

  it('creates from freshly fetched origin default without touching a dirty primary checkout', async () => {
    const { fixture, manager } = await setup(false)
    await writeFile(join(fixture.repository, 'README.md'), 'dirty primary\n')
    const beforeStatus = git(fixture.repository, ['status', '--porcelain=v1'])

    const first = await manager.create({ repository: fixture.repository, title: 'Fresh remote task' })

    expect(first.baseRef).toBe('origin/main')
    expect(first.baseCommit).toBe(git(fixture.repository, ['rev-parse', 'origin/main']))
    expect(await readFile(join(fixture.repository, 'README.md'), 'utf8')).toBe('dirty primary\n')
    expect(git(fixture.repository, ['status', '--porcelain=v1'])).toBe(beforeStatus)
    expect(git(first.path, ['status', '--porcelain=v1'])).toBe('')

    const publisher = join(fixture.root, 'publisher')
    git(fixture.root, ['clone', fixture.origin, publisher])
    git(publisher, ['config', 'user.email', 'publisher@example.invalid'])
    git(publisher, ['config', 'user.name', 'Publisher'])
    await writeFile(join(publisher, 'remote.txt'), 'new remote commit\n')
    git(publisher, ['add', 'remote.txt'])
    git(publisher, ['commit', '-m', 'advance remote'])
    git(publisher, ['push', 'origin', 'main'])
    const remoteHead = git(publisher, ['rev-parse', 'HEAD'])

    const second = await manager.create({ repository: fixture.repository, title: 'Second fresh task' })
    expect(second.baseCommit).toBe(remoteHead)
    expect(git(second.path, ['rev-parse', 'HEAD'])).toBe(remoteHead)
    expect(git(fixture.repository, ['status', '--porcelain=v1'])).toBe(beforeStatus)
  })

  it('disables local merge delivery in review-only mode', async () => {
    const { fixture, manager } = await setup(false, false)
    let task = await manager.create({ repository: fixture.repository, title: 'Review only task' })
    await writeFile(join(task.path, 'review.txt'), 'review me\n')
    git(task.path, ['add', 'review.txt'])
    git(task.path, ['commit', '-m', 'review-only change'])
    const dashboard = await manager.dashboard(fixture.repository)
    task = dashboard.tasks[0] as typeof task

    expect(dashboard.deliveryEnabled).toBe(false)
    await expect(manager.deliver(task.id, task.changeToken, fixture.repository))
      .rejects.toMatchObject({ code: 'delivery-disabled' })
  })

  it('creates, validates, previews, delivers, and archives one task', async () => {
    const { fixture, manager } = await setup()
    let task = await manager.create({
      repository: fixture.repository,
      title: 'Add delivery proof',
      validationCommand: [process.execPath, '-e', 'process.exit(0)'],
    })
    expect(task).toMatchObject({ phase: 'active', exists: true, branch: expect.stringMatching(/^dsh\//u) })

    await writeFile(join(task.path, 'proof.txt'), 'delivered\n')
    git(task.path, ['add', 'proof.txt'])
    git(task.path, ['commit', '-m', 'add proof'])
    task = (await manager.dashboard(fixture.repository)).tasks[0] as typeof task
    expect(task.changes).toMatchObject({ dirty: false, commitsAhead: 1 })

    task = await manager.validate(task.id, task.changeToken)
    expect(task.phase).toBe('validated')
    expect(task.lastValidation).toMatchObject({ passed: true, timedOut: false, exitCode: 0 })

    const preview = await manager.previewMerge(task.id, fixture.repository)
    expect(preview).toMatchObject({ canMerge: true, targetDirty: false, conflicts: [] })
    task = await manager.deliver(task.id, task.changeToken, fixture.repository)
    expect(task.phase).toBe('delivered')
    expect(await readFile(join(fixture.repository, 'proof.txt'), 'utf8')).toBe('delivered\n')

    task = await manager.archive({ id: task.id, changeToken: task.changeToken })
    expect(task).toMatchObject({ phase: 'archived', exists: false, conclusion: 'delivered' })
  })

  it('rejects stale mutations and requires the exact task id before discard', async () => {
    const { fixture, manager } = await setup(false)
    const created = await manager.create({ repository: fixture.repository, title: 'Disposable task' })
    await writeFile(join(created.path, 'uncommitted.txt'), 'keep until confirmed\n')
    const current = (await manager.dashboard(fixture.repository)).tasks[0] as typeof created

    await expect(manager.archive({ id: created.id, changeToken: created.changeToken }))
      .rejects.toMatchObject({ code: 'state-conflict' })
    await expect(manager.discard({ id: current.id, changeToken: current.changeToken }, 'discard'))
      .rejects.toMatchObject({ code: 'invalid-input' })

    const discarded = await manager.discard(
      { id: current.id, changeToken: current.changeToken },
      String(current.id),
    )
    expect(discarded).toMatchObject({ phase: 'archived', conclusion: 'discarded', exists: false })
  })

  it('records failed validation and blocks unvalidated delivery', async () => {
    const { fixture, manager } = await setup()
    let task = await manager.create({
      repository: fixture.repository,
      title: 'Failing task',
      validationCommand: [process.execPath, '-e', 'process.exit(7)'],
    })
    await writeFile(join(task.path, 'change.txt'), 'change\n')
    git(task.path, ['add', 'change.txt'])
    git(task.path, ['commit', '-m', 'change'])
    task = (await manager.dashboard(fixture.repository)).tasks[0] as typeof task

    await expect(manager.deliver(task.id, task.changeToken, fixture.repository))
      .rejects.toMatchObject({ code: 'validation-failed' })
    task = await manager.validate(task.id, task.changeToken)
    expect(task).toMatchObject({ phase: 'blocked', lastValidation: { passed: false, exitCode: 7 } })
  })

  it('invalidates validation when an unchanged status entry gets new content', async () => {
    const { fixture, manager } = await setup()
    let task = await manager.create({
      repository: fixture.repository,
      title: 'Content fingerprint',
      validationCommand: [process.execPath, '-e', 'process.exit(0)'],
    })
    const changedPath = join(task.path, 'same-status.txt')
    await writeFile(changedPath, 'first\n')
    task = (await manager.dashboard(fixture.repository)).tasks[0] as typeof task
    task = await manager.validate(task.id, task.changeToken)
    expect(task.phase).toBe('validated')
    const validatedToken = task.changeToken

    await writeFile(changedPath, 'other\n')
    task = (await manager.dashboard(fixture.repository)).tasks[0] as typeof task
    expect(task.changeToken).not.toBe(validatedToken)
    expect(task.phase).toBe('active')
    expect(task.lastValidation?.changeToken).toBe(validatedToken)
  })

  it('marks an interrupted validation as blocked during recovery', async () => {
    const { fixture, manager } = await setup(false)
    const task = await manager.create({ repository: fixture.repository, title: 'Interrupted task' })
    const store = new TaskStore(fixture.statePath)
    await store.update(state => ({
      version: 1,
      tasks: {
        ...state.tasks,
        [String(task.id)]: {
          ...(state.tasks[String(task.id)] as NonNullable<(typeof state.tasks)[string]>),
          pendingOperation: 'validate',
        },
      },
    }))

    const report = await manager.recover()
    expect(report.pending).toEqual([])
    const recovered = (await manager.dashboard(fixture.repository)).tasks[0]
    expect(recovered).toMatchObject({ phase: 'blocked', lastError: expect.stringContaining('interrupted validate') })
  })

  it('does not mutate a dirty target during merge preview', async () => {
    const { fixture, manager } = await setup(false)
    let task = await manager.create({ repository: fixture.repository, title: 'Preview task' })
    await writeFile(join(task.path, 'feature.txt'), 'feature\n')
    git(task.path, ['add', 'feature.txt'])
    git(task.path, ['commit', '-m', 'feature'])
    task = (await manager.dashboard(fixture.repository)).tasks[0] as typeof task
    await writeFile(join(fixture.repository, 'README.md'), 'dirty target\n')

    const before = git(fixture.repository, ['rev-parse', 'HEAD'])
    const preview = await manager.previewMerge(task.id, fixture.repository)
    const after = git(fixture.repository, ['rev-parse', 'HEAD'])
    expect(preview).toMatchObject({ canMerge: false, targetDirty: true })
    expect(after).toBe(before)
  })

  it('purges the worktree, branch, and record for session deletion', async () => {
    const { fixture, manager } = await setup(false)
    const created = await manager.create({ repository: fixture.repository, title: 'Purge target' })
    await writeFile(join(created.path, 'loose.txt'), 'uncommitted\n')

    const outcome = await manager.purge(created.id)

    expect(outcome).toMatchObject({ id: created.id, worktreeRemoved: true, branchRemoved: true, recordRemoved: true })
    expect(existsSync(created.path)).toBe(false)
    expect(git(fixture.repository, ['branch', '--list', created.branch as string])).toBe('')
    const state = JSON.parse(await readFile(fixture.statePath, 'utf8')) as { tasks: Record<string, unknown> }
    expect(state.tasks[String(created.id)]).toBeUndefined()
  })

  it('keeps the branch when purge is asked not to delete it', async () => {
    const { fixture, manager } = await setup(false)
    const created = await manager.create({ repository: fixture.repository, title: 'Keep branch' })

    const outcome = await manager.purge(created.id, { deleteBranch: false })

    expect(outcome).toMatchObject({ worktreeRemoved: true, branchRemoved: false, recordRemoved: true })
    expect(git(fixture.repository, ['branch', '--list', created.branch as string])).not.toBe('')
  })

  it('purges a stale directory git no longer links', async () => {
    const { fixture, manager } = await setup(false)
    const created = await manager.create({ repository: fixture.repository, title: 'Stale directory' })
    git(fixture.repository, ['worktree', 'remove', '--force', created.path])
    await mkdir(created.path, { recursive: true })
    await writeFile(join(created.path, 'leftover.txt'), 'orphan\n')

    const outcome = await manager.purge(created.id)

    expect(outcome).toMatchObject({ worktreeRemoved: true, recordRemoved: true })
    expect(existsSync(created.path)).toBe(false)
  })

  it('treats an unknown task id as an idempotent no-op', async () => {
    const { manager } = await setup(false)
    const outcome = await manager.purge(TaskId('wt-00000000-0000-4000-8000-000000000000'))
    expect(outcome).toMatchObject({ worktreeRemoved: false, branchRemoved: false, recordRemoved: false })
  })

  it('refuses to purge a task record whose path escapes the managed root', async () => {
    const { fixture, manager } = await setup(false)
    const created = await manager.create({ repository: fixture.repository, title: 'Unsafe purge target' })
    const store = new TaskStore(fixture.statePath)
    await store.update(state => ({
      version: 1,
      tasks: {
        ...state.tasks,
        [String(created.id)]: {
          ...(state.tasks[String(created.id)] as NonNullable<(typeof state.tasks)[string]>),
          path: fixture.repository,
        },
      },
    }))

    await expect(manager.purge(created.id)).rejects.toMatchObject({ code: 'unsafe-path' })
    expect(existsSync(fixture.repository)).toBe(true)
  })

  it('drops the record during recovery when an interrupted purge finished its git work', async () => {
    const { fixture, manager } = await setup(false)
    const created = await manager.create({ repository: fixture.repository, title: 'Interrupted purge' })
    git(fixture.repository, ['worktree', 'remove', '--force', created.path])
    git(fixture.repository, ['branch', '-D', created.branch as string])
    const store = new TaskStore(fixture.statePath)
    await store.update(state => ({
      version: 1,
      tasks: {
        ...state.tasks,
        [String(created.id)]: {
          ...(state.tasks[String(created.id)] as NonNullable<(typeof state.tasks)[string]>),
          pendingOperation: 'purge',
        },
      },
    }))

    const report = await manager.recover()

    expect(report.pending).toEqual([])
    const state = JSON.parse(await readFile(fixture.statePath, 'utf8')) as { tasks: Record<string, unknown> }
    expect(state.tasks[String(created.id)]).toBeUndefined()
  })

  it('keeps a recovery marker when an interrupted purge left its branch behind', async () => {
    const { fixture, manager } = await setup(false)
    const created = await manager.create({ repository: fixture.repository, title: 'Branch left behind' })
    git(fixture.repository, ['worktree', 'remove', '--force', created.path])
    const store = new TaskStore(fixture.statePath)
    await store.update(state => ({
      version: 1,
      tasks: {
        ...state.tasks,
        [String(created.id)]: {
          ...(state.tasks[String(created.id)] as NonNullable<(typeof state.tasks)[string]>),
          pendingOperation: 'purge',
        },
      },
    }))

    const report = await manager.recover()

    expect(report.pending).toEqual([String(created.id)])
    const state = JSON.parse(await readFile(fixture.statePath, 'utf8')) as { tasks: Record<string, unknown> }
    const record = state.tasks[String(created.id)] as { phase?: string, lastError?: string } | undefined
    expect(record).toBeDefined()
    expect(record?.phase).toBe('recovery-needed')
    expect(record?.lastError).toContain('branch remains')
  })
})
