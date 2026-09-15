import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight, Bot, CircleDot, Loader2, Plus, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type {
  JrBoardSnapshot,
  JrCard,
  JrCardStatus,
  JrControllerActor
} from '../../../../shared/jr/jr-types'

const LOCAL_CONTROLLER: JrControllerActor = { kind: 'human-controller', id: 'local-user' }

const LANES: readonly { status: JrCardStatus; label: string; description: string }[] = [
  { status: 'idea', label: '想法', description: '尚未授权 AI 工作' },
  { status: 'discussion', label: '讨论中', description: '只读计划上下文' },
  { status: 'planning', label: '规划中', description: 'Trellis Plan' },
  {
    status: 'pending_execution_approval',
    label: '待批准执行',
    description: '计划已冻结'
  }
]

type JrBoardDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function cardAction(card: JrCard): {
  label: string
  transition: 'begin-discussion' | 'begin-planning' | 'request-execution-approval'
} | null {
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

function formatUpdatedAt(value: string): string {
  const timestamp = new Date(value)
  if (Number.isNaN(timestamp.getTime())) {
    return ''
  }
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(timestamp)
}

export default function JrBoardDrawer({
  open,
  onOpenChange
}: JrBoardDrawerProps): React.JSX.Element | null {
  const [snapshot, setSnapshot] = useState<JrBoardSnapshot | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const next = await window.api.jr.listBoard()
      setSnapshot(next)
      setSelectedId((current) => current ?? next.cards[0]?.id ?? null)
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'JR 数据暂时无法读取。')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      void refresh()
    }
  }, [open, refresh])

  const selectedCard = useMemo(
    () => snapshot?.cards.find((card) => card.id === selectedId) ?? null,
    [selectedId, snapshot]
  )
  const selectedHarness = useMemo(
    () => snapshot?.harnesses.find((harness) => harness.id === selectedCard?.harness) ?? null,
    [selectedCard?.harness, snapshot?.harnesses]
  )
  const selectedAction = selectedCard ? cardAction(selectedCard) : null

  const runAction = async (action: () => Promise<unknown>): Promise<void> => {
    setSaving(true)
    try {
      await action()
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'JR 操作未完成。')
    } finally {
      setSaving(false)
    }
  }

  const handleCreate = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    void runAction(async () => {
      const card = await window.api.jr.createCard({ title, description }, LOCAL_CONTROLLER)
      setTitle('')
      setDescription('')
      setSelectedId(card.id)
    })
  }

  const handleHarnessChange = (harness: string): void => {
    if (!selectedCard) {
      return
    }
    const option = snapshot?.harnesses.find((item) => item.id === harness)
    const defaultModel = option?.models[0]
    if (!option || !defaultModel) {
      return
    }
    void runAction(() =>
      window.api.jr.updateCardConfiguration(
        selectedCard.id,
        { harness: option.id, modelId: defaultModel.id },
        LOCAL_CONTROLLER
      )
    )
  }

  const handleModelChange = (modelId: string): void => {
    if (!selectedCard?.harness) {
      return
    }
    void runAction(() =>
      window.api.jr.updateCardConfiguration(
        selectedCard.id,
        { harness: selectedCard.harness, modelId },
        LOCAL_CONTROLLER
      )
    )
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full p-0 sm:max-w-[900px]"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <SheetHeader className="border-b px-5 py-4 pr-14">
          <SheetTitle className="flex items-center gap-2">
            <CircleDot className="size-4 text-muted-foreground" />
            JR Delivery Board
          </SheetTitle>
          <SheetDescription>
            Trellis 规划数据保存在本地 JR 数据库；只有 controller 能提交执行审批。
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <form className="border-b p-4" onSubmit={handleCreate}>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]">
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="写下一个待讨论的想法"
                aria-label="卡片标题"
                disabled={saving}
              />
              <Input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="目标或问题（可后续补充）"
                aria-label="卡片说明"
                disabled={saving}
              />
              <Button type="submit" disabled={saving || title.trim().length < 2}>
                {saving ? <Loader2 className="animate-spin" /> : <Plus />}
                创建想法
              </Button>
            </div>
          </form>

          {error ? (
            <div className="border-b border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-auto scrollbar-sleek">
            {loading && !snapshot ? (
              <div className="flex h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                正在读取 JR 卡片…
              </div>
            ) : null}

            {snapshot ? (
              <div className="min-w-[820px] p-4">
                <div className="grid grid-cols-4 gap-3">
                  {LANES.map((lane) => {
                    const cards = snapshot.cards.filter((card) => card.status === lane.status)
                    return (
                      <section
                        key={lane.status}
                        className="min-h-56 rounded-xl border bg-card p-3 text-card-foreground"
                        aria-label={lane.label}
                      >
                        <div className="mb-3 flex items-start justify-between gap-2">
                          <div>
                            <h3 className="text-sm font-semibold">{lane.label}</h3>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {lane.description}
                            </p>
                          </div>
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            {cards.length}
                          </span>
                        </div>
                        <div className="space-y-2">
                          {cards.map((card) => (
                            <button
                              key={card.id}
                              type="button"
                              onClick={() => setSelectedId(card.id)}
                              className={cn(
                                'w-full rounded-lg border bg-background p-3 text-left shadow-xs transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden',
                                selectedCard?.id === card.id && 'border-ring'
                              )}
                            >
                              <div className="line-clamp-2 text-sm font-medium">{card.title}</div>
                              <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                                <span className="truncate">{card.harness ?? '未选择 AI 配置'}</span>
                                <span>{formatUpdatedAt(card.updatedAt)}</span>
                              </div>
                            </button>
                          ))}
                          {cards.length === 0 ? (
                            <p className="py-6 text-center text-xs text-muted-foreground">
                              暂无卡片
                            </p>
                          ) : null}
                        </div>
                      </section>
                    )
                  })}
                </div>

                {selectedCard ? (
                  <section className="mt-4 rounded-xl border bg-card p-4 text-card-foreground">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                          Controller 视图
                        </p>
                        <h3 className="mt-1 text-base font-semibold">{selectedCard.title}</h3>
                        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                          {selectedCard.description}
                        </p>
                      </div>
                      <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                        {selectedCard.artifacts.length} 个 DB artifacts
                      </span>
                    </div>

                    <div className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label htmlFor="jr-harness" className="text-xs">
                          Harness
                        </Label>
                        <Select
                          value={selectedCard.harness ?? undefined}
                          onValueChange={handleHarnessChange}
                          disabled={saving || selectedCard.status === 'pending_execution_approval'}
                        >
                          <SelectTrigger id="jr-harness" className="w-full">
                            <SelectValue placeholder="选择 Phase 1 harness" />
                          </SelectTrigger>
                          <SelectContent>
                            {snapshot.harnesses.map((harness) => (
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
                          value={selectedCard.model?.id ?? undefined}
                          onValueChange={handleModelChange}
                          disabled={
                            !selectedHarness ||
                            saving ||
                            selectedCard.status === 'pending_execution_approval'
                          }
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
                          Phase 1 复用 Orca 当前账号的默认模型；实时模型枚举将在 harness
                          接入时补上。
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Bot className="size-3.5" />
                        {selectedCard.harness && selectedCard.model
                          ? `${selectedCard.harness} · ${selectedCard.model.label}`
                          : '选择配置后才能创建讨论上下文'}
                      </div>
                      {selectedAction ? (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() =>
                            void runAction(() =>
                              window.api.jr.transitionCard(
                                selectedCard.id,
                                selectedAction.transition,
                                LOCAL_CONTROLLER
                              )
                            )
                          }
                          disabled={
                            saving || (selectedCard.status === 'idea' && !selectedCard.model)
                          }
                        >
                          {selectedCard.status === 'planning' ? <Sparkles /> : <ArrowRight />}
                          {selectedAction.label}
                        </Button>
                      ) : (
                        <p className="text-sm font-medium">
                          计划已冻结，下一切片会由批准操作创建 Orca worktree。
                        </p>
                      )}
                    </div>

                    {selectedCard.artifacts.length > 0 ? (
                      <details className="mt-4 border-t pt-4">
                        <summary className="cursor-pointer text-sm font-medium">
                          查看 DB-backed Trellis artifacts
                        </summary>
                        <div className="mt-3 space-y-2">
                          {selectedCard.artifacts.map((artifact) => (
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
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
