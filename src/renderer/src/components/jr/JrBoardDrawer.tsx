import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { CircleDot, Loader2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet'
import { JrCardDetail } from '@/components/jr/JrCardDetail'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import type { JrBoardSnapshot, JrCard, JrControllerActor } from '../../../../shared/jr/jr-types'

const LOCAL_CONTROLLER: JrControllerActor = { kind: 'human-controller', id: 'local-user' }

const LANES: readonly { status: JrCard['status']; label: string; description: string }[] = [
  { status: 'idea', label: '想法', description: '尚未授权 AI' },
  { status: 'discussion', label: '讨论中', description: '无代码写入' },
  { status: 'planning', label: '规划中', description: '同一 harness' },
  {
    status: 'pending_execution_approval',
    label: '待批准执行',
    description: '契约已冻结'
  },
  { status: 'creating_worktree', label: '创建工作树', description: 'Orca Create' },
  { status: 'executing', label: '执行中', description: 'Orca Work' },
  { status: 'verifying', label: '验证中', description: 'Orca Review' },
  {
    status: 'pending_merge_approval',
    label: '待批准合并',
    description: '等待 controller'
  },
  { status: 'shipping', label: '交付中', description: 'Orca Ship' },
  { status: 'merged', label: '已合并', description: 'Trellis Finish' },
  { status: 'blocked', label: '受阻', description: '负责人与原因' },
  { status: 'cancelled', label: '已取消', description: '不再推进' }
]

type JrBoardDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
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

function worktreeStatusDescription(card: JrCard): string | null {
  if (card.status === 'creating_worktree' && card.execution.worktreePhase) {
    return `Orca ${card.execution.worktreePhase}`
  }
  if (card.execution.worktree) {
    return card.execution.worktree.branch
  }
  return null
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
  const repositories = useAppStore((state) => state.repos)

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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex h-full w-full flex-col overflow-hidden p-0 sm:max-w-[min(96vw,72rem)]"
        data-jr-board=""
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <SheetHeader className="border-b px-5 py-4 pr-14">
          <SheetTitle className="flex items-center gap-2">
            <CircleDot className="size-4 text-muted-foreground" />
            JR 交付看板
          </SheetTitle>
          <SheetDescription>
            Trellis 数据保存在本地 JR 数据库；只有 controller 能批准执行和合并。Agent 不能写
            .trellis/。
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

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {loading && !snapshot ? (
              <div className="flex h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                正在读取 JR 卡片…
              </div>
            ) : null}

            {snapshot ? (
              <>
                <div className="shrink-0 overflow-x-auto border-b scrollbar-sleek">
                  <div className="flex w-max gap-3 p-4">
                    {LANES.map((lane) => {
                      const cards = snapshot.cards.filter((card) => card.status === lane.status)
                      return (
                        <section
                          key={lane.status}
                          className="flex min-h-56 w-52 shrink-0 flex-col rounded-xl border bg-card p-3 text-card-foreground"
                          aria-label={lane.label}
                          data-jr-lane={lane.status}
                        >
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <h3 className="whitespace-nowrap text-sm font-semibold">
                                {lane.label}
                              </h3>
                              <p className="mt-0.5 whitespace-nowrap text-xs text-muted-foreground">
                                {lane.description}
                              </p>
                            </div>
                            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
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
                                <div className="line-clamp-2 break-keep text-sm font-medium">
                                  {card.title}
                                </div>
                                <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                                  <span className="min-w-0 truncate">
                                    {card.priority ? `${card.priority.toUpperCase()} · ` : ''}
                                    {card.harness ?? '未选择 AI 配置'}
                                  </span>
                                  <span className="shrink-0 whitespace-nowrap">
                                    {formatUpdatedAt(card.updatedAt)}
                                  </span>
                                </div>
                                {card.blocked ? (
                                  <p className="mt-1 line-clamp-2 break-keep text-xs text-destructive">
                                    {card.blocked.reason}
                                  </p>
                                ) : null}
                                {worktreeStatusDescription(card) ? (
                                  <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                                    {worktreeStatusDescription(card)}
                                  </p>
                                ) : null}
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
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-8 scrollbar-sleek">
                  {selectedCard ? (
                    <JrCardDetail
                      card={selectedCard}
                      harnesses={snapshot.harnesses}
                      repositories={repositories}
                      saving={saving}
                      controller={LOCAL_CONTROLLER}
                      runAction={(action) => void runAction(action)}
                    />
                  ) : null}
                </div>
              </>
            ) : null}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
