import React from 'react'
import { ArrowLeft, Check, GitMerge, Loader2, ScanSearch } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { approveJrCardMerge, launchJrCardReview } from '@/lib/jr-card-review-desktop'
import type { JrCard, JrControllerActor } from '../../../../shared/jr/jr-types'

type JrCardReviewActionsProps = {
  card: JrCard
  saving: boolean
  controller: JrControllerActor
  runAction: (action: () => Promise<unknown>) => void
}

export function JrCardReviewActions({
  card,
  saving,
  controller,
  runAction
}: JrCardReviewActionsProps): React.JSX.Element | null {
  if (
    card.status !== 'executing' &&
    card.status !== 'verifying' &&
    card.status !== 'pending_merge_approval' &&
    card.status !== 'shipping' &&
    card.status !== 'merged'
  ) {
    return null
  }

  return (
    <div className="mt-4 space-y-3 border-t pt-4">
      {card.review ? (
        <p className="text-xs text-muted-foreground">
          {card.review.changedFiles} 个文件 · ahead {card.review.commitsAhead} · uncommitted{' '}
          {card.review.uncommittedFiles}
          {card.review.conflicted ? ' · 有冲突' : ''}
        </p>
      ) : null}
      {card.delivery ? (
        <p className="text-sm font-medium">
          {card.delivery.method === 'hosted-pr'
            ? `已合并 hosted PR ${card.delivery.prNumber} 到 ${card.delivery.mergedInto}`
            : card.delivery.method === 'folder-workspace'
              ? `文件夹工作区已交付到 ${card.delivery.mergedInto}`
              : `已在基础 worktree 合并到 ${card.delivery.mergedInto}`}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {card.status === 'executing' ? (
          <Button
            type="button"
            size="sm"
            onClick={() => runAction(() => launchJrCardReview(card.id, controller))}
            disabled={saving}
          >
            {saving ? <Loader2 className="animate-spin" /> : <ScanSearch />}
            请求验证并打开 diff
          </Button>
        ) : null}
        {card.status === 'verifying' ? (
          <>
            <Button
              type="button"
              size="sm"
              onClick={() => runAction(() => window.api.jr.passVerification(card.id, controller))}
              disabled={saving}
            >
              <Check />
              通过验证
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => runAction(() => window.api.jr.returnToExecution(card.id, controller))}
              disabled={saving}
            >
              <ArrowLeft />
              退回执行
            </Button>
          </>
        ) : null}
        {card.status === 'pending_merge_approval' ||
        (card.status === 'shipping' && !card.delivery) ? (
          <>
            <Button
              type="button"
              size="sm"
              onClick={() => runAction(() => approveJrCardMerge(card.id, controller))}
              disabled={saving}
            >
              {saving ? <Loader2 className="animate-spin" /> : <GitMerge />}
              {card.status === 'shipping' ? '重试合并' : '批准合并'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => runAction(() => window.api.jr.returnToExecution(card.id, controller))}
              disabled={saving}
            >
              <ArrowLeft />
              退回执行
            </Button>
          </>
        ) : null}
      </div>
    </div>
  )
}
