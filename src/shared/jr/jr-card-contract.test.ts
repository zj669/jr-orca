import { describe, expect, it } from 'vitest'
import { assertJrExecutionContract, jrExecutionContractIssues } from './jr-card-contract'
import type { JrCard } from './jr-types'

function card(overrides: Partial<JrCard> = {}): JrCard {
  return {
    id: 'card-1',
    title: 'Contract',
    description: 'Define the recovery path when an invitation is no longer valid.',
    acceptance: 'Recovery is specific, testable, and stays in the approved boundary.',
    priority: 'p1',
    status: 'planning',
    harness: 'codex',
    model: { id: 'gpt-5.6-sol', label: 'GPT', capabilitySource: 'orca-session-catalog' },
    execution: {
      repositoryId: 'repo-1',
      baseRef: 'main',
      setupDecision: 'skip',
      worktree: null,
      worktreePhase: null,
      agentSession: null
    },
    review: null,
    delivery: null,
    blocked: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    artifacts: [
      artifact('workflow.md'),
      artifact('spec/jr-controller.md'),
      artifact('tasks/card-1/prd.md'),
      artifact('tasks/card-1/research.md'),
      artifact('tasks/card-1/context.md'),
      artifact('tasks/card-1/design.md'),
      artifact('tasks/card-1/implement.md')
    ],
    events: [],
    ...overrides
  }
}

function artifact(path: string) {
  return {
    id: path,
    cardId: 'card-1',
    path,
    content: '# body\n',
    version: 1,
    updatedAt: '2026-01-01T00:00:00.000Z'
  }
}

describe('JR execution contract', () => {
  it('requires title-adjacent problem, acceptance, priority, repo, harness, and DB artifacts', () => {
    expect(jrExecutionContractIssues(card())).toEqual([])
    expect(() => assertJrExecutionContract(card())).not.toThrow()
    expect(jrExecutionContractIssues(card({ priority: null }))).toContain('请先为卡片设置优先级。')
    expect(
      jrExecutionContractIssues(card({ execution: { ...card().execution, repositoryId: null } }))
    ).toContain('请先为卡片设置仓库或文件夹工作区。')
  })
})
