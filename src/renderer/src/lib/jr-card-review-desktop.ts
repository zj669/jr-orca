import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import { useAppStore } from '@/store'
import { getIndexedAllWorktrees, getIndexedWorktreeById } from '@/store/worktree-repo-index'
import type { JrControllerActor } from '../../../shared/jr/jr-types'
import type { Worktree } from '../../../shared/worktree/types'
import { createJrCardReviewLauncher, type JrReviewLaunchDeps } from './jr-card-review-launch'
import { findJrBaseWorktree, type JrReviewWorktree } from './jr-card-review-snapshot'

export async function launchJrCardReview(cardId: string, actor: JrControllerActor): Promise<void> {
  await createDesktopJrCardReviewLauncher().requestReview(cardId, actor)
}

export async function approveJrCardMerge(cardId: string, actor: JrControllerActor): Promise<void> {
  await createDesktopJrCardReviewLauncher().approveMerge(cardId, actor)
}

function createDesktopJrCardReviewLauncher() {
  return createJrCardReviewLauncher(desktopJrReviewDeps())
}

function desktopJrReviewDeps(): JrReviewLaunchDeps {
  return {
    getCard: async (cardId) => {
      const card = (await window.api.jr.listBoard()).cards.find((item) => item.id === cardId)
      if (!card) {
        throw new Error('未找到 JR 卡片。')
      }
      return card
    },
    requestReview: (cardId, snapshot, actor) =>
      window.api.jr.requestReview(cardId, snapshot, actor),
    passVerification: (cardId, actor) => window.api.jr.passVerification(cardId, actor),
    returnToExecution: (cardId, actor) => window.api.jr.returnToExecution(cardId, actor),
    prepareShip: (cardId, actor) => window.api.jr.prepareShip(cardId, actor),
    recordMerged: (cardId, delivery, actor) => window.api.jr.recordMerged(cardId, delivery, actor),
    blockExecution: (cardId, reason, actor) => window.api.jr.blockExecution(cardId, reason, actor),
    readStatus: async (worktreePath) =>
      window.api.git.status({
        worktreePath,
        ...sshConnection(worktreePath)
      }),
    compareBranch: async (worktreePath, baseRef) =>
      window.api.git.branchCompare({
        worktreePath,
        baseRef,
        ...sshConnection(worktreePath)
      }),
    pushBranch: (worktreePath) =>
      window.api.git.push({
        worktreePath,
        ...sshConnection(worktreePath)
      }),
    findPullRequest: async (input) => {
      const pr = await window.api.gh.prForBranch({
        repoPath: input.repoPath,
        repoId: input.repoId,
        branch: input.branch,
        linkedPRNumber: input.linkedPR
      })
      return pr ? { number: pr.number, state: pr.state } : null
    },
    mergePullRequest: (input) =>
      window.api.gh.mergePR({
        repoPath: input.repoPath,
        repoId: input.repoId,
        prNumber: input.prNumber,
        method: 'squash'
      }),
    mergeIntoBase: (input) => window.api.jr.mergeIntoBase(input),
    findWorktree: (worktreeId) => {
      const worktree = getIndexedWorktreeById(useAppStore.getState().worktreesByRepo, worktreeId)
      return worktree ? toJrReviewWorktree(worktree) : undefined
    },
    findRepository: (repoId) => useAppStore.getState().repos.find((repo) => repo.id === repoId),
    findBaseWorktree: (baseRef, excludeWorktreeId) => {
      const { worktreesByRepo } = useAppStore.getState()
      const current = getIndexedWorktreeById(worktreesByRepo, excludeWorktreeId)
      const candidates = current
        ? (worktreesByRepo[current.repoId] ?? [])
        : getIndexedAllWorktrees(worktreesByRepo)
      return findJrBaseWorktree(candidates.map(toJrReviewWorktree), baseRef, excludeWorktreeId)
    },
    revealReview: (worktreeId, worktreePath, compare) => {
      const store = useAppStore.getState()
      const requestKey = `jr-review:${worktreeId}:${compare.summary.headOid ?? 'head'}`
      store.beginGitBranchCompareRequest(worktreeId, requestKey, compare.summary.baseRef)
      store.setGitBranchCompareResult(worktreeId, requestKey, compare)
      store.openBranchAllDiffs(worktreeId, worktreePath, compare.summary)
      activateAndRevealWorktree(worktreeId)
    },
    now: () => new Date().toISOString()
  }
}

function toJrReviewWorktree(worktree: Worktree): JrReviewWorktree {
  return {
    id: worktree.id,
    path: worktree.path,
    branch: worktree.branch,
    linkedPR: worktree.linkedPR,
    isMainWorktree: worktree.isMainWorktree
  }
}

function sshConnection(worktreePath: string): { connectionId?: string } {
  const state = useAppStore.getState()
  const worktree = getIndexedAllWorktrees(state.worktreesByRepo).find(
    (item) => item.path === worktreePath
  )
  const connectionId = worktree
    ? state.repos.find((repo) => repo.id === worktree.repoId)?.connectionId
    : undefined
  return connectionId ? { connectionId } : {}
}
