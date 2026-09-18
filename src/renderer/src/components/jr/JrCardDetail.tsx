import React from 'react'
import { ArrowRight, Bot, Loader2, RotateCcw, Sparkles, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { JrCardReviewActions } from '@/components/jr/JrCardReviewActions'
import { JrCardSetupFields } from '@/components/jr/JrCardSetupFields'
import { launchJrCardExecution } from '@/lib/jr-card-execution-launch'
import { launchJrPlanningSession } from '@/lib/jr-card-planning-launch'
import { jrExecutionContractIssues } from '../../../../shared/jr/jr-card-contract'
import { jrStatusLabel } from '../../../../shared/jr/jr-status-labels'
import type { Repo } from '../../../../shared/repo-types'
import type {
  JrBoardSnapshot,
  JrCard,
  JrCardPriority,
  JrCardTransition,
  JrControllerActor
} from '../../../../shared/jr/jr-types'

type JrCardDetailProps = {
  card: JrCard
  harnesses: JrBoardSnapshot['harnesses']
  repositories: readonly Repo[]
  saving: boolean
  controller: JrControllerActor
  runAction: (action: () => Promise<unknown>) => void
}

function cardAction(card: JrCard): { label: string; transition: JrCardTransition } | null {
  if (card.status === 'idea') {
    return { label: '创建讨论上下文', transition: 'begin-discussion' }
  }
  if (card.status === 'discussion') {
    return { label: '进入规划', transition: 'begin-planning' }
  }
  if (card.status === 'planning') {
    return { label: '提交执行审批', transition: 'request-execution-approval' }
  }
  return null
}

export function JrCardDetail({
  card,
  harnesses,
  repositories,
  saving,
  controller,
  runAction
}: JrCardDetailProps): React.JSX.Element {
  const action = cardAction(card)
  const contractIssues = jrExecutionContractIssues(card)
  const updateTarget = (input: {
    repositoryId: string
    baseRef: string
    setupDecision: 'inherit' | 'run' | 'skip'
  }): void => {
    runAction(() => window.api.jr.updateCardExecutionTarget(card.id, input, controller))
  }
  const handleHarnessChange = (harness: string): void => {
    const option = harnesses.find((item) => item.id === harness)
    const defaultModel = option?.models[0]
    if (!option || !defaultModel) {
      return
    }
    runAction(() =>
      window.api.jr.updateCardConfiguration(
        card.id,
        { harness: option.id, modelId: defaultModel.id },
        controller
      )
    )
  }
  const handleModelChange = (modelId: string): void => {
    const harness = card.harness
    if (!harness) {
      return
    }
    runAction(() =>
      window.api.jr.updateCardConfiguration(card.id, { harness, modelId }, controller)
    )
  }
  const handleReviewHarnessChange = (harness: string): void => {
    const option = harnesses.find((item) => item.id === harness)
    if (!option) {
      return
    }
    runAction(() =>
      window.api.jr.updateCardReviewConfiguration(card.id, { harness: option.id }, controller)
    )
  }
  const handleReviewModelChange = (modelId: string): void => {
    const harness = card.reviewHarness
    if (!harness) {
      return
    }
    runAction(() =>
      window.api.jr.updateCardReviewConfiguration(card.id, { harness, modelId }, controller)
    )
  }
  const handleUseExecutionForReview = (): void => {
    const harness = card.harness
    const model = card.model
    if (!harness || !model) {
      return
    }
    runAction(() =>
      window.api.jr.updateCardReviewConfiguration(
        card.id,
        { harness, modelId: model.id },
        controller
      )
    )
  }
  const handleRepositoryChange = (repositoryId: string): void => {
    const repository = repositories.find((item) => item.id === repositoryId)
    if (!repository) {
      return
    }
    updateTarget({
      repositoryId: repository.id,
      baseRef: repository.worktreeBaseRef?.trim() || 'HEAD',
      setupDecision: card.execution.setupDecision
    })
  }
  const handleBaseRefBlur = (event: React.FocusEvent<HTMLInputElement>): void => {
    if (!card.execution.repositoryId) {
      return
    }
    const baseRef = event.target.value.trim()
    if (!baseRef || baseRef === card.execution.baseRef) {
      return
    }
    updateTarget({
      repositoryId: card.execution.repositoryId,
      baseRef,
      setupDecision: card.execution.setupDecision
    })
  }
  const handleSetupPolicyChange = (setupDecision: string): void => {
    if (
      !card.execution.repositoryId ||
      !card.execution.baseRef ||
      !isSetupDecision(setupDecision)
    ) {
      return
    }
    updateTarget({
      repositoryId: card.execution.repositoryId,
      baseRef: card.execution.baseRef,
      setupDecision
    })
  }
  const handleDetailsBlur = (field: 'description' | 'acceptance', value: string): void => {
    const next = value.trim()
    if (next === card[field]) {
      return
    }
    runAction(() => window.api.jr.updateCardDetails(card.id, { [field]: next }, controller))
  }
  const handlePriorityChange = (priority: JrCardPriority): void => {
    if (priority === card.priority) {
      return
    }
    runAction(() => window.api.jr.updateCardDetails(card.id, { priority }, controller))
  }
  const handleLifecycle = (transition: JrCardTransition): void => {
    runAction(async () => {
      const next = await window.api.jr.transitionCard(card.id, transition, controller)
      if (transition === 'begin-discussion' || transition === 'begin-planning') {
        await launchJrPlanningSession(
          next,
          transition === 'begin-discussion' ? 'discussion' : 'planning',
          controller
        )
      }
    })
  }

  return (
    <section
      className="rounded-xl border bg-card p-4 pb-6 text-card-foreground"
      data-jr-card-detail=""
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            控制者视图
          </p>
          <h3 className="mt-1 text-base font-semibold">{card.title}</h3>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{card.description}</p>
        </div>
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
          {card.artifacts.length} 个数据库工件
        </span>
      </div>

      {card.blocked ? (
        <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium text-destructive">受阻</p>
              <p className="mt-1 text-muted-foreground">
                负责人 {card.blocked.owner} · 先前状态 {jrStatusLabel(card.blocked.fromStatus)}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => runAction(() => window.api.jr.resumeBlocked(card.id, controller))}
              disabled={saving}
            >
              <RotateCcw />
              恢复到先前状态
            </Button>
          </div>
          <p className="mt-2 max-h-24 overflow-y-auto whitespace-pre-wrap break-all text-xs text-muted-foreground scrollbar-sleek">
            {card.blocked.reason}
          </p>
        </div>
      ) : null}

      <JrCardReviewActions
        card={card}
        saving={saving}
        controller={controller}
        runAction={runAction}
      />

      <JrCardSetupFields
        card={card}
        harnesses={harnesses}
        repositories={repositories}
        saving={saving}
        onHarnessChange={handleHarnessChange}
        onModelChange={handleModelChange}
        onReviewHarnessChange={handleReviewHarnessChange}
        onReviewModelChange={handleReviewModelChange}
        onUseExecutionForReview={handleUseExecutionForReview}
        onRepositoryChange={handleRepositoryChange}
        onBaseRefBlur={handleBaseRefBlur}
        onSetupPolicyChange={handleSetupPolicyChange}
        onDetailsBlur={handleDetailsBlur}
        onPriorityChange={handlePriorityChange}
      />

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <Bot className="size-3.5 shrink-0" />
          <span className="min-w-0 break-keep">
            {card.harness && card.model
              ? `执行 ${card.harness} · ${card.model.label} · 审查 ${
                  card.reviewHarness && card.reviewModel
                    ? `${card.reviewHarness} · ${card.reviewModel.label}`
                    : '未选择'
                }`
              : '选择执行 AI 后才能创建讨论上下文'}
          </span>
        </div>
        {action ? (
          <Button
            type="button"
            size="sm"
            onClick={() => handleLifecycle(action.transition)}
            disabled={
              saving ||
              (card.status === 'idea' && (!card.model || !card.execution.repositoryId)) ||
              (card.status === 'discussion' && !card.execution.repositoryId) ||
              (card.status === 'planning' && contractIssues.length > 0)
            }
          >
            {card.status === 'planning' ? <Sparkles /> : <ArrowRight />}
            {action.label}
          </Button>
        ) : card.status === 'pending_execution_approval' ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                runAction(() => window.api.jr.rejectExecutionApproval(card.id, controller))
              }
              disabled={saving}
            >
              <Undo2 />
              退回规划
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => runAction(() => launchJrCardExecution(card.id, controller))}
              disabled={saving}
            >
              {saving ? <Loader2 className="animate-spin" /> : <Sparkles />}
              批准并启动执行
            </Button>
          </div>
        ) : (
          <p className="text-sm font-medium">{statusMessage(card.status)}</p>
        )}
      </div>
      {card.status === 'planning' && contractIssues.length > 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">{contractIssues[0]}</p>
      ) : null}

      {card.artifacts.length > 0 ? (
        <details className="mt-4 border-t pt-4">
          <summary className="cursor-pointer text-sm font-medium">查看 Trellis 数据库工件</summary>
          <div className="mt-3 space-y-2">
            {card.artifacts.map((artifact) => (
              <div key={artifact.id} className="rounded-md border bg-muted/30 p-2">
                <p className="font-mono text-xs">
                  {artifact.path}
                  {artifact.version > 1 ? ` · v${artifact.version}` : ''}
                </p>
                <p className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground scrollbar-sleek">
                  {artifact.content}
                </p>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </section>
  )
}

function isSetupDecision(value: string): value is 'inherit' | 'run' | 'skip' {
  return value === 'inherit' || value === 'run' || value === 'skip'
}

function statusMessage(status: JrCard['status']): string {
  if (status === 'creating_worktree') {
    return 'Orca 正在创建工作树。'
  }
  if (status === 'executing') {
    return 'AI 会话已启动。退出后会自动进入验证。'
  }
  if (status === 'verifying') {
    return '正在使用 Orca Review 核对 diff。'
  }
  if (status === 'pending_merge_approval') {
    return '等待控制者批准合并。'
  }
  if (status === 'shipping') {
    return '正在通过 Orca 推送并合并。'
  }
  if (status === 'merged') {
    return '已合并。'
  }
  if (status === 'cancelled') {
    return '卡片已取消。'
  }
  return '该卡片当前没有可用的控制者操作。'
}
