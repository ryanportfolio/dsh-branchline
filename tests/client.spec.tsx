// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { createElement } = await import('react')
  const Icon = (): ReactNode => createElement('span', { 'aria-hidden': 'true' })
  return {
    Button: ({ icon, children, ...rest }: { readonly icon?: ReactNode; readonly children?: ReactNode } & Record<string, unknown>) =>
      createElement('button', { type: 'button', ...rest }, icon, children),
    Tooltip: ({ children }: { readonly children: ReactNode }) => children,
    Modal: ({ open, children }: { readonly open: boolean; readonly children: ReactNode }) => open ? children : null,
    RiskConfirmation: ({
      title, acknowledgeLabel, cancelLabel, confirmLabel, acknowledged,
      onAcknowledgedChange, onCancel, onConfirm,
    }: {
      readonly title: string
      readonly acknowledgeLabel: string
      readonly cancelLabel: string
      readonly confirmLabel: string
      readonly acknowledged: boolean
      readonly onAcknowledgedChange: (value: boolean) => void
      readonly onCancel: () => void
      readonly onConfirm: () => void
    }) => createElement('div', { role: 'dialog', 'aria-label': title },
      createElement('label', null,
        createElement('input', {
          type: 'checkbox',
          checked: acknowledged,
          onChange: (event: { currentTarget: { checked: boolean } }) => { onAcknowledgedChange(event.currentTarget.checked) },
        }),
        acknowledgeLabel,
      ),
      createElement('button', { type: 'button', onClick: onCancel }, cancelLabel),
      createElement('button', { type: 'button', disabled: !acknowledged, onClick: onConfirm }, confirmLabel),
    ),
    IconArchiveOutline20: Icon,
    IconBranchOutline16: Icon,
    IconCheckOutline16: Icon,
    IconCloseOutline16: Icon,
    IconFolderOpenOutline16: Icon,
    IconInspectOutline12: Icon,
    IconPlayOutline16: Icon,
    IconPlusOutline16: Icon,
    IconRefreshOutline16: Icon,
    IconTrashOutline16: Icon,
    IconWarningOutline16: Icon,
  }
})

