/** Managed GitHub CLI adapter for repository listing and cloning. */

import { access, mkdir } from 'node:fs/promises'
import { join, isAbsolute, resolve } from 'node:path'
import type { SubprocessRuntime } from '@deepseek-ai/dsh-subprocess'
import { StudioError, errorMessage } from './errors.ts'
import { executableEnvironment, runProcess, type ProcessResult } from './git.ts'
import type { CloneOutcome, GitHubRepoView } from './types.ts'

/** One row returned by `gh repo list --json`. */
interface GhRepoRow {
  readonly nameWithOwner?: unknown
  readonly description?: unknown
  readonly updatedAt?: unknown
  readonly isFork?: unknown
}

/** Injectable process boundary so tests never need `gh` or the network. */
export type GitHubCommandRunner = (
  executable: string,
  args: readonly string[],
  options: { readonly cwd: string; readonly timeoutMs: number; readonly env: NodeJS.ProcessEnv },
) => Promise<ProcessResult>

interface GitHubOptions {
  readonly cloneRoot: string
  readonly listTimeoutMs: number
  readonly cloneTimeoutMs: number
  readonly terminationGraceMs: number
  readonly maxOutputBytes: number
}

const OWNER_NAME = /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9._-]+$/u
const HTTPS_URL = /^https:\/\/[^\s/]+\/[^\s/]+\/[^\s/]+?(?:\.git)?\/?$/iu
const SSH_URL = /^git@[^:\s]+:[^/\s]+\/[^\s/]+?(?:\.git)?$/u

/** Host-side GitHub CLI adapter with bounded output and no shell interpolation. */
export class GitHubClient {
  private readonly run: GitHubCommandRunner
  private readonly clones = new Map<string, Promise<CloneOutcome>>()

  /**
   * @param options - Clone root and process limits.
   * @param subprocess - Harness-owned process-tree runtime.
   * @param runner - Optional process adapter for tests.
   */
  constructor(
    private readonly options: GitHubOptions,
    subprocess: SubprocessRuntime,
    runner?: GitHubCommandRunner,
  ) {
    this.run = runner ?? ((executable, args, commandOptions) => runProcess(subprocess, executable, args, {
      ...commandOptions,
      terminationGraceMs: options.terminationGraceMs,
      maxOutputBytes: options.maxOutputBytes,
    }))
  }

