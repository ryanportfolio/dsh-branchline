import { describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import type { SubprocessRuntime } from '@deepseek-ai/dsh-subprocess'
import { StudioError } from '../src/errors.ts'
import type { ProcessResult } from '../src/git.ts'
import { GitHubClient, localNameOf, normalizeSource, type GitHubCommandRunner } from '../src/github.ts'
import { git } from './helpers.ts'

const SUBPROCESS = {} as SubprocessRuntime

interface RunnerState {
  readonly calls: readonly { readonly executable: string; readonly args: readonly string[] }[]
}

function outcome(overrides: Partial<ProcessResult> = {}): ProcessResult {
  return {
    stdout: '',
    stderr: '',
    stdoutTruncated: false,
    stderrTruncated: false,
    exitCode: 0,
    signal: null,
    timedOut: false,
    stdoutHash: '',
    ...overrides,
  }
}

async function createRoot(): Promise<string> {
  return await mkdtemp(join(tmpdir(), 'dsh-branchline-test-github-'))
}

async function removeRoot(root: string): Promise<void> {
  if (!basename(root).startsWith('dsh-branchline-test-')) {
    throw new Error(`refusing to remove non-fixture path ${root}`)
  }
  await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 })
}

function clientWith(
  cloneRoot: string,
  behavior: (executable: string, args: readonly string[]) => ProcessResult | Promise<ProcessResult>,
): { readonly client: GitHubClient; readonly state: RunnerState } {
  const calls: { executable: string; args: string[] }[] = []
  const runner: GitHubCommandRunner = async (executable, args) => {
    calls.push({ executable, args: [...args] })
    return await behavior(executable, args)
  }
  return {
    client: new GitHubClient({
      cloneRoot,
      listTimeoutMs: 5_000,
      cloneTimeoutMs: 5_000,
      terminationGraceMs: 100,
      maxOutputBytes: 65_536,
    }, SUBPROCESS, runner),
    state: { calls },
  }
}

describe('GitHub source normalization', () => {
  it('accepts owner/name and Git URLs and rejects everything else', () => {
    expect(normalizeSource('owner/repo')).toBe('owner/repo')
    expect(normalizeSource('https://github.com/owner/repo')).toBe('https://github.com/owner/repo')
    expect(normalizeSource('https://github.com/owner/repo.git')).toBe('https://github.com/owner/repo.git')
    expect(normalizeSource('git@github.com:owner/repo.git')).toBe('git@github.com:owner/repo.git')
    expect(() => normalizeSource('-flag')).toThrow(StudioError)
    expect(() => normalizeSource('not a source')).toThrow(StudioError)
    expect(() => normalizeSource('')).toThrow(StudioError)
  })

  it('derives the clone directory name from every accepted shape', () => {
    expect(localNameOf('owner/repo')).toBe('repo')
    expect(localNameOf('https://github.com/owner/repo')).toBe('repo')
    expect(localNameOf('https://github.com/owner/repo.git')).toBe('repo')
    expect(localNameOf('git@github.com:owner/repo.git')).toBe('repo')
    expect(() => localNameOf('')).toThrow(StudioError)
  })
})

describe('GitHubClient.listRepositories', () => {
  it('parses gh JSON rows and marks locally cloned repositories', async () => {
    const root = await createRoot()
    try {
      await mkdir(join(root, 'repo-a'))
      const payload = JSON.stringify([
        { nameWithOwner: 'owner/repo-a', description: 'first', updatedAt: '2026-01-01T00:00:00Z', isFork: false },
        { nameWithOwner: 'owner/repo-b', description: '', updatedAt: '', isFork: true },
        { nameWithOwner: 'bad row', description: 'skipped' },
      ])
      const { client, state } = clientWith(root, (executable, args) => {
        expect(executable).toBe('gh')
        expect(args[0]).toBe('repo')
        expect(args[1]).toBe('list')
        return outcome({ stdout: payload })
      })
      const rows = await client.listRepositories()
      expect(rows).toEqual([
        { nameWithOwner: 'owner/repo-a', description: 'first', updatedAt: '2026-01-01T00:00:00Z', isFork: false, cloned: true },
        { nameWithOwner: 'owner/repo-b', description: '', updatedAt: '', isFork: true, cloned: false },
      ])
      expect(state.calls).toHaveLength(1)
    } finally {
      await removeRoot(root)
    }
  })

  it('surfaces gh failures with their stderr detail', async () => {
    const root = await createRoot()
    try {
      const { client } = clientWith(root, () => outcome({ exitCode: 1, stderr: 'gh auth required\n' }))
      await expect(client.listRepositories()).rejects.toThrow('gh repo list failed: gh auth required')
    } finally {
      await removeRoot(root)
    }
  })
})

describe('GitHubClient.ensureClone', () => {
  it('clones a missing repository into the clone root', async () => {
    const root = await createRoot()
    try {
      const { client, state } = clientWith(root, () => outcome())
      const clone = await client.ensureClone('owner/repo-a')
      expect(clone).toEqual({ source: 'owner/repo-a', path: join(root, 'repo-a'), cloned: true })
      const cloneCall = state.calls.find(call => call.args[0] === 'repo' && call.args[1] === 'clone')
      expect(cloneCall).toBeDefined()
      expect(cloneCall?.args[2]).toBe('owner/repo-a')
      expect(cloneCall?.args[3]).toBe(join(root, 'repo-a'))
    } finally {
      await removeRoot(root)
    }
  })

  it('reuses an existing Git checkout without cloning again', async () => {
    const root = await createRoot()
    try {
      await mkdir(join(root, 'repo-a'))
      git(join(root, 'repo-a'), ['init', '--initial-branch=main'])
      const { client, state } = clientWith(root, () => outcome({ stdout: 'true\n' }))
      const clone = await client.ensureClone('owner/repo-a')
      expect(clone).toEqual({ source: 'owner/repo-a', path: join(root, 'repo-a'), cloned: false })
      expect(state.calls.some(call => call.args[0] === 'repo')).toBe(false)
      const probe = state.calls.find(call => call.executable === 'git')
      expect(probe?.args).toEqual(['-C', join(root, 'repo-a'), 'rev-parse', '--is-inside-work-tree'])
    } finally {
      await removeRoot(root)
    }
  })

  it('refuses an existing destination that is not a Git checkout', async () => {
    const root = await createRoot()
    try {
      await mkdir(join(root, 'repo-a'))
      const { client } = clientWith(root, () => outcome({ exitCode: 128, stderr: 'not a repository' }))
      await expect(client.ensureClone('owner/repo-a')).rejects.toThrow('clone destination exists and is not a Git checkout')
    } finally {
      await removeRoot(root)
    }
  })

  it('shares one clone between concurrent requests for the same destination', async () => {
    const root = await createRoot()
    try {
      let release!: () => void
      const gate = new Promise<void>(resolve => { release = resolve })
      const { client, state } = clientWith(root, async (executable, args) => {
        if (executable === 'gh' && args[0] === 'repo') {
          await gate
          return outcome()
        }
        return outcome({ stdout: 'true\n' })
      })
      const first = client.ensureClone('owner/repo-a')
      const second = client.ensureClone('owner/repo-a')
      release()
      const [left, right] = await Promise.all([first, second])
      expect(left.cloned).toBe(true)
      expect(right.cloned).toBe(true)
      expect(state.calls.filter(call => call.args[0] === 'repo' && call.args[1] === 'clone')).toHaveLength(1)
    } finally {
      await removeRoot(root)
    }
  })
})
