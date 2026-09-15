import { describe, expect, it, vi } from 'vitest'
import type { JrCard, JrShipRequest } from '../../../shared/jr/jr-types'
import {
  buildJrReviewSnapshot,
  createJrCardReviewLauncher,
  findJrBaseWorktree
} from './jr-card-review-launch'

const controller = { kind: 'human-controller' as const, id: 'walker' }
const compare = {
  summary: {
    baseRef: 'main',
    baseOid: 'base',
    compareRef: 'jr/task',
    headOid: 'head',
    mergeBase: 'base',
    changedFiles: 2,
    commitsAhead: 1,
    commitsBehind: 0,
    status: 'ready' as const
  },
  entries: [
    { path: 'src/a.ts', status: 'modified' as const },
    { path: 'src/b.ts', status: 'added' as const }
  ]
}

const executingCard: JrCard = {
  id: 'card-1',
  title: 'Review launch',
  description: 'Ship the change',
  status: 'executing',
  harness: 'cursorcli',
  model: { id: 'auto', label: 'Auto', capabilitySource: 'orca-session-catalog' },
  execution: {
    repositoryId: 'repo-1',
    baseRef: 'main',
    setupDecision: 'skip',
    worktree: { id: 'repo-1::/feature', path: '/feature', branch: 'jr/task' },
    worktreePhase: null,
    agentSession: {
      agent: 'cursor',
      tabId: 'tab-1',
      paneKey: 'tab-1:pane',
      ptyId: 'pty-1',
      status: 'done'
    }
  },
  review: null,
  delivery: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  artifacts: [],
  events: []
}

const ship: JrShipRequest = {
  cardId: 'card-1',
  title: 'Review launch',
  worktree: { id: 'repo-1::/feature', path: '/feature', branch: 'jr/task' },
  repositoryId: 'repo-1',
  baseRef: 'main',
  review: {
    worktreeId: 'repo-1::/feature',
    branch: 'jr/task',
    baseRef: 'main',
    headOid: 'head',
    mergeBase: 'base',
    changedFiles: 2,
    commitsAhead: 1,
    commitsBehind: 0,
    uncommittedFiles: 0,
    conflicted: false,
    compareStatus: 'ready',
    capturedAt: '2026-01-01T00:00:00.000Z'
  }
}

