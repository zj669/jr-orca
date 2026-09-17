import { describe, expect, it, vi } from 'vitest'
import type { JrExecutionRelaunchRequest } from '../../../shared/jr/jr-types'
import { createJrCardExecutionRelauncher } from './jr-card-execution-relaunch'

const controller = { kind: 'human-controller' as const, id: 'walker' }
const request: JrExecutionRelaunchRequest = {
  cardId: 'card-1',
  title: 'Address review findings',
  harness: 'cursorcli',
  model: { id: 'auto', label: 'Auto', capabilitySource: 'orca-session-catalog' },
  worktree: { id: 'repo-1::/feature', path: '/feature', branch: 'jr/review' },
  prompt: 'Address the persisted review.md findings before requesting verification.'
}

describe('JR execution relaunch', () => {
  it('reuses the existing worktree and launches the execution AI with findings', async () => {
    const prepareExecutionRelaunch = vi.fn().mockResolvedValue(request)
    const seedTrellisSession = vi.fn().mockResolvedValue(undefined)
    const launchAgent = vi.fn().mockResolvedValue({
      agent: 'cursor',
      tabId: 'tab-2',
      paneKey: 'tab-2:pane-1',
      ptyId: 'pty-2'
    })
    const recordAgentStarted = vi.fn().mockResolvedValue(undefined)
    const launcher = createJrCardExecutionRelauncher({
      prepareExecutionRelaunch,
      seedTrellisSession,
      launchAgent,
      recordAgentStarted,
      recordAgentStatus: vi.fn().mockResolvedValue(undefined),
      recordAgentExit: vi.fn().mockResolvedValue(undefined),
      requestReviewOnSuccess: vi.fn().mockResolvedValue(undefined),
      blockExecution: vi.fn().mockResolvedValue(undefined)
    })

    await launcher.launch('card-1', controller)

    expect(seedTrellisSession).toHaveBeenCalledWith('card-1', '/feature')
    expect(launchAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'cursor',
        worktreeId: 'repo-1::/feature',
        prompt: expect.stringContaining('review.md findings'),
        sessionOptions: { model: 'auto' },
        title: 'JR · Address review findings'
      })
    )
    expect(recordAgentStarted).toHaveBeenCalledWith(
      'card-1',
      { agent: 'cursor', tabId: 'tab-2', paneKey: 'tab-2:pane-1', ptyId: 'pty-2' },
      controller
    )
  })
})
