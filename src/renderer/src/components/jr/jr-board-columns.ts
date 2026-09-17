import type { JrCard, JrCardStatus } from '../../../../shared/jr/jr-types'

export type JrBoardColumnId = 'idea' | 'planning' | 'execution' | 'review' | 'complete'

type JrBoardColumn = {
  id: JrBoardColumnId
  label: string
  description: string
  statuses: readonly JrCardStatus[]
}

export const JR_BOARD_COLUMNS: readonly JrBoardColumn[] = [
  { id: 'idea', label: '想法', description: '尚未授权执行', statuses: ['idea'] },
  {
    id: 'planning',
    label: '规划',
    description: '讨论与计划',
    statuses: ['discussion', 'planning']
  },
  {
    id: 'execution',
    label: '执行',
    description: '等待批准或正在执行',
    statuses: ['pending_execution_approval', 'creating_worktree', 'executing']
  },
  {
    id: 'review',
    label: '审查',
    description: '验证与交付审批',
    statuses: ['verifying', 'pending_merge_approval', 'shipping']
  },
  { id: 'complete', label: '完成', description: '已合并交付', statuses: ['merged'] }
]

const columnByStatus: Record<JrCardStatus, JrBoardColumnId | null> = {
  idea: 'idea',
  discussion: 'planning',
  planning: 'planning',
  pending_execution_approval: 'execution',
  creating_worktree: 'execution',
  executing: 'execution',
  verifying: 'review',
  pending_merge_approval: 'review',
  shipping: 'review',
  merged: 'complete',
  blocked: null,
  cancelled: null
}

export function jrCardBoardColumn(
  card: Pick<JrCard, 'status' | 'blocked'>
): JrBoardColumnId | null {
  const status = card.status === 'blocked' ? (card.blocked?.fromStatus ?? 'planning') : card.status
  return columnByStatus[status]
}