describe('JR card review launch', () => {
  it('snapshots Orca git status and branch compare, then opens review', async () => {
    const requestReview = vi.fn().mockResolvedValue(undefined)
    const revealReview = vi.fn()
    const launcher = createJrCardReviewLauncher({
      ...idleDependencies(),
      getCard: vi.fn().mockResolvedValue(executingCard),
      requestReview,
      revealReview,
      readStatus: vi.fn().mockResolvedValue({
        entries: [{ path: 'notes.md', status: 'modified', area: 'unstaged' }],
        conflictOperation: 'unknown'
      }),
      compareBranch: vi.fn().mockResolvedValue(compare)
    })

    await launcher.requestReview('card-1', controller)

    expect(requestReview).toHaveBeenCalledWith(
      'card-1',
      expect.objectContaining({
        worktreeId: 'repo-1::/feature',
        uncommittedFiles: 1,
        changedFiles: 2,
        compareStatus: 'ready'
      }),
      controller
    )
    expect(revealReview).toHaveBeenCalledWith('repo-1::/feature', '/feature', compare)
  })

  it('merges a hosted PR after controller approval', async () => {
    const recordMerged = vi.fn().mockResolvedValue(undefined)
    const mergePullRequest = vi.fn().mockResolvedValue({ ok: true })
    const launcher = createJrCardReviewLauncher({
      ...idleDependencies(),
      prepareShip: vi.fn().mockResolvedValue(ship),
      recordMerged,
      findPullRequest: vi.fn().mockResolvedValue({ number: 42, state: 'open' }),
      mergePullRequest,
      mergeIntoBase: vi.fn()
    })

    await launcher.approveMerge('card-1', controller)

    expect(mergePullRequest).toHaveBeenCalledWith({
      repoPath: '/repo',
      repoId: 'repo-1',
      prNumber: 42
    })
    expect(recordMerged).toHaveBeenCalledWith(
      'card-1',
      {
        method: 'hosted-pr',
        prNumber: 42,
        mergedInto: 'main',
        headOid: 'head'
      },
      controller
    )
  })

  it('falls back to the base worktree when no hosted PR exists', async () => {
    const mergeIntoBase = vi.fn().mockResolvedValue(undefined)
    const recordMerged = vi.fn().mockResolvedValue(undefined)
    const launcher = createJrCardReviewLauncher({
      ...idleDependencies(),
      prepareShip: vi.fn().mockResolvedValue(ship),
      recordMerged,
      findPullRequest: vi.fn().mockResolvedValue(null),
      mergeIntoBase
    })

    await launcher.approveMerge('card-1', controller)

    expect(mergeIntoBase).toHaveBeenCalledWith({
      baseWorktreePath: '/repo',
      branch: 'jr/task',
      expectedBaseRef: 'main'
    })
    expect(recordMerged).toHaveBeenCalledWith(
      'card-1',
      expect.objectContaining({ method: 'local-base-merge', prNumber: null }),
      controller
    )
  })

  it('blocks the card when hosted merge fails', async () => {
    const blockExecution = vi.fn().mockResolvedValue(undefined)
    const launcher = createJrCardReviewLauncher({
      ...idleDependencies(),
      prepareShip: vi.fn().mockResolvedValue(ship),
      blockExecution,
      findPullRequest: vi.fn().mockResolvedValue({ number: 7, state: 'open' }),
      mergePullRequest: vi.fn().mockResolvedValue({ ok: false, error: 'PR is conflicting' })
    })

    await expect(launcher.approveMerge('card-1', controller)).rejects.toThrow('PR is conflicting')
    expect(blockExecution).toHaveBeenCalledWith('card-1', 'PR is conflicting', controller)
  })

  it('prefers the worktree whose branch matches the card base ref', () => {
    expect(
      findJrBaseWorktree(
        [
          {
            id: 'repo-1::/feature',
            path: '/feature',
            branch: 'jr/task',
            linkedPR: null,
            isMainWorktree: false
          },
          {
            id: 'repo-1::/main',
            path: '/repo',
            branch: 'main',
            linkedPR: null,
            isMainWorktree: true
          }
        ],
        'origin/main',
        'repo-1::/feature'
      )
    ).toMatchObject({ id: 'repo-1::/main' })
  })

  it('marks unresolved git conflicts in the review snapshot', () => {
    expect(
      buildJrReviewSnapshot({
        worktreeId: 'wt',
        branch: 'jr/task',
        baseRef: 'main',
        status: {
          entries: [
            {
              path: 'src/a.ts',
              status: 'modified',
              area: 'unstaged',
              conflictStatus: 'unresolved',
              conflictKind: 'both_modified'
            }
          ],
          conflictOperation: 'unknown'
        },
        compare,
        capturedAt: '2026-01-01T00:00:00.000Z'
      }).conflicted
    ).toBe(true)
  })
})

function idleDependencies() {
  return {
    getCard: vi.fn(),
    requestReview: vi.fn(),
    passVerification: vi.fn(),
    returnToExecution: vi.fn(),
    prepareShip: vi.fn(),
    recordMerged: vi.fn(),
    blockExecution: vi.fn(),
    readStatus: vi.fn(),
    compareBranch: vi.fn(),
    pushBranch: vi.fn().mockResolvedValue(undefined),
    findPullRequest: vi.fn().mockResolvedValue(null),
    mergePullRequest: vi.fn(),
    mergeIntoBase: vi.fn(),
    findWorktree: vi.fn().mockReturnValue({
      id: 'repo-1::/feature',
      path: '/feature',
      branch: 'jr/task',
      linkedPR: 42,
      isMainWorktree: false
    }),
    findRepository: vi.fn().mockReturnValue({ path: '/repo' }),
    findBaseWorktree: vi.fn().mockReturnValue({
      id: 'repo-1::/main',
      path: '/repo',
      branch: 'main',
      linkedPR: null,
      isMainWorktree: true
    }),
    revealReview: vi.fn(),
    now: () => '2026-01-01T00:00:00.000Z'
  }
}
