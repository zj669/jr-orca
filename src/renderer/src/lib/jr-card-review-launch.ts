import type {
  JrCard,
  JrControllerActor,
  JrDeliveryRecord,
  JrMergeIntoBaseInput,
  JrReviewSnapshot,
  JrShipRequest
} from '../../../shared/jr/jr-types'
import {
  buildJrReviewSnapshot,
  type JrReviewCompareSnapshot,
  type JrReviewStatusSnapshot,
  type JrReviewWorktree
} from './jr-card-review-snapshot'

export { buildJrReviewSnapshot, findJrBaseWorktree } from './jr-card-review-snapshot'

export type JrReviewLaunchDeps = {
  getCard: (cardId: string) => Promise<JrCard>
  requestReview: (
    cardId: string,
    snapshot: JrReviewSnapshot,
    actor: JrControllerActor
  ) => Promise<unknown>
  passVerification: (cardId: string, actor: JrControllerActor) => Promise<unknown>
  returnToExecution: (cardId: string, actor: JrControllerActor) => Promise<unknown>
  prepareShip: (cardId: string, actor: JrControllerActor) => Promise<JrShipRequest>
  recordMerged: (
    cardId: string,
    delivery: JrDeliveryRecord,
    actor: JrControllerActor
  ) => Promise<unknown>
  blockExecution: (cardId: string, reason: string, actor: JrControllerActor) => Promise<unknown>
  readStatus: (worktreePath: string) => Promise<JrReviewStatusSnapshot>
  compareBranch: (worktreePath: string, baseRef: string) => Promise<JrReviewCompareSnapshot>
  pushBranch: (worktreePath: string) => Promise<void>
  findPullRequest: (input: {
    repoPath: string
    repoId: string
    branch: string
    linkedPR: number | null
  }) => Promise<{ number: number; state: string } | null>
  mergePullRequest: (input: {
    repoPath: string
    repoId: string
    prNumber: number
  }) => Promise<{ ok: true } | { ok: false; error: string }>
  mergeIntoBase: (input: JrMergeIntoBaseInput) => Promise<void>
  findWorktree: (worktreeId: string) => JrReviewWorktree | undefined
  findRepository: (
    repoId: string
  ) => { path: string; connectionId?: string | null; kind?: 'git' | 'folder' } | undefined
  findBaseWorktree: (baseRef: string, excludeWorktreeId: string) => JrReviewWorktree | undefined
  revealReview: (worktreeId: string, worktreePath: string, compare: JrReviewCompareSnapshot) => void
  now: () => string
}

export function createJrCardReviewLauncher(deps: JrReviewLaunchDeps) {
  return {
    requestReview: async (cardId: string, actor: JrControllerActor) => {
      const card = await deps.getCard(cardId)
      const worktree = card.execution.worktree
      const baseRef = card.execution.baseRef
      if (!worktree || !baseRef) {
        throw new Error('JR 验证需要已创建的 Orca worktree 和基础分支。')
      }
      const repo = deps.findRepository(card.execution.repositoryId ?? '')
      try {
        const status = await deps.readStatus(worktree.path)
        const compare = await deps.compareBranch(worktree.path, baseRef)
        const snapshot = buildJrReviewSnapshot({
          worktreeId: worktree.id,
          branch: worktree.branch,
          baseRef,
          status,
          compare,
          capturedAt: deps.now()
        })
        await deps.requestReview(cardId, snapshot, actor)
        deps.revealReview(worktree.id, worktree.path, compare)
      } catch (error) {
        if (repo?.kind !== 'folder') {
          throw error
        }
        await deps.requestReview(
          cardId,
          {
            worktreeId: worktree.id,
            branch: worktree.branch || baseRef,
            baseRef,
            headOid: null,
            mergeBase: null,
            changedFiles: 1,
            commitsAhead: 0,
            commitsBehind: 0,
            uncommittedFiles: 0,
            conflicted: false,
            compareStatus: 'ready',
            capturedAt: deps.now(),
            workspaceKind: 'folder'
          },
          actor
        )
      }
    },
    passVerification: (cardId: string, actor: JrControllerActor) =>
      deps.passVerification(cardId, actor),
    returnToExecution: (cardId: string, actor: JrControllerActor) =>
      deps.returnToExecution(cardId, actor),
    approveMerge: (cardId: string, actor: JrControllerActor) => approveJrMerge(deps, cardId, actor)
  }
}

async function approveJrMerge(
  deps: JrReviewLaunchDeps,
  cardId: string,
  actor: JrControllerActor
): Promise<void> {
  const ship = await deps.prepareShip(cardId, actor)
  try {
    await deps.pushBranch(ship.worktree.path)
  } catch {
    // Local-only repos have nothing to push; hosted PRs still resolve below.
  }
  const repo = deps.findRepository(ship.repositoryId)
  if (!repo) {
    throw await blockShip(deps, cardId, actor, 'JR 交付找不到对应的 Orca 仓库。')
  }
  const worktree = deps.findWorktree(ship.worktree.id)
  const pr = await deps.findPullRequest({
    repoPath: repo.path,
    repoId: ship.repositoryId,
    branch: ship.worktree.branch,
    linkedPR: worktree?.linkedPR ?? null
  })
  if (pr) {
    await mergeHostedPr(deps, ship, actor, repo.path, pr.number)
    return
  }
  await mergeLocalBase(deps, ship, actor, repo.connectionId)
}

async function mergeHostedPr(
  deps: JrReviewLaunchDeps,
  ship: JrShipRequest,
  actor: JrControllerActor,
  repoPath: string,
  prNumber: number
): Promise<void> {
  const result = await deps.mergePullRequest({
    repoPath,
    repoId: ship.repositoryId,
    prNumber
  })
  if (!result.ok) {
    throw await blockShip(deps, ship.cardId, actor, result.error)
  }
  await deps.recordMerged(
    ship.cardId,
    {
      method: 'hosted-pr',
      prNumber,
      mergedInto: ship.baseRef,
      headOid: ship.review.headOid
    },
    actor
  )
}

async function mergeLocalBase(
  deps: JrReviewLaunchDeps,
  ship: JrShipRequest,
  actor: JrControllerActor,
  connectionId: string | null | undefined
): Promise<void> {
  const base = deps.findBaseWorktree(ship.baseRef, ship.worktree.id)
  if (!base) {
    const repo = deps.findRepository(ship.repositoryId)
    if (repo?.kind === 'folder') {
      await deps.recordMerged(
        ship.cardId,
        {
          method: 'folder-workspace',
          prNumber: null,
          mergedInto: ship.baseRef,
          headOid: ship.review.headOid
        },
        actor
      )
      return
    }
    throw await blockShip(
      deps,
      ship.cardId,
      actor,
      '没有 hosted PR，也找不到可合并的基础 worktree。'
    )
  }
  try {
    await deps.mergeIntoBase({
      baseWorktreePath: base.path,
      branch: ship.worktree.branch,
      expectedBaseRef: ship.baseRef,
      ...(connectionId ? { connectionId } : {})
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'JR 本地合并失败。'
    throw await blockShip(deps, ship.cardId, actor, reason)
  }
  await deps.recordMerged(
    ship.cardId,
    {
      method: 'local-base-merge',
      prNumber: null,
      mergedInto: ship.baseRef,
      headOid: ship.review.headOid
    },
    actor
  )
}

async function blockShip(
  deps: JrReviewLaunchDeps,
  cardId: string,
  actor: JrControllerActor,
  reason: string
): Promise<Error> {
  await deps.blockExecution(cardId, reason, actor)
  return new Error(reason)
}
