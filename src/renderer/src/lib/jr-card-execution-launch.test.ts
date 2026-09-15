import { describe, expect, it, vi } from 'vitest'
import type { JrExecutionLaunchRequest } from '../../../shared/jr/jr-types'

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

const controller = { kind: 'human-controller' as const, id: 'walker' }
const request: JrExecutionLaunchRequest = {
  cardId: 'card-1',
  title: 'Launch JR task',
  harness: 'cursorcli',
  model: { id: 'default', label: 'Orca 默认模型', capabilitySource: 'orca-default' },
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
      recordAgentStarted,
      recordAgentStatus: vi.fn().mockResolvedValue(undefined),
      recordAgentExit: vi.fn().mockResolvedValue(undefined),
      blockExecution: vi.fn().mockResolvedValue(undefined),
      createId: () => 'creation-1'
    })

    await launcher.launch(request.cardId, controller)

    expect(recordWorktreeProgress).toHaveBeenCalledWith('card-1', 'fetching', controller)
    expect(recordWorktreeCreated).toHaveBeenCalledWith(
      'card-1',
      { id: 'repo-1::/worktree', path: '/worktree', branch: 'jr/launch' },
      controller
    )
    expect(launchAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'cursor',
        worktreeId: 'repo-1::/worktree',
        prompt: 'DB-backed Trellis prompt',
        title: 'JR · Launch JR task'
      })
    )
    expect(recordAgentStarted).toHaveBeenCalledWith(
      'card-1',
      { agent: 'cursor', tabId: 'tab-1', paneKey: 'tab-1:pane-1', ptyId: 'pty-1' },
      controller
    )
  })

  it('persists a blocked card when native worktree creation fails', async () => {
    const blockExecution = vi.fn().mockResolvedValue(undefined)
    const launcher = createJrCardExecutionLauncher({
      prepareExecution: vi.fn().mockResolvedValue(request),
      createWorktree: vi.fn().mockRejectedValue(new Error('base ref is unavailable')),
      launchAgent: vi.fn(),
      subscribeWorktreeProgress: () => vi.fn(),
      recordWorktreeProgress: vi.fn().mockResolvedValue(undefined),
      recordWorktreeCreated: vi.fn().mockResolvedValue(undefined),
      recordAgentStarted: vi.fn().mockResolvedValue(undefined),
      recordAgentStatus: vi.fn().mockResolvedValue(undefined),
      recordAgentExit: vi.fn().mockResolvedValue(undefined),
      blockExecution,
      createId: () => 'creation-2'
    })

    await expect(launcher.launch(request.cardId, controller)).rejects.toThrow(
      'base ref is unavailable'
    )

    expect(blockExecution).toHaveBeenCalledWith('card-1', 'base ref is unavailable', controller)
  })
})
