import { useEffect, useRef, useState, type ReactNode } from 'react'
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
 * Structural read of the `permissions` projection (the access-mode select the
 * composer dropdown renders). The key is declared by the host's
 * permission-presets domain, which is not a type dependency here, so the read
 * goes through a structural cast; `undefined` uniformly means the seat or the
 * key is absent.
 */
function permissionPresetOf(useProjection: unknown): string | undefined {
  if (typeof useProjection !== 'function') return undefined
  const select = (useProjection as (key: string) => unknown)('permissions') as
    | { readonly currentValue?: unknown }
    | undefined
  const value = select?.currentValue
  return typeof value === 'string' && value !== 'custom' ? value : undefined
}

/**
 * New-session-screen checkbox in the Claude Code mold: renders only on a blank
 * session (the brand-new session screen) and is armed by default there, so a
 * submit is intercepted — the prompt instead creates a fresh-origin worktree
 * task for the session's repository, opens the new session on it, and sends
 * there. Task, branch, and workspace naming lead with the source repository's
 * name. Drafts carrying images or non-plain composer phases fall through to the
 * ordinary submit. The source session's access mode rides along: the current
 * permission preset (the `permissions` projection) is re-issued as a
 * `/permission` command on the new session before its first submit, so a Full
 * access launch does not silently revert the worktree session to the host
 * default; `custom` and unreadable presets fall through. In-session composers
 * render nothing and never intercept:
 * the gate requires BOTH the conversation scope's blank bit AND the
 * sessions-summary empty-log bit, because the scope bit initializes true for
 * every freshly mounted scope (including an existing session whose summary has
 * yet to land) and only the summary is authoritative from the first render. A
 * submit-time re-check against the latest gate closes any remaining staleness
 * window between effect installation and the actual send. Renders nothing
 * when the session has no repository path.
 */
export function WorktreeQuickAction(props: WorktreeQuickActionProps): ReactNode {
  const { sessionId, useSession, useSessions, useWorkspaces, useProjection, t, createTask, composerShell, sendCommand, startTaskSessionId, openSession, setAgentPreset } = props
  const blank = useSession(state => state.blank)
  // Authoritative empty-log bit from the sessions summary: false from the first
  // render for an existing session, so it anchors the gate while the
  // conversation scope's own bit is still at its initial true.
  const summaryBlank = useSessions(state => state.byId[sessionId]?.blank)
  const workspacePath = useWorkspaces(state =>
    state.items.find(workspace => workspace.sessionIds.includes(sessionId))?.path)
  const sessionCwd = useSessions(state => state.byId[sessionId]?.cwd)
  const repository = workspacePath ?? sessionCwd
  const interceptable = blank === true && summaryBlank === true
  const interceptableRef = useRef(interceptable)
  interceptableRef.current = interceptable
  // The source session's access mode; undefined when the projection seat is
  // absent (older hosts, tests). Read fresh at launch time via the ref below.
  const permissionPresetRef = useRef<string>()
  permissionPresetRef.current = permissionPresetOf(useProjection)
  // The source session's agent preset (Creator / PTC / custom), read at launch
  // time from the sessions summary. The seat applies a pick to the current
  // blank session, so the source summary already carries the intended preset.
  const agentPresetRef = useRef<string>()
  agentPresetRef.current = useSessions(state =>
    (state.byId[sessionId] as { agentPreset?: string } | undefined)?.agentPreset)
  const [armed, setArmed] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const busyRef = useRef(false)
  const launchRef = useRef<(draft: string) => void>(() => {})

  const launch = (draft: string): void => {
    if (repository === undefined || repository === '') return
    const source = repository
    void (async () => {
      try {
        const name = repoNameOf(source)
        const task: TaskView = await createTask({
          repository: source,
          title: `${name} worktree`,
        })
        const nextSessionId = await startTaskSessionId(task.workspacePath, `${name} wt ${clockStamp()}`)
        const next = composerShell(nextSessionId)
        if (next === undefined) throw new Error(t('quickNoComposer'))
        next.setDraft(draft)
        // Carry the access mode before the first submit: the preset command is
        // the same admission path the composer's access-mode dropdown uses.
        const preset = permissionPresetRef.current
        if (preset !== undefined) {
          try {
            await sendCommand(nextSessionId, `/permission ${preset}`)
          } catch (reason) {
            console.warn('worktree quick action: permission carry-over failed:', reason)
          }
        }
        // Carry the source agent preset before the first submit, so a
        // Creator-mode launch does not silently revert the worktree session to
        // the deployment default (the `code` preset, shown as "PTC mode").
        const agentPreset = agentPresetRef.current
        if (agentPreset !== undefined && agentPreset !== '') {
          try {
            await setAgentPreset(nextSessionId, agentPreset)
          } catch (reason) {
            console.warn('worktree quick action: agent preset carry-over failed:', reason)
          }
        }
        openSession(nextSessionId)
        next.submit('queue')
        setError(undefined)
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : String(reason))
        // Put the prompt back so nothing the user typed is lost.
        composerShell(sessionId)?.setDraft(draft)
      } finally {
        busyRef.current = false
        setBusy(false)
      }
    })()
  }

  launchRef.current = launch

  useEffect(() => {
    // Intercept only on a genuinely blank new-session screen: both blank bits
    // must agree (see interceptable above), and the render return below hides
    // the button everywhere else.
    if (!armed || !interceptable) return
    const shell = composerShell(sessionId)
    if (shell === undefined) return
    const original = shell.submit.bind(shell)
    shell.submit = (mode?: string) => {
      const snapshot = shell.state.getSnapshot()
      const draft = snapshot.draft
      // Re-check the gate at submit time: an override lingering across a gate
      // flip must degrade to the ordinary send, never fork.
      const movable = interceptableRef.current
        && busyRef.current === false
        && draft.trim() !== ''
        && snapshot.imageIds.length === 0
        && snapshot.phase === 'plain'
      if (!movable) {
        original(mode)
        return
      }
      busyRef.current = true
      setBusy(true)
      setError(undefined)
      // Clear here first: the prompt must not also send in this session.
      shell.setDraft('')
      launchRef.current(draft)
    }
    return () => {
      shell.submit = original
    }
  }, [armed, interceptable, sessionId, composerShell])

  // New-session screen only: in-session composers never intercept.
  if (!interceptable) return null
  if (repository === undefined || repository === '') return null

  const hint = error !== undefined
    ? `${t('quickFailed')}: ${error}`
    : armed
      ? t('quickArmedHint')
      : t('quickHint')
  return (
    <Tooltip label={() => hint} side="top" delayMs={400}>
      <button
        type="button"
        className={css.quickAction}
        data-armed={armed ? 'true' : undefined}
        data-error={error === undefined ? undefined : 'true'}
        aria-pressed={armed}
        aria-label={hint}
        disabled={busy}
        onClick={() => {
          if (error !== undefined) setError(undefined)
          setArmed(value => !value)
        }}
      >
        {error === undefined
          ? <IconBranchOutline16 size={16} />
          : <IconWarningOutline16 size={16} />}
        <span>{busy ? t('quickBusy') : armed ? t('quickArmed') : t('quickWorktree')}</span>
      </button>
    </Tooltip>
  )
}
