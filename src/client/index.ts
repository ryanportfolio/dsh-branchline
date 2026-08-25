/** Browser plugin: sidebar launcher and session-linked task board. */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { MergePreview, TaskId, TaskView } from '../types.ts'
import { loadDashboard, listGitHubRepositories, post, type ComposerShellFace, type StudioClientActions } from './api.ts'
import { WorktreeStudio } from './WorktreeStudio.tsx'
import { WorktreeQuickAction } from './WorktreeQuickAction.tsx'
import { en, zh, type StudioLocaleKey } from './locales.ts'

export type { StudioClientActions } from './api.ts'
export type { WorktreeStudioProps } from './WorktreeStudio.tsx'
export type { StudioLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Worktree task lifecycle copy. */
    worktreeStudio: StudioLocaleKey
  }
}

const NS = 'worktreeStudio'

/** Client services and slot declarations required by the task board. */
export const inject = ['slots', 'locale', 'workspaces', 'sessions', 'conversation', 'connection']

/** Register localized callbacks and the sidebar footer contribution. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-branchline: dictionaries')

  const actions: StudioClientActions = {
    loadDashboard,
    createTask: input => post<TaskView>({ operation: 'create', ...input }),
    listGitHubRepositories,
    inspectTask: id => post({ operation: 'inspect', id }),
    validateTask: (task, command) => post<TaskView>({
      operation: 'validate',
      id: task.id,
      changeToken: task.changeToken,
      ...(command === undefined ? {} : { validationCommand: command }),
    }),
    previewTask: task => post<MergePreview>({ operation: 'preview', id: task.id }),
    deliverTask: task => post<TaskView>({
      operation: 'deliver',
      id: task.id,
      changeToken: task.changeToken,
    }),
    archiveTask: task => post<TaskView>({
      operation: 'archive',
      id: task.id,
      changeToken: task.changeToken,
    }),
    discardTask: task => post<TaskView>({
      operation: 'discard',
      id: task.id,
      changeToken: task.changeToken,
      confirmation: task.id,
    }),
    recover: () => post({ operation: 'recover' }),
    async startTaskSession(path, title) {
      const workspace = await ctx.workspaces.create({ path })
      if (title !== undefined && title !== '') {
        try {
          await ctx.workspaces.rename(workspace.workspaceId, title)
        } catch {
          // A workspace title conflict keeps the registry's default name.
        }
      }
      ctx.workspaces.startSession(workspace.workspaceId)
    },
    async startTaskSessionId(path, title) {
      const workspace = await ctx.workspaces.create({ path })
      if (title !== undefined && title !== '') {
        try {
          await ctx.workspaces.rename(workspace.workspaceId, title)
        } catch {
          // A workspace title conflict keeps the registry's default name.
        }
      }
      // Resolves synchronously-addressable: the binding exists on return, so the
      // caller may write the new scope's draft before navigating.
      return await ctx.workspaces.connectWorkspace(workspace.workspaceId)
    },
    openSession: sessionId => {
      // The published face has open(id); a host-side dsh-session augmentation
      // shadows it in this program's view, so route through a structural cast.
      ;(ctx.sessions as unknown as { open: (id: string) => void }).open(sessionId)
    },
    composerShell: sessionId => {
      // The runtime resolver carries the id-addressed `shell` accessor that the
      // published SessionInputResolver interface omits.
      const input = ctx.conversation?.input as unknown as
        | { shell?: (id: string) => ComposerShellFace | undefined }
        | undefined
      try {
        return input?.shell?.(sessionId)
      } catch {
        return undefined
      }
    },
    sendCommand: async (sessionId, line) => {
      // The runtime face carries binding(id) → session.command(line); the
      // published interface omits both, so route through a structural cast.
      const sessions = ctx.sessions as unknown as {
        binding?: (id: string) => { readonly session?: { command?: (line: string) => Promise<unknown> } } | undefined
      }
      const session = sessions.binding?.(sessionId)?.session
      const command = session?.command
      if (command === undefined) return false
      await command.call(session, line)
      return true
    },
setAgentPreset: async (sessionId, agentPreset) => {
  const connection = (ctx as unknown as { get?: (name: string) => unknown }).get?.('connection') as
    | { api?: { agentPresets?: { select?: (request: { sessionId: string; agentPreset: string }) => Promise<{ result: { ok: boolean } }> } } }
    | undefined
  const select = connection?.api?.agentPresets?.select
  if (select === undefined) return false
  const response = await select({ sessionId, agentPreset })
  return response?.result?.ok === true
},
openPath: path => ctx.workspaces.openPath(path),
  }

  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'branchline',
    order: 20,
    locale: NS,
    inject: (): StudioClientActions => actions,
  }, WorktreeStudio))

  ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
    name: 'conversation.input.left',
    id: 'branchline-quick',
    order: 10,
    locale: NS,
    inject: (): StudioClientActions => actions,
  }, WorktreeQuickAction))
}

