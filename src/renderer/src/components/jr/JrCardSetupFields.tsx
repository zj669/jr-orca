import React from 'react'
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
import { Textarea } from '@/components/ui/textarea'
import { isFolderRepo } from '../../../../shared/repo-kind'
import type { Repo } from '../../../../shared/repo-types'
import {
  JR_CARD_PRIORITIES,
  type JrBoardSnapshot,
  type JrCard,
  type JrCardPriority
} from '../../../../shared/jr/jr-types'

type JrCardSetupFieldsProps = {
  card: JrCard
  harnesses: JrBoardSnapshot['harnesses']
  repositories: readonly Repo[]
  saving: boolean
  onHarnessChange: (harness: string) => void
  onModelChange: (modelId: string) => void
  onReviewHarnessChange: (harness: string) => void
  onReviewModelChange: (modelId: string) => void
  onUseExecutionForReview: () => void
  onRepositoryChange: (repositoryId: string) => void
  onBaseRefBlur: (event: React.FocusEvent<HTMLInputElement>) => void
  onSetupPolicyChange: (setupDecision: string) => void
  onDetailsBlur: (field: 'description' | 'acceptance', value: string) => void
  onPriorityChange: (priority: JrCardPriority) => void
}

export function JrCardSetupFields({
  card,
  harnesses,
  repositories,
  saving,
  onHarnessChange,
  onModelChange,
  onReviewHarnessChange,
  onReviewModelChange,
  onUseExecutionForReview,
  onRepositoryChange,
  onBaseRefBlur,
  onSetupPolicyChange,
  onDetailsBlur,
  onPriorityChange
}: JrCardSetupFieldsProps): React.JSX.Element {
  const selectedExecutionHarness = harnesses.find((harness) => harness.id === card.harness) ?? null
  const selectedReviewHarness =
    harnesses.find((harness) => harness.id === card.reviewHarness) ?? null
  const selectedRepository =
    repositories.find((repository) => repository.id === card.execution.repositoryId) ?? null
  const executionLocked = saving || !isExecutionConfigurable(card)
  const reviewLocked = saving || !isReviewConfigurable(card)

  return (
    <>
      <div className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="jr-description" className="text-xs">
            问题与预期结果
          </Label>
          <Textarea
            key={`${card.id}:description:${card.updatedAt}`}
            id="jr-description"
            defaultValue={card.description}
            placeholder="写明问题、预期结果，以及为什么现在做。"
            disabled={executionLocked}
            className="min-h-20"
            onBlur={(event) => onDetailsBlur('description', event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="jr-acceptance" className="text-xs">
            验收标准
          </Label>
          <Textarea
            key={`${card.id}:acceptance:${card.updatedAt}`}
            id="jr-acceptance"
            defaultValue={card.acceptance}
            placeholder="可验证的完成条件。"
            disabled={executionLocked}
            className="min-h-20"
            onBlur={(event) => onDetailsBlur('acceptance', event.target.value)}
          />
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="jr-priority" className="text-xs">
            优先级
          </Label>
          <Select
            value={card.priority ?? undefined}
            onValueChange={(value) => {
              if (isPriority(value)) {
                onPriorityChange(value)
              }
            }}
            disabled={executionLocked}
          >
            <SelectTrigger id="jr-priority" className="w-full">
              <SelectValue placeholder="选择 p0–p3" />
            </SelectTrigger>
            <SelectContent>
              {JR_CARD_PRIORITIES.map((priority) => (
                <SelectItem key={priority} value={priority}>
                  {priority.toUpperCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="jr-execution-harness" className="text-xs">
            执行 AI
          </Label>
          <Select
            value={card.harness ?? undefined}
            onValueChange={onHarnessChange}
            disabled={executionLocked}
          >
            <SelectTrigger
              id="jr-execution-harness"
              className="w-full"
              aria-label="执行 AI harness"
            >
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
          <Select
            value={card.model?.id ?? undefined}
            onValueChange={onModelChange}
            disabled={!selectedExecutionHarness || executionLocked}
          >
            <SelectTrigger id="jr-execution-model" className="w-full" aria-label="执行 AI 模型">
              <SelectValue placeholder="先选择执行 AI" />
            </SelectTrigger>
            <SelectContent>
              {selectedExecutionHarness?.models.map((model) => (
                <SelectItem key={model.id} value={model.id}>
                  {model.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="jr-review-harness" className="text-xs">
              审查 AI
            </Label>
            <Button
              type="button"
              variant="link"
              size="xs"
              className="h-auto px-0"
              onClick={onUseExecutionForReview}
              disabled={reviewLocked || !card.harness || !card.model}
            >
              与执行相同
            </Button>
          </div>
          <Select
            value={card.reviewHarness ?? undefined}
            onValueChange={onReviewHarnessChange}
            disabled={reviewLocked}
          >
            <SelectTrigger id="jr-review-harness" className="w-full" aria-label="审查 AI harness">
              <SelectValue placeholder="选择审查 harness" />
            </SelectTrigger>
            <SelectContent>
              {harnesses.map((harness) => (
                <SelectItem key={harness.id} value={harness.id}>
                  {harness.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={card.reviewModel?.id ?? undefined}
            onValueChange={onReviewModelChange}
            disabled={!selectedReviewHarness || reviewLocked}
          >
            <SelectTrigger id="jr-review-model" className="w-full" aria-label="审查 AI 模型">
              <SelectValue placeholder="先选择审查 AI" />
            </SelectTrigger>
            <SelectContent>
              {selectedReviewHarness?.models.map((model) => (
                <SelectItem key={model.id} value={model.id}>
                  {model.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        执行 AI 在批准后锁定。审查 AI 可在完成前调整；请求验证前必须明确选择。
      </p>

      <div className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="jr-repository">仓库 / 工作区</Label>
          <Select
            value={card.execution.repositoryId ?? undefined}
            onValueChange={onRepositoryChange}
            disabled={executionLocked}
          >
            <SelectTrigger id="jr-repository" className="w-full">
              <SelectValue placeholder="选择 Orca 仓库或文件夹" />
            </SelectTrigger>
            <SelectContent>
              {repositories.map((repository) => (
                <SelectItem key={repository.id} value={repository.id}>
                  {repository.displayName}
                  {isFolderRepo(repository) ? ' · 文件夹' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="jr-base-ref">基础分支</Label>
          <Input
            key={`${card.id}:${card.execution.baseRef ?? ''}`}
            id="jr-base-ref"
            defaultValue={card.execution.baseRef ?? ''}
            placeholder="main"
            disabled={executionLocked || !card.execution.repositoryId}
            onBlur={onBaseRefBlur}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="jr-setup-policy">Setup 策略</Label>
          <Select
            value={card.execution.setupDecision}
            onValueChange={onSetupPolicyChange}
            disabled={executionLocked || !card.execution.repositoryId}
          >
            <SelectTrigger id="jr-setup-policy" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="inherit">继承仓库策略</SelectItem>
              <SelectItem value="run">立即运行 setup</SelectItem>
              <SelectItem value="skip">跳过 setup</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {repositories.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          先在 Orca 添加 Git 仓库或文件夹工作区，才能启动讨论或批准执行。
        </p>
      ) : selectedRepository ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {isFolderRepo(selectedRepository) ? '文件夹工作区' : 'Git 仓库'} ·{' '}
          {selectedRepository.path} · {card.execution.baseRef ?? '未设置基础分支'}
        </p>
      ) : null}
    </>
  )
}

function isExecutionConfigurable(card: JrCard): boolean {
  return card.status === 'idea' || card.status === 'discussion' || card.status === 'planning'
}

function isReviewConfigurable(card: JrCard): boolean {
  return card.status !== 'merged' && card.status !== 'cancelled'
}

function isPriority(value: string): value is JrCardPriority {
  return JR_CARD_PRIORITIES.some((priority) => priority === value)
}
