/** Typed fetch adapter for the loopback Host route. */

import type {
  DashboardView,
  DoctorView,
  GitHubRepoView,
  MergePreview,
  ReviewView,
  TaskId,
  TaskView,
} from '../types.ts'

const ROUTE = '/api/dsh-branchline'

/**
 * Structural slice of the per-session composer input shell the toggle needs.
 * The conversation package owns the full face; this stays assignable from the
 * runtime object (including its mutable `submit`, which the armed toggle wraps).
 */
export interface ComposerShellFace {
  readonly state: {
    readonly getSnapshot: () => {
      readonly draft: string
      readonly imageIds: readonly unknown[]
      readonly phase: 'plain' | 'adjudicating' | 'claimed' | 'submitting'
    }
  }
  setDraft(text: string): void
  submit(mode?: string): void
}

interface ErrorEnvelope {
  readonly ok: false
  readonly error: { readonly code: string; readonly message: string }
}

interface SuccessEnvelope<T> {
  readonly ok: true
  readonly value: T
}

/** Client callbacks exposed to the component through the slot inject face. */
export interface StudioClientActions {
  loadDashboard(repository?: string, signal?: AbortSignal): Promise<DashboardView>
  createTask(input: {
    readonly repository?: string
    readonly cloneFrom?: string
    readonly title: string
    readonly branch?: string
    readonly baseRef?: string
    readonly validationCommand?: string
  }): Promise<TaskView>
  listGitHubRepositories(): Promise<readonly GitHubRepoView[]>
  inspectTask(id: TaskId): Promise<{ readonly task: TaskView; readonly review: ReviewView }>
  validateTask(task: TaskView, command?: string): Promise<TaskView>
  previewTask(task: TaskView): Promise<MergePreview>
  deliverTask(task: TaskView): Promise<TaskView>
  archiveTask(task: TaskView): Promise<TaskView>
  discardTask(task: TaskView): Promise<TaskView>
  recover(): Promise<DoctorView>
  startTaskSession(path: string, title?: string): Promise<void>
  /** Create the workspace, then connect its blank session and return the new session id (caller owns navigation). */
  startTaskSessionId(path: string, title?: string): Promise<string>
  /** Navigate the shell to one session. */
  openSession(sessionId: string): void
  /** Resolve the session's composer input shell (undefined when the conversation service is unavailable). */
  composerShell(sessionId: string): ComposerShellFace | undefined
  /**
   * Execute one slash-command line against the session's agent (the same
   * admission path the composer's access-mode dropdown uses). Resolves to
   * whether the command was admitted; false when the session face is absent.
   */
  sendCommand(sessionId: string, line: string): Promise<boolean>
  openPath(path: string): Promise<void>
}

/** Load the dashboard with an abortable GET. */
export async function loadDashboard(repository?: string, signal?: AbortSignal): Promise<DashboardView> {
  const query = repository === undefined ? '' : `?repository=${encodeURIComponent(repository)}`
  return await request<DashboardView>(`${ROUTE}${query}`, undefined, signal)
}

/** List the authenticated GitHub account's repositories with clone markers. */
export async function listGitHubRepositories(): Promise<readonly GitHubRepoView[]> {
  return await post<{ readonly repositories: readonly GitHubRepoView[] }>({ operation: 'github.list' })
    .then(value => value.repositories)
}

/** Post one operation and unwrap the stable envelope. */
export async function post<T>(body: Record<string, unknown>): Promise<T> {
  return await request<T>(ROUTE, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function request<T>(url: string, init?: RequestInit, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { ...init, ...(signal === undefined ? {} : { signal }) })
  let envelope: SuccessEnvelope<T> | ErrorEnvelope
  try {
    envelope = await response.json() as SuccessEnvelope<T> | ErrorEnvelope
  } catch {
    throw new Error(`worktree-studio request failed (${String(response.status)})`)
  }
  if (!response.ok || !envelope.ok) {
    const failure = envelope as ErrorEnvelope
    throw new Error(`${failure.error.code}: ${failure.error.message}`)
  }
  return envelope.value
}

