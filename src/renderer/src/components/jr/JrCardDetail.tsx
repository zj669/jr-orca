import React from 'react'
import { ArrowRight, Bot, Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { JrCardReviewActions } from '@/components/jr/JrCardReviewActions'
import { launchJrCardExecution } from '@/lib/jr-card-execution-launch'
import type { Repo } from '../../../../shared/repo-types'
import type {
  JrBoardSnapshot,
  JrCard,
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

function targetIsConfigurable(card: JrCard): boolean {
  return card.status === 'idea' || card.status === 'discussion' || card.status === 'planning'
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
  const selectedHarness = harnesses.find((harness) => harness.id === card.harness) ?? null
  const selectedRepository =
    repositories.find((repository) => repository.id === card.execution.repositoryId) ?? null
  const action = cardAction(card)
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

  return (
    <section className="mt-4 rounded-xl border bg-card p-4 text-card-foreground">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Controller 视图
          </p>
          <h3 className="mt-1 text-base font-semibold">{card.title}</h3>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{card.description}</p>
        </div>
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
          {card.artifacts.length} 个 DB artifacts
        </span>
      </div>

      <div className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="jr-harness" className="text-xs">
            Harness
          </Label>
          <Select
            value={card.harness ?? undefined}
            onValueChange={handleHarnessChange}
            disabled={saving || !targetIsConfigurable(card)}
          >
            <SelectTrigger id="jr-harness" className="w-full">
              <SelectValue placeholder="选择 Phase 1 harness" />
            </SelectTrigger>
            <SelectContent>
              {harnesses.map((harness) => (
                <SelectItem key={harness.id} value={harness.id}>
                  {harness.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="jr-model" className="text-xs">
            Model
          </Label>
          <Select
            value={card.model?.id ?? undefined}
            onValueChange={handleModelChange}
            disabled={!selectedHarness || saving || !targetIsConfigurable(card)}
          >
            <SelectTrigger id="jr-model" className="w-full">
              <SelectValue placeholder="先选择 harness" />
            </SelectTrigger>
            <SelectContent>
              {selectedHarness?.models.map((model) => (
                <SelectItem key={model.id} value={model.id}>
                  {model.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Phase 1 使用该 harness 在 Orca 中配置的默认模型。
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="jr-repository">Repository</Label>
          <Select
            value={card.execution.repositoryId ?? undefined}
            onValueChange={handleRepositoryChange}
            disabled={saving || !targetIsConfigurable(card)}
          >
            <SelectTrigger id="jr-repository" className="w-full">
              <SelectValue placeholder="选择 Orca 仓库" />
            </SelectTrigger>
            <SelectContent>
              {repositories.map((repository) => (
                <SelectItem key={repository.id} value={repository.id}>
                  {repository.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="jr-base-ref">Base ref</Label>
          <Input
            key={`${card.id}:${card.execution.baseRef ?? ''}`}
            id="jr-base-ref"
            defaultValue={card.execution.baseRef ?? ''}
            placeholder="main"
            disabled={saving || !targetIsConfigurable(card) || !card.execution.repositoryId}
            onBlur={handleBaseRefBlur}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="jr-setup-policy">Setup policy</Label>
          <Select
            value={card.execution.setupDecision}
            onValueChange={handleSetupPolicyChange}
            disabled={saving || !targetIsConfigurable(card) || !card.execution.repositoryId}
          >
            <SelectTrigger id="jr-setup-policy" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="inherit">Inherit repository policy</SelectItem>
              <SelectItem value="run">Run setup now</SelectItem>
              <SelectItem value="skip">Skip setup</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {repositories.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          先在 Orca 添加 Git repository，才能批准执行。
        </p>
      ) : selectedRepository ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {selectedRepository.path} · {card.execution.baseRef ?? '未设置基础分支'}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Bot className="size-3.5" />
          {card.harness && card.model
            ? `${card.harness} · ${card.model.label}`
            : '选择配置后才能创建讨论上下文'}
        </div>
        {action ? (
          <Button
            type="button"
            size="sm"
            onClick={() =>
              runAction(() => window.api.jr.transitionCard(card.id, action.transition, controller))
            }
            disabled={
              saving ||
              (card.status === 'idea' && !card.model) ||
              (card.status === 'planning' &&
                (!card.execution.repositoryId || !card.execution.baseRef))
            }
          >
            {card.status === 'planning' ? <Sparkles /> : <ArrowRight />}
            {action.label}
          </Button>
        ) : card.status === 'pending_execution_approval' ? (
          <Button
            type="button"
            size="sm"
            onClick={() => runAction(() => launchJrCardExecution(card.id, controller))}
            disabled={saving}
          >
            {saving ? <Loader2 className="animate-spin" /> : <Sparkles />}
            批准并启动执行
          </Button>
        ) : (
          <p className="text-sm font-medium">{statusMessage(card.status)}</p>
        )}
      </div>

      <JrCardReviewActions
        card={card}
        saving={saving}
        controller={controller}
        runAction={runAction}
      />

      {card.artifacts.length > 0 ? (
        <details className="mt-4 border-t pt-4">
          <summary className="cursor-pointer text-sm font-medium">
            查看 DB-backed Trellis artifacts
          </summary>
          <div className="mt-3 space-y-2">
            {card.artifacts.map((artifact) => (
              <div key={artifact.id} className="rounded-md border bg-muted/30 p-2">
                <p className="font-mono text-xs">{artifact.path}</p>
                <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-xs text-muted-foreground">
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
    return 'Orca 正在创建 worktree。'
  }
  if (status === 'executing') {
    return 'Harness 已启动。完成后请求验证。'
  }
  if (status === 'verifying') {
    return '正在使用 Orca Review 核对 diff。'
  }
  if (status === 'pending_merge_approval') {
    return '等待 controller 批准合并。'
  }
  if (status === 'shipping') {
    return '正在通过 Orca 推送并合并。'
  }
  if (status === 'merged') {
    return '已合并。'
  }
  return '该卡片当前没有可用的 controller 操作。'
}