import { WorktreeStudio, type WorktreeStudioProps } from '../src/client/WorktreeStudio.tsx'
import { WorktreeQuickAction, type WorktreeQuickActionProps } from '../src/client/WorktreeQuickAction.tsx'
import { en, type StudioLocaleKey } from '../src/client/locales.ts'
import { TaskId, type DashboardView, type TaskView } from '../src/types.ts'
import type { SessionListState, WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client'

afterEach(() => { cleanup() })

const task = (): TaskView => ({
  id: TaskId('wt-11111111-1111-4111-8111-111111111111'),
  title: 'Improve checkout flow',
  repository: 'C:\\repo',
  commonDirectory: 'C:\\repo\\.git',
  path: 'C:\\worktrees\\checkout-flow',
  workspacePath: 'C:\\worktrees\\checkout-flow',
  branch: 'dsh/checkout-flow',
  currentBranch: 'dsh/checkout-flow',
  baseCommit: 'a'.repeat(40),
  headCommit: 'b'.repeat(40),
  createdAt: '2026-08-19T00:00:00.000Z',
  updatedAt: '2026-08-19T00:01:00.000Z',
  phase: 'validated',
  validationCommand: ['pnpm', 'test'],
  lastValidation: {
    command: ['pnpm', 'test'],
    exitCode: 0,
    timedOut: false,
    passed: true,
    startedAt: '2026-08-19T00:00:10.000Z',
    completedAt: '2026-08-19T00:00:12.000Z',
    stdout: '8 tests passed',
    stderr: '',
    changeToken: 'c'.repeat(64),
  },
  changes: { dirty: false, staged: 0, unstaged: 0, untracked: 0, commitsAhead: 1 },
  exists: true,
  changeToken: 'c'.repeat(64),
})

function dashboard(tasks: readonly TaskView[], deliveryEnabled = true): DashboardView {
  return { repository: 'C:\\repo', repositories: ['C:\\repo'], tasks, deliveryEnabled }
}

function props(overrides: Partial<WorktreeStudioProps> = {}): WorktreeStudioProps {
  const empty = dashboard([])
  const workspaceState = {
    items: [{
      workspaceId: 'workspace-1',
      path: 'C:\\repo',
      title: 'repo',
      sessionIds: [],
      createdAt: '2026-08-19T00:00:00.000Z',
      updatedAt: '2026-08-19T00:00:00.000Z',
    }],
    archivedSessionIds: [],
    state: 'idle',
    phase: 'ready',
    error: null,
    baselinesReady: true,
    recentWorkspaceId: 'workspace-1',
  } as unknown as WorkspaceListState
  const sessionState = {
    ids: [],
    byId: {},
    current: undefined,
    phase: 'ready',
    error: null,
  } as unknown as SessionListState
  return {
    wide: true,
    t: ((key: StudioLocaleKey) => en[key]) as WorktreeStudioProps['t'],
    useWorkspaces: ((selector: (state: WorkspaceListState) => unknown) => selector(workspaceState)) as WorktreeStudioProps['useWorkspaces'],
    useSessions: ((selector: (state: SessionListState) => unknown) => selector(sessionState)) as WorktreeStudioProps['useSessions'],
    loadDashboard: vi.fn().mockResolvedValue(empty),
    createTask: vi.fn(),
    inspectTask: vi.fn(),
    validateTask: vi.fn(),
    previewTask: vi.fn(),
    deliverTask: vi.fn(),
    archiveTask: vi.fn(),
    discardTask: vi.fn(),
    recover: vi.fn(),
    startTaskSession: vi.fn(),
    openPath: vi.fn(),
    ...overrides,
  } as unknown as WorktreeStudioProps
}

describe('WorktreeStudio', () => {
  it('creates a task and opens its native DSH workspace session', async () => {
    const created = task()
    const createTask = vi.fn().mockResolvedValue(created)
    const startTaskSession = vi.fn().mockResolvedValue(undefined)
    render(<WorktreeStudio {...props({ createTask, startTaskSession })} />)

    fireEvent.click(screen.getByRole('button', { name: 'Worktree tasks' }))
    await screen.findByRole('heading', { name: 'DSH Branchline' })
    fireEvent.click(screen.getByRole('button', { name: 'New task' }))
    fireEvent.change(screen.getByLabelText('Task title'), { target: { value: 'Improve checkout flow' } })
    fireEvent.change(screen.getByLabelText('Validation command'), { target: { value: 'pnpm test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create and open session' }))

    await waitFor(() => {
      expect(createTask).toHaveBeenCalledWith({
        repository: 'C:\\repo',
        title: 'Improve checkout flow',
        validationCommand: 'pnpm test',
      })
      expect(startTaskSession).toHaveBeenCalledWith(created.workspacePath)
    })
  })

  it('does not offer local merge delivery in review-only mode', async () => {
    const selected = task()
    const loadDashboard = vi.fn().mockResolvedValue(dashboard([selected], false))
    render(<WorktreeStudio {...props({ loadDashboard })} />)

    fireEvent.click(screen.getByRole('button', { name: 'Worktree tasks' }))
    await screen.findByText(selected.title)
    expect(screen.queryByRole('button', { name: 'Deliver' })).toBeNull()
    expect(screen.getByText('Review only: branch remains intact')).toBeTruthy()
  })

  it('keeps the all-repositories filter selected', async () => {
    const selected = task()
    const loadDashboard = vi.fn((repository?: string) => Promise.resolve(
      repository === undefined ? dashboard([selected]) : dashboard([]),
    ))
    render(<WorktreeStudio {...props({ loadDashboard })} />)

    fireEvent.click(screen.getByRole('button', { name: 'Worktree tasks' }))
    const repository = await screen.findByLabelText('Repository') as HTMLSelectElement
    fireEvent.change(repository, { target: { value: '' } })

    await screen.findByText(selected.title)
    expect(repository.value).toBe('')
  })

  it('requires a passing merge check and explicit acknowledgement before delivery', async () => {
    const selected = task()
    const loadDashboard = vi.fn().mockResolvedValue(dashboard([selected]))
    const previewTask = vi.fn().mockResolvedValue({
      canMerge: true,
      targetPath: selected.repository,
      targetHead: 'd'.repeat(40),
      sourceHead: selected.headCommit,
      targetDirty: false,
      conflicts: [],
    })
    const deliverTask = vi.fn().mockResolvedValue({ ...selected, phase: 'delivered' })
    render(<WorktreeStudio {...props({ loadDashboard, previewTask, deliverTask })} />)

    fireEvent.click(screen.getByRole('button', { name: 'Worktree tasks' }))
    await screen.findByText(selected.title)
    const deliver = screen.getByRole('button', { name: 'Deliver' })
    expect((deliver as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Merge check' }))
    await screen.findByText('Merge check passed')
    expect((deliver as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(deliver)
    fireEvent.click(screen.getByRole('checkbox', { name: 'I reviewed the current task and target state.' }))
    fireEvent.click(screen.getByRole('button', { name: 'Merge task' }))

    await waitFor(() => { expect(deliverTask).toHaveBeenCalledWith(selected) })
  })
})

describe('WorktreeQuickAction', () => {
  const SESSION = 'session-1' as WorktreeQuickActionProps['sessionId']

  function workspaceState(sessionIds: readonly string[]): WorkspaceListState {
    return {
      items: [{
        workspaceId: 'workspace-1',
        path: 'C:\\repo',
        title: 'repo',
        sessionIds: [...sessionIds],
        createdAt: '2026-08-19T00:00:00.000Z',
        updatedAt: '2026-08-19T00:00:00.000Z',
      }],
      archivedSessionIds: [],
      state: 'idle',
      phase: 'ready',
      error: null,
      baselinesReady: true,
      recentWorkspaceId: 'workspace-1',
    } as unknown as WorkspaceListState
  }

  function sessionState(byId: Record<string, { readonly cwd?: string; readonly blank?: boolean; readonly agentPreset?: string }>): SessionListState {
    return {
      ids: [],
      byId,
      current: undefined,
      phase: 'ready',
      error: null,
    } as unknown as SessionListState
  }

  function quickProps(overrides: Partial<WorktreeQuickActionProps> = {}): WorktreeQuickActionProps {
    return {
      sessionId: SESSION,
      t: ((key: StudioLocaleKey) => en[key]) as WorktreeQuickActionProps['t'],
      useSession: ((selector: (state: { readonly blank?: boolean }) => unknown) => selector({ blank: true })) as WorktreeQuickActionProps['useSession'],
      useWorkspaces: ((selector: (state: WorkspaceListState) => unknown) => selector(workspaceState([SESSION]))) as WorktreeQuickActionProps['useWorkspaces'],
      // Brand-new blank session baseline: both blank bits true.
      useSessions: ((selector: (state: SessionListState) => unknown) => selector(sessionState({ [SESSION]: { blank: true } }))) as WorktreeQuickActionProps['useSessions'],
      useProjection: undefined,
      createTask: vi.fn(),
      startTaskSession: vi.fn(),
      startTaskSessionId: vi.fn(),
      openSession: vi.fn(),
      composerShell: () => undefined,
      sendCommand: vi.fn().mockResolvedValue(true),
      ...overrides,
    } as unknown as WorktreeQuickActionProps
  }

  /** Mutable structural fake of the composer input shell the toggle wraps. */
  function fakeShell(initialDraft: string) {
    const shell = {
      draft: initialDraft,
      submitted: [] as (string | undefined)[],
      state: {
        getSnapshot: () => ({
          draft: shell.draft,
          imageIds: [] as readonly unknown[],
          phase: 'plain' as const,
        }),
      },
      setDraft: (text: string) => {
        shell.draft = text
      },
      submit: (mode?: string) => {
        shell.submitted.push(mode)
      },
    }
    return shell
  }

  it('starts armed and moves the next submit into a fresh worktree session', async () => {
    const created = task()
    const createTask = vi.fn().mockResolvedValue(created)
    const startTaskSessionId = vi.fn().mockResolvedValue('session-2')
    const openSession = vi.fn()
    const source = fakeShell('build the thing')
    const next = fakeShell('')
    const composerShell = vi.fn((id: string) => (id === SESSION ? source : next))
    render(<WorktreeQuickAction {...quickProps({ createTask, startTaskSessionId, openSession, composerShell })} />)
    expect(screen.getByRole('button', { name: 'Checked: your next submit creates a fresh worktree off origin/main and sends there' })).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Checked: your next submit creates a fresh worktree off origin/main and sends there' }) as HTMLButtonElement).ariaPressed).toBe('true')

    source.submit('queue')

    await waitFor(() => {
      expect(createTask).toHaveBeenCalledWith({
        repository: 'C:\\repo',
        title: 'repo worktree',
      })
      expect(startTaskSessionId).toHaveBeenCalledWith(created.workspacePath, expect.stringMatching(/^repo wt \d{2}:\d{2}$/u))
    })
    expect(source.draft).toBe('')
    expect(source.submitted).toEqual([])
    expect(next.draft).toBe('build the thing')
    expect(openSession).toHaveBeenCalledWith('session-2')
    expect(next.submitted).toEqual(['queue'])
    // Stays armed across the launch; only a manual uncheck turns it off.
    await screen.findByRole('button', { name: 'Checked: your next submit creates a fresh worktree off origin/main and sends there' })
  })

  it('carries the source access mode into the worktree session before its first submit', async () => {
    const created = task()
    const createTask = vi.fn().mockResolvedValue(created)
    const startTaskSessionId = vi.fn().mockResolvedValue('session-2')
    const openSession = vi.fn()
    const order: string[] = []
    const sendCommand = vi.fn(async (_sessionId: string, line: string) => {
      order.push(line)
      return true
    })
    const source = fakeShell('build the thing')
    const next = fakeShell('')
    next.submitted = []
    const originalNextSubmit = next.submit.bind(next)
    next.submit = (mode?: string) => {
      order.push('submit')
      originalNextSubmit(mode)
    }
    const composerShell = vi.fn((id: string) => (id === SESSION ? source : next))
    render(<WorktreeQuickAction {...quickProps({
      createTask,
      startTaskSessionId,
      openSession,
      composerShell,
      sendCommand,
      useProjection: ((key: string) => key === 'permissions' ? { currentValue: 'danger-full-access', options: [] } : undefined) as WorktreeQuickActionProps['useProjection'],
    })} />)

    source.submit('queue')

    await waitFor(() => { expect(next.submitted).toEqual(['queue']) })
    expect(sendCommand).toHaveBeenCalledWith('session-2', '/permission danger-full-access')
    // The preset must land before the first submit reaches the new session.
    expect(order).toEqual(['/permission danger-full-access', 'submit'])
  })

  it('carries the source agent preset into the worktree session before its first submit', async () => {
    const created = task()
    const createTask = vi.fn().mockResolvedValue(created)
    const startTaskSessionId = vi.fn().mockResolvedValue('session-2')
    const openSession = vi.fn()
    const order: string[] = []
    const setAgentPreset = vi.fn(async (_sessionId: string, agentPreset: string) => {
      order.push('preset:' + agentPreset)
      return true
    })
    const source = fakeShell('build the thing')
    const next = fakeShell('')
    const originalNextSubmit = next.submit.bind(next)
    next.submit = (mode?: string) => {
      order.push('submit')
      originalNextSubmit(mode)
    }
    const composerShell = vi.fn((id: string) => (id === SESSION ? source : next))
    render(<WorktreeQuickAction {...quickProps({
      createTask,
      startTaskSessionId,
      openSession,
      composerShell,
      setAgentPreset,
      useSessions: ((selector: (state: SessionListState) => unknown) => selector(sessionState({ [SESSION]: { blank: true, agentPreset: 'cordis' } }))) as WorktreeQuickActionProps['useSessions'],
    })} />)

    source.submit('queue')

    await waitFor(() => { expect(next.submitted).toEqual(['queue']) })
    expect(setAgentPreset).toHaveBeenCalledWith('session-2', 'cordis')
    // The agent preset must land before the first submit reaches the new session.
    expect(order).toEqual(['preset:cordis', 'submit'])
  })

  it('skips the permission carry-over for a custom or unreadable access mode', async () => {
    const created = task()
    const createTask = vi.fn().mockResolvedValue(created)
    const startTaskSessionId = vi.fn().mockResolvedValue('session-2')
    const sendCommand = vi.fn().mockResolvedValue(true)
    const source = fakeShell('build the thing')
    const next = fakeShell('')
    const composerShell = vi.fn((id: string) => (id === SESSION ? source : next))
    render(<WorktreeQuickAction {...quickProps({
      createTask,
      startTaskSessionId,
      composerShell,
      sendCommand,
      useProjection: ((key: string) => key === 'permissions' ? { currentValue: 'custom', options: [] } : undefined) as WorktreeQuickActionProps['useProjection'],
    })} />)

    source.submit('queue')

    await waitFor(() => { expect(next.submitted).toEqual(['queue']) })
    expect(sendCommand).not.toHaveBeenCalled()
  })

  it('passes submits through once manually unchecked', () => {
    const createTask = vi.fn()
    const source = fakeShell('build the thing')
    const composerShell = vi.fn(() => source)
    render(<WorktreeQuickAction {...quickProps({ createTask, composerShell })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Checked: your next submit creates a fresh worktree off origin/main and sends there' }))
    expect(screen.getByRole('button', { name: 'Unchecked: your next submit sends in this session' })).toBeTruthy()

    source.submit('queue')

    expect(source.submitted).toEqual(['queue'])
    expect(source.draft).toBe('build the thing')
    expect(createTask).not.toHaveBeenCalled()
  })

  it('passes submits through while the draft is empty or carries images', () => {
    const createTask = vi.fn()
    const source = fakeShell('')
    const composerShell = vi.fn(() => source)
    render(<WorktreeQuickAction {...quickProps({ createTask, composerShell })} />)

    source.submit('queue')

    expect(source.submitted).toEqual(['queue'])
    expect(createTask).not.toHaveBeenCalled()
  })

  it('renders nothing once the session has messages (in-session composers never intercept)', () => {
    const { container } = render(<WorktreeQuickAction {...quickProps({
      useSession: ((selector: (state: { readonly blank?: boolean }) => unknown) => selector({ blank: false })) as WorktreeQuickActionProps['useSession'],
    })} />)
    expect(container.childElementCount).toBe(0)
  })

  it('never intercepts an in-session reply even while armed by default', () => {
    const createTask = vi.fn()
    const source = fakeShell('a reply')
    const composerShell = vi.fn(() => source)
    render(<WorktreeQuickAction {...quickProps({
      createTask,
      composerShell,
      useSession: ((selector: (state: { readonly blank?: boolean }) => unknown) => selector({ blank: false })) as WorktreeQuickActionProps['useSession'],
    })} />)

    source.submit('queue')

    expect(source.submitted).toEqual(['queue'])
    expect(source.draft).toBe('a reply')
    expect(createTask).not.toHaveBeenCalled()
  })

  it('never renders or intercepts while only the scope blank bit is true (existing-session mount window)', () => {
    const createTask = vi.fn()
    const source = fakeShell('a reply')
    const composerShell = vi.fn(() => source)
    // The conversation scope initializes blank=true even for an existing
    // session; the summary bit is false from the first render and must win.
    const { container } = render(<WorktreeQuickAction {...quickProps({
      createTask,
      composerShell,
      useSessions: ((selector: (state: SessionListState) => unknown) => selector(sessionState({ [SESSION]: { blank: false } }))) as WorktreeQuickActionProps['useSessions'],
    })} />)

    expect(container.childElementCount).toBe(0)

    source.submit('queue')

    expect(source.submitted).toEqual(['queue'])
    expect(source.draft).toBe('a reply')
    expect(createTask).not.toHaveBeenCalled()
  })

  it('degrades a lingering override to the ordinary send once the summary clears the gate', () => {
    const createTask = vi.fn()
    const source = fakeShell('a second reply')
    const composerShell = vi.fn(() => source)
    const base = quickProps({ createTask, composerShell })
    const summaryTrue = ((selector: (state: SessionListState) => unknown) => selector(sessionState({ [SESSION]: { blank: true } }))) as WorktreeQuickActionProps['useSessions']
    const summaryFalse = ((selector: (state: SessionListState) => unknown) => selector(sessionState({ [SESSION]: { blank: false } }))) as WorktreeQuickActionProps['useSessions']
    const { rerender } = render(<WorktreeQuickAction {...base} useSessions={summaryTrue} />)

    // Gate flips after installation (first turn landed); a stale override must
    // still send ordinarily instead of forking.
    rerender(<WorktreeQuickAction {...base} useSessions={summaryFalse} />)
    source.submit('queue')

    expect(source.submitted).toEqual(['queue'])
    expect(source.draft).toBe('a second reply')
    expect(createTask).not.toHaveBeenCalled()
  })

  it('renders nothing when the session has no repository workspace', () => {
    const { container } = render(<WorktreeQuickAction {...quickProps({
      useWorkspaces: ((selector: (state: WorkspaceListState) => unknown) => selector(workspaceState([]))) as WorktreeQuickActionProps['useWorkspaces'],
      useSessions: ((selector: (state: SessionListState) => unknown) => selector(sessionState({}))) as WorktreeQuickActionProps['useSessions'],
    })} />)
    expect(container.childElementCount).toBe(0)
  })

  it('falls back to the session cwd when no workspace accounts the session', () => {
    render(<WorktreeQuickAction {...quickProps({
      useWorkspaces: ((selector: (state: WorkspaceListState) => unknown) => selector(workspaceState([]))) as WorktreeQuickActionProps['useWorkspaces'],
      useSessions: ((selector: (state: SessionListState) => unknown) => selector(sessionState({ [SESSION]: { cwd: 'C:\\repo', blank: true } }))) as WorktreeQuickActionProps['useSessions'],
    })} />)
    expect(screen.getByRole('button', { name: 'Checked: your next submit creates a fresh worktree off origin/main and sends there' })).toBeTruthy()
  })

  it('surfaces creation failure as a retryable warning state and restores the draft', async () => {
    const createTask = vi.fn().mockRejectedValue(new Error('git fetch failed'))
    const source = fakeShell('build the thing')
    const composerShell = vi.fn(() => source)
    render(<WorktreeQuickAction {...quickProps({ createTask, composerShell })} />)

    source.submit('queue')

    await screen.findByRole('button', { name: 'Worktree creation failed: git fetch failed' })
    expect(source.draft).toBe('build the thing')
  })
})
