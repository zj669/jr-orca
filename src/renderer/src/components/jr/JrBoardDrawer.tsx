import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { CircleDot, Loader2, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
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
import { JR_BOARD_COLUMNS, jrCardBoardColumn } from '@/components/jr/jr-board-columns'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { jrStatusLabel } from '../../../../shared/jr/jr-status-labels'
import type { JrBoardSnapshot, JrCard, JrControllerActor } from '../../../../shared/jr/jr-types'

const LOCAL_CONTROLLER: JrControllerActor = { kind: 'human-controller', id: 'local-user' }

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
  const sidebarOpen = useAppStore((state) => state.sidebarOpen)
  const sidebarWidth = useAppStore((state) => state.sidebarWidth)
  const drawerLeft = sidebarOpen ? `var(--workspace-sidebar-live-width, ${sidebarWidth}px)` : '0px'

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
    <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
      <SheetContent
        side="left"
        data-jr-board=""
        overlayStyle={{ pointerEvents: 'none', opacity: 0 }}
        style={{
          left: drawerLeft,
          top: '36px',
          bottom: '0px',
          height: 'auto',
          width: `min(calc(100vw - ${drawerLeft}), 1280px)`,
          maxWidth: 'none'
        }}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <div className="border-b">
          <SheetHeader>
            <SheetTitle>
              <span className="flex items-center gap-2">
                <CircleDot className="size-4 text-muted-foreground" />
                JR 交付看板
              </span>
            </SheetTitle>
            <SheetDescription>
              卡片和工件保存在本地 JR 数据库；执行与合并由控制者批准。
            </SheetDescription>
          </SheetHeader>
        </div>

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
                <div className="min-h-0 flex-[0.9] overflow-x-auto overflow-y-hidden border-b scrollbar-sleek">
                  <div className="grid h-full min-w-240 grid-cols-5 gap-4 p-4">
                    {JR_BOARD_COLUMNS.map((column) => {
                      const cards = snapshot.cards.filter(
                        (card) => jrCardBoardColumn(card) === column.id
                      )
                      return (
                        <section
                          key={column.id}
                          className="flex min-h-64 min-w-0 flex-col rounded-xl border bg-card p-3 text-card-foreground shadow-xs"
                          aria-label={column.label}
                          data-jr-lane={column.id}
                        >
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <h3 className="whitespace-nowrap text-sm font-semibold">
                                {column.label}
                              </h3>
                              <p className="mt-0.5 whitespace-nowrap text-xs text-muted-foreground">
                                {column.description}
                              </p>
                            </div>
                            <Badge variant="secondary">{cards.length}</Badge>
                          </div>
                          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto scrollbar-sleek">
                            {cards.map((card) => (
                              <button
                                key={card.id}
                                type="button"
                                onClick={() => setSelectedId(card.id)}
                                className={cn(
                                  'w-full rounded-lg border bg-background p-3 text-left shadow-xs transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden',
                                  selectedCard?.id === card.id && 'border-ring bg-accent/40'
                                )}
                                aria-pressed={selectedCard?.id === card.id}
                                data-jr-card-id={card.id}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="line-clamp-2 break-keep text-sm font-medium">
                                    {card.title}
                                  </div>
                                  <Badge variant={card.blocked ? 'destructive' : 'outline'}>
                                    {card.blocked ? '受阻' : jrStatusLabel(card.status)}
                                  </Badge>
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
                                  <p className="mt-2 line-clamp-2 break-keep text-xs text-destructive">
                                    受阻：{card.blocked.reason}
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

                <div className="min-h-0 flex-[1.1] overflow-y-auto bg-muted/20 p-4 pb-8 scrollbar-sleek">
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