  /** List the authenticated account's repositories with local clone markers. */
  async listRepositories(limit = 100): Promise<readonly GitHubRepoView[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
      throw new StudioError('invalid-input', 'repository list limit must be between 1 and 500')
    }
    const result = await this.checked(['repo', 'list', '--limit', String(limit), '--json', 'nameWithOwner,description,updatedAt,isFork'], this.options.listTimeoutMs)
    if (result.stdoutTruncated) {
      throw new StudioError('git-failure', 'gh repo list output exceeded the configured capture limit')
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(result.stdout) as unknown
    } catch (error) {
      throw new StudioError('git-failure', `gh repo list returned invalid JSON: ${errorMessage(error)}`)
    }
    if (!Array.isArray(parsed)) throw new StudioError('git-failure', 'gh repo list returned unexpected output')
    const rows: GitHubRepoView[] = []
    for (const row of parsed) {
      const record = row as GhRepoRow
      if (typeof record.nameWithOwner !== 'string' || !OWNER_NAME.test(record.nameWithOwner)) continue
      rows.push({
        nameWithOwner: record.nameWithOwner,
        description: typeof record.description === 'string' ? record.description : '',
        updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : '',
        isFork: record.isFork === true,
        cloned: await this.hasLocalClone(localNameOf(record.nameWithOwner)),
      })
    }
    return rows
  }

  /**
   * Ensure `cloneRoot/<name>` holds a Git checkout of `source`, cloning when
   * absent and reusing the existing checkout when present. Concurrent requests
   * for one destination share a single clone.
   */
  async ensureClone(source: string): Promise<CloneOutcome> {
    const normalized = normalizeSource(source)
    const destination = resolve(this.options.cloneRoot, localNameOf(normalized))
    const key = destination.toLowerCase()
    const inFlight = this.clones.get(key)
    if (inFlight !== undefined) return await inFlight
    const operation = this.cloneExclusive(normalized, destination).finally(() => {
      this.clones.delete(key)
    })
    this.clones.set(key, operation)
    return await operation
  }

  private async cloneExclusive(source: string, destination: string): Promise<CloneOutcome> {
    if (!isAbsolute(this.options.cloneRoot)) {
      throw new StudioError('invalid-input', 'cloneRoot must be an absolute directory')
    }
    await mkdir(this.options.cloneRoot, { recursive: true })
    if (await pathExists(destination)) {
      if (await this.isGitCheckout(destination)) {
        return { source, path: destination, cloned: false }
      }
      throw new StudioError('state-conflict', `clone destination exists and is not a Git checkout: ${destination}`)
    }
    await this.checked(['repo', 'clone', source, destination], this.options.cloneTimeoutMs)
    return { source, path: destination, cloned: true }
  }

  /** Probe an existing directory through Git without touching its worktree. */
  private async isGitCheckout(destination: string): Promise<boolean> {
    const result = await this.raw(['-C', destination, 'rev-parse', '--is-inside-work-tree'], this.options.listTimeoutMs, 'git')
    return result.exitCode === 0 && !result.timedOut && result.stdout.trim() === 'true'
  }

  private async hasLocalClone(name: string): Promise<boolean> {
    return await pathExists(join(this.options.cloneRoot, name))
  }

  private environment(): NodeJS.ProcessEnv {
    return executableEnvironment({
      GH_PAGER: 'cat',
      GH_NO_UPDATE_NOTIFIER: '1',
      GIT_TERMINAL_PROMPT: '0',
      GCM_INTERACTIVE: 'Never',
      LC_ALL: 'C',
    })
  }

  private raw(args: readonly string[], timeoutMs: number, executable = 'gh'): Promise<ProcessResult> {
    return this.run(executable, args, { cwd: this.options.cloneRoot, timeoutMs, env: this.environment() })
      .catch((error: unknown) => {
        if (error instanceof StudioError) throw error
        throw new StudioError('git-failure', `cannot run ${executable}: ${errorMessage(error)}`, 502, { cause: error })
      })
  }

  private async checked(args: readonly string[], timeoutMs: number): Promise<ProcessResult> {
    const result = await this.raw(args, timeoutMs)
    if (result.exitCode !== 0 || result.timedOut) {
      const label = args.slice(0, 2).join(' ')
      const detail = result.timedOut
        ? 'operation timed out'
        : (result.stderr.trim() || result.stdout.trim() || `process exited with ${String(result.exitCode)}`).slice(0, 2000)
      throw new StudioError('git-failure', `gh ${label} failed: ${detail}`)
    }
    return result
  }
}

/** Validate a clone source and reduce it to the `gh repo clone` argument. */
export function normalizeSource(value: string): string {
  const source = value.trim()
  if (source.length === 0 || source.startsWith('-') || source.includes('\0')) {
    throw new StudioError('invalid-input', 'clone source must be owner/name or an https or SSH URL')
  }
  if (OWNER_NAME.test(source) || HTTPS_URL.test(source) || SSH_URL.test(source)) return source
  throw new StudioError('invalid-input', `clone source is not owner/name or a Git URL: ${source}`)
}

/** Directory name a source clones into. */
export function localNameOf(source: string): string {
  const withoutGit = source.trim().replace(/\.git(?:\/)?$/iu, '')
  const segments = withoutGit.split(/[:/]/u).filter(segment => segment !== '')
  const name = segments[segments.length - 1] ?? ''
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(name)) {
    throw new StudioError('invalid-input', `clone source has no usable directory name: ${source}`)
  }
  return name
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}
