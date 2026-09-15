import type { GitBranchCompareResult } from '../../../shared/git-diff-compare-types'
import type { GitStatusResult } from '../../../shared/git-status-types'
import { isJrCompareStatus, type JrReviewSnapshot } from '../../../shared/jr/jr-types'

export type JrReviewWorktree = {
  id: string
  path: string
  branch: string
  linkedPR: number | null
  isMainWorktree: boolean
}

export type JrReviewStatusSnapshot = Pick<GitStatusResult, 'entries' | 'conflictOperation'>

export type JrReviewCompareSnapshot = GitBranchCompareResult

export function buildJrReviewSnapshot(input: {
  worktreeId: string
  branch: string
  baseRef: string
  status: JrReviewStatusSnapshot
  compare: JrReviewCompareSnapshot
  capturedAt: string
}): JrReviewSnapshot {
  const compareStatus = input.compare.summary.status
  if (!isJrCompareStatus(compareStatus)) {
    throw new Error(`Unknown compare status: ${compareStatus}`)
  }
  return {
    worktreeId: input.worktreeId,
    branch: input.branch,
    baseRef: input.baseRef,
    headOid: input.compare.summary.headOid,
    mergeBase: input.compare.summary.mergeBase,
    changedFiles: input.compare.summary.changedFiles,
    commitsAhead: input.compare.summary.commitsAhead ?? 0,
    commitsBehind: input.compare.summary.commitsBehind ?? 0,
    uncommittedFiles: input.status.entries.length,
    conflicted: input.status.entries.some((entry) => entry.conflictStatus === 'unresolved'),
    compareStatus,
    capturedAt: input.capturedAt
  }
}

export function normalizeJrGitRef(value: string): string {
  return value
    .trim()
    .replace(/^refs\/heads\//, '')
    .replace(/^origin\//, '')
}

export function findJrBaseWorktree(
  worktrees: JrReviewWorktree[],
  baseRef: string,
  excludeWorktreeId: string
): JrReviewWorktree | undefined {
  const expected = normalizeJrGitRef(baseRef)
  return (
    worktrees.find(
      (worktree) =>
        worktree.id !== excludeWorktreeId && normalizeJrGitRef(worktree.branch) === expected
    ) ?? worktrees.find((worktree) => worktree.id !== excludeWorktreeId && worktree.isMainWorktree)
  )
}
