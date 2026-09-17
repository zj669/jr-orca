import { describe, expect, it, vi } from 'vitest'
import type { JrReviewLaunchRequest } from '../../../shared/jr/jr-types'
import { createJrCardReviewAgentLauncher } from './jr-card-review-agent-launch'

const controller = { kind: 'human-controller' as const, id: 'walker' }
const request: JrReviewLaunchRequest = {
  cardId: 'card-1',
  title: 'Review launch',
  harness: 'claude',
  model: { id: 'sonnet', label: 'Sonnet', capabilitySource: 'orca-session-catalog' },
  worktree: { id: 'repo-1::/feature', path: '/feature', branch: 'jr/review' },
  prompt: 'Follow jr-trellis-check and persist review.md findings.'
}

describe('JR review agent launch', () => {
  it('launches the selected review harness in the existing worktree', async () => {
    const seedTrellisSession = vi.fn().mockResolvedValue(undefined)
    const launchAgent = vi.fn().mockResolvedValue({
      agent: 'claude',
      tabId: 'tab-1',
      paneKey: 'tab-1:pane-1',
      ptyId: 'pty-1'
    })
    const launcher = createJrCardReviewAgentLauncher({
      seedTrellisSession,
      launchAgent,
      blockExecution: vi.fn().mockResolvedValue(undefined)
    })

    await launcher.launch(request, controller)

    expect(seedTrellisSession).toHaveBeenCalledWith('card-1', '/feature')
    expect(launchAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'claude',
        worktreeId: 'repo-1::/feature',
        prompt: expect.stringContaining('jr-trellis-check'),
        sessionOptions: { model: 'sonnet' },
        title: 'JR 审查 · Review launch'
      })
    )
  })

  it('blocks a verifying card when the review harness exits unsuccessfully', async () => {
    let reportExit: (code: number) => void = () => {
      throw new Error('The review launcher did not subscribe to exits.')
    }
    const blockExecution = vi.fn().mockResolvedValue(undefined)
    const launcher = createJrCardReviewAgentLauncher({
      seedTrellisSession: vi.fn().mockResolvedValue(undefined),
      launchAgent: vi.fn().mockImplementation(async (args: { onExit: (code: number) => void }) => {
        reportExit = args.onExit
        return { agent: 'claude', tabId: 'tab-1', paneKey: 'tab-1:pane-1', ptyId: 'pty-1' }
      }),
      blockExecution
    })

    await launcher.launch(request, controller)
    reportExit(2)

    await vi.waitFor(() => {
      expect(blockExecution).toHaveBeenCalledWith(
        'card-1',
        'Orca review harness exited with code 2.',
        controller
      )
    })
  })
})
