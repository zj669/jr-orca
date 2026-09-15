import type { JrArtifact, JrCard, JrCardStatus } from './jr-types'

export const JR_CARD_PRIORITIES = ['p0', 'p1', 'p2', 'p3'] as const
export type JrCardPriority = (typeof JR_CARD_PRIORITIES)[number]

export const JR_PLACEHOLDER_DESCRIPTION = '补充问题、预期结果和验收标准。'

export type JrBlockedState = {
  owner: string
  reason: string
  fromStatus: JrCardStatus
}

export type JrUpdateCardDetailsInput = {
  description?: string
  acceptance?: string
  priority?: JrCardPriority
}

export function isJrCardPriority(value: unknown): value is JrCardPriority {
  return typeof value === 'string' && JR_CARD_PRIORITIES.some((item) => item === value)
}

export function isJrBlockedState(value: unknown): value is JrBlockedState {
  if (value === null || typeof value !== 'object') {
    return false
  }
  const record = value
  return (
    'owner' in record &&
    typeof record.owner === 'string' &&
    record.owner.trim().length > 0 &&
    'reason' in record &&
    typeof record.reason === 'string' &&
    record.reason.trim().length > 0 &&
    'fromStatus' in record &&
    typeof record.fromStatus === 'string' &&
    record.fromStatus.trim().length > 0
  )
}

export function jrExecutionContractIssues(card: JrCard): string[] {
  const issues: string[] = []
  const description = card.description.trim()
  if (description.length < 8 || description === JR_PLACEHOLDER_DESCRIPTION) {
    issues.push('请先写明问题与预期结果。')
  }
  if (card.acceptance.trim().length < 8) {
    issues.push('请先写明验收标准。')
  }
  if (!isJrCardPriority(card.priority)) {
    issues.push('请先为卡片设置优先级。')
  }
  if (!card.harness || !card.model) {
    issues.push('请先为卡片选择 Phase 1 harness 和模型。')
  }
  if (!card.execution.repositoryId?.trim()) {
    issues.push('请先为卡片设置仓库或文件夹工作区。')
  }
  if (!card.execution.baseRef?.trim()) {
    issues.push('请先为卡片设置基础分支。')
  }
  pushMissingArtifact(issues, card, 'workflow.md')
  pushMissingTaskArtifact(issues, card, 'prd.md')
  pushMissingTaskArtifact(issues, card, 'research.md')
  pushMissingTaskArtifact(issues, card, 'context.md')
  pushMissingTaskArtifact(issues, card, 'design.md')
  pushMissingTaskArtifact(issues, card, 'implement.md')
  if (!card.artifacts.some((artifact) => artifact.path.startsWith('spec/'))) {
    issues.push('JR 执行需要至少一份 spec 工件。')
  }
  return issues
}

export function assertJrExecutionContract(card: JrCard): void {
  const issue = jrExecutionContractIssues(card)[0]
  if (issue) {
    throw new Error(issue)
  }
}

function pushMissingTaskArtifact(issues: string[], card: JrCard, name: string): void {
  pushMissingArtifact(issues, card, `tasks/${card.id}/${name}`)
}

function pushMissingArtifact(issues: string[], card: JrCard, path: string): void {
  const artifact = findRequiredArtifact(card, path)
  if (!artifact) {
    issues.push(`JR 执行需要已保存的 ${path}。`)
  }
}

function findRequiredArtifact(card: JrCard, path: string): JrArtifact | undefined {
  return card.artifacts.find(
    (candidate) => candidate.path === path && candidate.content.trim().length > 0
  )
}
