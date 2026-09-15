import { describe, expect, it, vi } from 'vitest'
import type { JrControllerActor, JrExecutionLaunchRequest } from '../../../shared/jr/jr-types'

vi.mock('@/lib/new-workspace', () => ({
  getWorkspaceSeedName: vi.fn()
}))
vi.mock('@/lib/launch-agent-background-session', () => ({
  launchAgentBackgroundSession: vi.fn()
}))
vi.mock('@/store', () => ({
  useAppStore: { getState: vi.fn() }
}))

import { createJrCardExecutionLauncher } from './jr-card-execution-launch'

const controller: JrControllerActor = { kind: 'human-controller', id: 'walker' }
const request: JrExecutionLaunchRequest = {
  cardId: 'card-1',
  title: 'Launch JR task',
  harness: 'cursorcli',
  model: { id: 'auto', label: 'Auto', capabilitySource: 'orca-session-catalog' },
  execution: { repositoryId: 'repo-1', baseRef: 'main', setupDecision: 'inherit' },
  prompt: 'DB-backed Trellis prompt'
}

describe('JR card execution launch', () => {
  it('creates a native worktree, records it, then starts the mapped Orca harness', async () => {
    let progressListener:
      | ((progress: { creationId?: string; phase: 'fetching' | 'creating' }) => void)
      | null = null
    const recordWorktreeProgress = vi.fn().mockResolvedValue(undefined)
    const recordWorktreeCreated = vi.fn().mockResolvedValue(undefined)
    const seedTrellisSession = vi.fn().mockResolvedValue(undefined)
    const recordAgentStarted = vi.fn().mockResolvedValue(undefined)
    const launchAgent = vi
      .fn()
      .mockImplementation(
        async (args: {
          onAgentStatus: (status: 'working' | 'blocked' | 'waiting' | 'done') => void
        }) => {
          args.onAgentStatus('working')
          return { agent: 'cursor', tabId: 'tab-1', paneKey: 'tab-1:pane-1', ptyId: 'pty-1' }
        }
      )
    const launcher = createJrCardExecutionLauncher({
      ...idleDependencies(),
      prepareExecution: vi.fn().mockResolvedValue(request),
      createWorktree: vi.fn().mockImplementation(async (args) => {
        progressListener?.({ creationId: args.creationId, phase: 'fetching' })
        return { id: 'repo-1::/worktree', path: '/worktree', branch: 'jr/launch' }
      }),
      launchAgent,
      subscribeWorktreeProgress: (callback) => {
        progressListener = callback
        return vi.fn()
      },
      recordWorktreeProgress,
      recordWorktreeCreated,
      seedTrellisSession,
      recordAgentStarted,
      createId: () => 'creation-1'
    })

    await launcher.launch(request.cardId, controller)

    expect(recordWorktreeProgress).toHaveBeenCalledWith('card-1', 'fetching', controller)
    expect(recordWorktreeCreated).toHaveBeenCalledWith(
      'card-1',
      { id: 'repo-1::/worktree', path: '/worktree', branch: 'jr/launch' },
      controller
    )
    expect(seedTrellisSession).toHaveBeenCalledWith('card-1', '/worktree')
    expect(seedTrellisSession.mock.invocationCallOrder[0]).toBeLessThan(
      launchAgent.mock.invocationCallOrder[0]
    )
    expect(launchAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'cursor',
        worktreeId: 'repo-1::/worktree',
        prompt: 'DB-backed Trellis prompt',
        sessionOptions: { model: 'auto' },
        sessionOptionsOverrideAgentArgs: true,
        title: 'JR · Launch JR task'
      })
    )
    expect(recordAgentStarted).toHaveBeenCalledWith(
      'card-1',
      { agent: 'cursor', tabId: 'tab-1', paneKey: 'tab-1:pane-1', ptyId: 'pty-1' },
      controller
    )
  })

  it('auto-requests verification after a successful harness exit', async () => {
    let reportExit: (code: number) => void = () => {
      throw new Error('The launcher did not subscribe to the harness exit lifecycle.')
    }
    const recordAgentExit = vi.fn().mockResolvedValue(undefined)
    const requestReviewOnSuccess = vi.fn().mockResolvedValue(undefined)
    const launcher = createJrCardExecutionLauncher({
      ...idleDependencies(),
      launchAgent: vi.fn().mockImplementation(async (args: { onExit: (code: number) => void }) => {
        reportExit = args.onExit
        return { agent: 'cursor', tabId: 'tab-1', paneKey: 'tab-1:pane-1', ptyId: 'pty-1' }
      }),
      recordAgentExit,
      requestReviewOnSuccess
    })

    await launcher.launch(request.cardId, controller)
    reportExit(0)
    await vi.waitFor(() => {
      expect(requestReviewOnSuccess).toHaveBeenCalledWith('card-1', controller)
    })
    expect(recordAgentExit).toHaveBeenCalledWith('card-1', 0, controller)
    expect(recordAgentExit.mock.invocationCallOrder[0]).toBeLessThan(
      requestReviewOnSuccess.mock.invocationCallOrder[0]
    )
  })

  it('blocks when auto-verification fails after a successful harness exit', async () => {
    let reportExit: (code: number) => void = () => {
      throw new Error('The launcher did not subscribe to the harness exit lifecycle.')
    }
    const blockExecution = vi.fn().mockResolvedValue(undefined)
    const launcher = createJrCardExecutionLauncher({
      ...idleDependencies(),
      launchAgent: vi.fn().mockImplementation(async (args: { onExit: (code: number) => void }) => {
        reportExit = args.onExit
        return { agent: 'cursor', tabId: 'tab-1', paneKey: 'tab-1:pane-1', ptyId: 'pty-1' }
      }),
      requestReviewOnSuccess: vi.fn().mockRejectedValue(new Error('git.status failed')),
      blockExecution
    })

    await launcher.launch(request.cardId, controller)
    reportExit(0)
    await vi.waitFor(() => {
      expect(blockExecution).toHaveBeenCalledWith('card-1', 'git.status failed', controller)
    })
  })

  it('records a nonzero harness exit as blocked through the lifecycle subscription', async () => {
    let reportExit: (code: number) => void = () => {
      throw new Error('The launcher did not subscribe to the harness exit lifecycle.')
    }
    const blockExecution = vi.fn().mockResolvedValue(undefined)
    const requestReviewOnSuccess = vi.fn()
    const launcher = createJrCardExecutionLauncher({
      ...idleDependencies(),
      launchAgent: vi.fn().mockImplementation(async (args: { onExit: (code: number) => void }) => {
        reportExit = args.onExit
        return { agent: 'cursor', tabId: 'tab-1', paneKey: 'tab-1:pane-1', ptyId: 'pty-1' }
      }),
      requestReviewOnSuccess,
      blockExecution
    })

    await launcher.launch(request.cardId, controller)
    reportExit(2)
    await vi.waitFor(() => {
      expect(blockExecution).toHaveBeenCalledWith(
        'card-1',
        'Orca harness exited with code 2.',
        controller
      )
    })
    expect(requestReviewOnSuccess).not.toHaveBeenCalled()
  })

  it('persists a blocked card when native worktree creation fails', async () => {
    const blockExecution = vi.fn().mockResolvedValue(undefined)
    const launcher = createJrCardExecutionLauncher({
      ...idleDependencies(),
      createWorktree: vi.fn().mockRejectedValue(new Error('base ref is unavailable')),
      launchAgent: vi.fn(),
      blockExecution
    })

    await expect(launcher.launch(request.cardId, controller)).rejects.toThrow(
      'base ref is unavailable'
    )

    expect(blockExecution).toHaveBeenCalledWith('card-1', 'base ref is unavailable', controller)
  })
})

function idleDependencies() {
  return {
    prepareExecution: vi.fn().mockResolvedValue(request),
    createWorktree: vi
      .fn()
      .mockResolvedValue({ id: 'repo-1::/worktree', path: '/worktree', branch: 'jr/launch' }),
    launchAgent: vi.fn().mockResolvedValue({
      agent: 'cursor',
      tabId: 'tab-1',
      paneKey: 'tab-1:pane-1',
      ptyId: 'pty-1'
    }),
    subscribeWorktreeProgress: () => vi.fn(),
    recordWorktreeProgress: vi.fn().mockResolvedValue(undefined),
    recordWorktreeCreated: vi.fn().mockResolvedValue(undefined),
    seedTrellisSession: vi.fn().mockResolvedValue(undefined),
    recordAgentStarted: vi.fn().mockResolvedValue(undefined),
    recordAgentStatus: vi.fn().mockResolvedValue(undefined),
    recordAgentExit: vi.fn().mockResolvedValue(undefined),
    requestReviewOnSuccess: vi.fn().mockResolvedValue(undefined),
    blockExecution: vi.fn().mockResolvedValue(undefined),
    createId: () => 'creation-test'
  }
}
