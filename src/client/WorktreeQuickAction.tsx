import { useState, type ReactNode } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { IconBranchOutline16, IconWarningOutline16, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TaskView } from '../types.ts'
import type { StudioClientActions } from './api.ts'
import css from './WorktreeStudio.module.css'

/** Slot-composed quick-action props. */
export type WorktreeQuickActionProps =
  PropsRuntime<'conversation.input.left'>
  & PropsLocale<'worktreeStudio'>
  & InjectFace<StudioClientActions>

/** Last path segment of a host repository path, working for both separators. */
function repoNameOf(repository: string): string {
  const name = repository.split(/[\\/]/u).filter(segment => segment !== '').pop() ?? repository
  return name === '' ? 'worktree' : name
}

/** Local HH:mm stamp distinguishing multiple worktrees of one repository. */
function clockStamp(): string {
  const now = new Date()
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

/**
 * Composer tool-row one-click worktree: creates a task from the session's
 * repository at the freshly fetched origin default branch and opens the new
 * session on it. Task, branch, and workspace naming lead with the source
 * repository's name. Renders nothing when the session has no repository path.
 */
export function WorktreeQuickAction(props: WorktreeQuickActionProps): ReactNode {
  const { sessionId, useSessions, useWorkspaces, t, createTask, startTaskSession } = props
  const workspacePath = useWorkspaces(state =>
    state.items.find(workspace => workspace.sessionIds.includes(sessionId))?.path)
  const sessionCwd = useSessions(state => state.byId[sessionId]?.cwd)
  const repository = workspacePath ?? sessionCwd
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  if (repository === undefined || repository === '') return null

  const create = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    setError(undefined)
    try {
      const name = repoNameOf(repository)
      const task: TaskView = await createTask({
        repository,
        title: `${name} worktree`,
      })
      await startTaskSession(task.workspacePath, `${name} wt ${clockStamp()}`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  const label = error === undefined ? t('quickWorktree') : t('quickFailed')
  const hint = error === undefined ? t('quickHint') : `${t('quickFailed')}: ${error}`
  return (
    <Tooltip label={() => hint} side="top" delayMs={400}>
      <button
        type="button"
        className={css.quickAction}
        data-error={error === undefined ? undefined : 'true'}
        aria-label={hint}
        disabled={busy}
        onClick={() => { void create() }}
      >
        {error === undefined
          ? <IconBranchOutline16 size={16} />
          : <IconWarningOutline16 size={16} />}
        <span>{busy ? t('quickBusy') : label}</span>
      </button>
    </Tooltip>
  )
}
