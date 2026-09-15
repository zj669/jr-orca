import React from 'react'
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
  onRepositoryChange,
  onBaseRefBlur,
  onSetupPolicyChange,
  onDetailsBlur,
  onPriorityChange
}: JrCardSetupFieldsProps): React.JSX.Element {
  const selectedHarness = harnesses.find((harness) => harness.id === card.harness) ?? null
  const selectedRepository =
    repositories.find((repository) => repository.id === card.execution.repositoryId) ?? null
  const locked = saving || !isConfigurable(card)

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
            disabled={locked}
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
            disabled={locked}
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
            disabled={locked}
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
        <div className="space-y-1">
          <Label htmlFor="jr-harness" className="text-xs">
            Harness
          </Label>
          <Select
            value={card.harness ?? undefined}
            onValueChange={onHarnessChange}
            disabled={locked}
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
            模型
          </Label>
          <Select
            value={card.model?.id ?? undefined}
            onValueChange={onModelChange}
            disabled={!selectedHarness || locked}
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
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        讨论中与规划中使用同一 harness 和模型。变更会作废已冻结的规划工件。执行批准后不可修改。
      </p>

      <div className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="jr-repository">仓库 / 工作区</Label>
          <Select
            value={card.execution.repositoryId ?? undefined}
            onValueChange={onRepositoryChange}
            disabled={locked}
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
            disabled={locked || !card.execution.repositoryId}
            onBlur={onBaseRefBlur}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="jr-setup-policy">Setup 策略</Label>
          <Select
            value={card.execution.setupDecision}
            onValueChange={onSetupPolicyChange}
            disabled={locked || !card.execution.repositoryId}
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

function isConfigurable(card: JrCard): boolean {
  return card.status === 'idea' || card.status === 'discussion' || card.status === 'planning'
}

function isPriority(value: string): value is JrCardPriority {
  return JR_CARD_PRIORITIES.some((priority) => priority === value)
}
