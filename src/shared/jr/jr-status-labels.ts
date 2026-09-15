import type { JrCardStatus } from './jr-types'

export const JR_STATUS_LABELS: Record<JrCardStatus, string> = {
  idea: '想法',
  discussion: '讨论中',
  planning: '规划中',
  pending_execution_approval: '待批准执行',
  creating_worktree: '创建工作树',
  executing: '执行中',
  verifying: '验证中',
  pending_merge_approval: '待批准合并',
  shipping: '交付中',
  merged: '已合并',
  blocked: '受阻',
  cancelled: '已取消'
}

export function jrStatusLabel(status: JrCardStatus): string {
  return JR_STATUS_LABELS[status]
}
