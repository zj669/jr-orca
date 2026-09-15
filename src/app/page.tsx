"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Database,
  FileCode2,
  GitBranch,
  Play,
  Plus,
  Sparkles,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import type { BoardData, CardStatus, JrCard } from "@/lib/jr/types";

type Action = "execute" | "ready" | "approve";
type Notice = { type: "success" | "error"; text: string } | null;

const columns: { status: CardStatus; label: string; hint: string }[] = [
  { status: "backlog", label: "待执行", hint: "点击卡片创建隔离环境" },
  { status: "developing", label: "开发中", hint: "worktree 已就绪" },
  { status: "ready_review", label: "待审批", hint: "等待 Walker 决策" },
  { status: "merged", label: "已合并", hint: "已写入基线分支" },
];

const statusStyles: Record<CardStatus, string> = {
  backlog: "border-sky-200 bg-sky-50 text-sky-800",
  developing: "border-amber-200 bg-amber-50 text-amber-800",
  ready_review: "border-violet-200 bg-violet-50 text-violet-800",
  merged: "border-emerald-200 bg-emerald-50 text-emerald-800",
};

function statusLabel(status: CardStatus) {
  return columns.find((column) => column.status === status)?.label ?? status;
}

function getError(payload: unknown) {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    return payload.error;
  }
  return "请求未能完成，请重试。";
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

export default function Home() {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [artifactPath, setArtifactPath] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const refresh = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch("/api/board", { cache: "no-store" });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(getError(payload));
      setBoard(payload as BoardData);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "无法读取 JR 看板。");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const selected = useMemo(
    () => board?.cards.find((card) => card.id === selectedId) ?? null,
    [board, selectedId],
  );
  const activeArtifact =
    selected?.artifacts.find((artifact) => artifact.path === artifactPath) ??
    selected?.artifacts[0];

  const selectCard = (card: JrCard) => {
    setSelectedId(card.id);
    setArtifactPath(card.artifacts[0]?.path ?? "");
  };

  const runAction = async (card: JrCard, action: Action) => {
    const key = `${action}-${card.id}`;
    setPending(key);
    setNotice(null);
    try {
      const response = await fetch(`/api/cards/${card.id}/${action}`, {
        method: "POST",
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(getError(payload));

      selectCard(card);
      setNotice({
        type: "success",
        text:
          action === "execute"
            ? "已创建 worktree，并投影 SQLite 中的 Trellis 工件。"
            : action === "ready"
              ? "已转入待审批；Walker 可以批准并合并。"
              : "已合并到基线分支，任务已归档。",
      });
      await refresh();
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "操作未能完成。",
      });
    } finally {
      setPending(null);
    }
  };

  const createCard = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending("create");
    setNotice(null);
    try {
      const response = await fetch("/api/cards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, description }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(getError(payload));
      const newCard = (payload as { card: JrCard }).card;
      setTitle("");
      setDescription("");
      setCreateOpen(false);
      selectCard(newCard);
      setNotice({ type: "success", text: "任务和数据库工件已创建。" });
      await refresh();
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "无法创建任务。",
      });
    } finally {
      setPending(null);
    }
  };

  if (loading && !board) {
    return (
      <main className="jr-shell grid min-h-screen place-items-center">
        <p className="rounded-full border border-slate-200 bg-white px-5 py-3 text-sm text-slate-600 shadow-sm">
          <span className="mr-2 inline-block size-2 animate-pulse rounded-full bg-cyan-500" />
          正在读取 JR 的 SQLite 看板…
        </p>
      </main>
    );
  }

  if (loadError && !board) {
    return (
      <main className="jr-shell grid min-h-screen place-items-center px-5">
        <section className="max-w-md rounded-2xl border border-rose-200 bg-white p-7 shadow-sm">
          <p className="font-semibold text-rose-800">无法读取看板</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">{loadError}</p>
          <Button className="mt-5" onClick={() => void refresh()}>
            重试
          </Button>
        </section>
      </main>
    );
  }

  return (
    <main className="jr-shell min-h-screen text-slate-900">
      <header className="border-b border-slate-200 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-5 py-5 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="grid size-11 place-items-center rounded-xl bg-slate-950 text-sm font-black tracking-widest text-white shadow-lg shadow-slate-300">
              JR
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold tracking-tight">交付看板</h1>
                <Badge variant="outline" className="border-cyan-200 bg-cyan-50 text-cyan-800">
                  Trellis 工作流
                </Badge>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                一张卡，一棵 worktree；Walker 只做审批与合并。
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 sm:flex">
              <Database className="size-3.5 text-cyan-700" />
              工件事实来源 <strong className="text-slate-800">SQLite</strong>
            </div>
            <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
              刷新
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              新建任务
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1600px] px-5 py-7 sm:px-8">
        {notice && (
          <div
            className={`mb-5 flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
              notice.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-rose-200 bg-rose-50 text-rose-900"
            }`}
          >
            {notice.text}
            <button className="text-xs font-semibold opacity-60 hover:opacity-100" onClick={() => setNotice(null)}>
              关闭
            </button>
          </div>
        )}

        <section className="mb-6 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-lg bg-violet-50 text-violet-700">
              <Sparkles className="size-4" />
            </div>
            <p className="text-sm text-slate-600">
              <strong className="text-slate-900">点击「待执行」卡片</strong>
              ，JR 创建 Git worktree，再把数据库里的 Trellis 工件投影进去。
            </p>
          </div>
          <code className="text-xs text-slate-400">{board?.workspace.dbPath}</code>
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_370px]">
          <section className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4" aria-label="JR 任务看板">
            {columns.map((column) => {
              const cards = board?.cards.filter((card) => card.status === column.status) ?? [];
              return (
                <section className="min-h-[265px] rounded-2xl border border-slate-200 bg-slate-100/70 p-3" key={column.status}>
                  <div className="mb-3 flex items-start justify-between gap-3 px-1">
                    <div>
                      <h2 className="text-sm font-semibold text-slate-800">{column.label}</h2>
                      <p className="mt-0.5 text-xs text-slate-500">{column.hint}</p>
                    </div>
                    <span className="grid size-6 place-items-center rounded-md bg-white text-xs text-slate-500 shadow-sm">
                      {cards.length}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {cards.map((card) => (
                      <Card
                        card={card}
                        isPending={pending === `execute-${card.id}`}
                        isSelected={selectedId === card.id}
                        key={card.id}
                        onClick={() => {
                          if (card.status === "backlog") {
                            void runAction(card, "execute");
                          } else {
                            selectCard(card);
                          }
                        }}
                        onInspect={() => selectCard(card)}
                      />
                    ))}
                    {cards.length === 0 && (
                      <p className="rounded-xl border border-dashed border-slate-300 bg-white/50 px-4 py-8 text-center text-xs text-slate-400">
                        这里还没有任务
                      </p>
                    )}
                  </div>
                </section>
              );
            })}
          </section>

          <aside className="h-fit rounded-2xl border border-slate-200 bg-white shadow-sm xl:sticky xl:top-5">
            {selected ? (
              <div>
                <div className="p-5">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className={statusStyles[selected.status]}>
                      {statusLabel(selected.status)}
                    </Badge>
                    <span className="text-xs text-slate-400">{formatDate(selected.updatedAt)}</span>
                  </div>
                  <h2 className="mt-3 text-base font-semibold leading-6">{selected.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{selected.description}</p>
                  {selected.worktreePath && (
                    <div className="mt-4 rounded-lg bg-slate-950 px-3 py-2.5 text-xs text-slate-200">
                      <p className="mb-1 flex items-center gap-1.5 text-slate-400">
                        <GitBranch className="size-3" />
                        Git worktree · Orca 可导入
                      </p>
                      <code className="break-all text-[11px] leading-5">{selected.worktreePath}</code>
                    </div>
                  )}
                </div>

                <div className="border-y border-slate-200 bg-slate-50/70 p-4">
                  {selected.status === "backlog" && (
                    <p className="text-center text-xs text-slate-500">回到看板点击此卡片，即会开始执行。</p>
                  )}
                  {selected.status === "developing" && (
                    <Button className="w-full" disabled={pending === `ready-${selected.id}`} onClick={() => void runAction(selected, "ready")}>
                      <Check className="size-4" />
                      {pending === `ready-${selected.id}` ? "正在更新…" : "开发完成，提交审批"}
                    </Button>
                  )}
                  {selected.status === "ready_review" && (
                    <Button className="w-full" disabled={pending === `approve-${selected.id}`} onClick={() => void runAction(selected, "approve")}>
                      <Check className="size-4" />
                      {pending === `approve-${selected.id}` ? "正在合并…" : "批准并合并到基线"}
                    </Button>
                  )}
                  {selected.status === "merged" && (
                    <p className="text-center text-xs font-medium text-emerald-700">已合并并归档。</p>
                  )}
                </div>

                <div className="p-5">
                  <div className="flex items-center gap-2">
                    <FileCode2 className="size-4 text-violet-700" />
                    <h3 className="text-sm font-semibold">数据库工件</h3>
                    <span className="ml-auto text-xs text-slate-400">{selected.artifacts.length} 项</span>
                  </div>
                  <select className="mt-3 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:border-slate-900" onChange={(event) => setArtifactPath(event.target.value)} value={activeArtifact?.path ?? ""}>
                    {selected.artifacts.map((artifact) => (
                      <option key={artifact.path} value={artifact.path}>.trellis/{artifact.path}</option>
                    ))}
                  </select>
                  <pre className="mt-3 max-h-60 overflow-auto rounded-lg bg-slate-950 p-3 text-[11px] leading-5 text-slate-200">
                    {activeArtifact?.content}
                  </pre>

                  <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">运行记录</p>
                  <ol className="mt-3 space-y-3">
                    {selected.events.map((event) => (
                      <li className="flex gap-2.5 text-xs" key={event.id}>
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-cyan-500" />
                        <div>
                          <p className="font-medium text-slate-700">{event.event}</p>
                          <p className="mt-0.5 leading-5 text-slate-500">{event.detail}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            ) : (
              <div className="flex min-h-96 flex-col items-center justify-center p-8 text-center">
                <FileCode2 className="size-5 text-slate-400" />
                <h2 className="mt-3 text-sm font-semibold">选择一张卡片</h2>
                <p className="mt-2 text-xs leading-5 text-slate-500">查看其 Trellis 工件、worktree 路径和执行记录。</p>
              </div>
            )}
          </aside>
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>新建 JR 任务</DialogTitle>
            <DialogDescription>先写入 SQLite 工件；点击卡片后才会创建 worktree。</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={createCard}>
            <label className="grid gap-1.5 text-sm font-medium">
              任务标题
              <input className="h-10 rounded-lg border border-slate-200 px-3 text-sm font-normal outline-none focus:border-slate-950" maxLength={120} minLength={3} onChange={(event) => setTitle(event.target.value)} placeholder="例如：为邀请流程补充失效链接提示" required value={title} />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              目标与验收方向
              <textarea className="min-h-28 resize-y rounded-lg border border-slate-200 p-3 text-sm font-normal outline-none focus:border-slate-950" maxLength={1200} minLength={8} onChange={(event) => setDescription(event.target.value)} placeholder="描述用户问题、范围与完成时需要验证的行为。" required value={description} />
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>取消</Button>
              <Button disabled={pending === "create"} type="submit">{pending === "create" ? "正在保存…" : "创建任务工件"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function Card({
  card,
  isPending,
  isSelected,
  onClick,
  onInspect,
}: {
  card: JrCard;
  isPending: boolean;
  isSelected: boolean;
  onClick: () => void;
  onInspect: () => void;
}) {
  return (
    <article
      aria-label={`${card.title}，${statusLabel(card.status)}`}
      className={`rounded-xl border bg-white p-4 shadow-sm transition ${
        isSelected ? "border-slate-950 ring-2 ring-slate-950/10" : "border-slate-200 hover:-translate-y-0.5 hover:shadow-md"
      } ${card.status === "backlog" ? "cursor-pointer" : "cursor-default"}`}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="flex items-center justify-between gap-2">
        <Badge variant="outline" className={statusStyles[card.status]}>{statusLabel(card.status)}</Badge>
        <code className="text-[10px] text-slate-400">{card.taskKey.slice(-8)}</code>
      </div>
      <h3 className="mt-3 text-sm font-semibold leading-5">{card.title}</h3>
      <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-600">{card.description}</p>
      <Separator className="my-3" />
      <div className="flex items-center justify-between gap-2">
        <button className="text-xs font-medium text-slate-500 hover:text-slate-950" onClick={(event) => { event.stopPropagation(); onInspect(); }}>
          查看工件
        </button>
        {card.status === "backlog" ? (
          <span className="flex items-center gap-1 text-xs font-semibold text-cyan-700">
            <Play className="size-3" />{isPending ? "正在创建…" : "点击执行"}
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs text-slate-400">
            <GitBranch className="size-3" />{card.branch ?? "已归档"}
          </span>
        )}
      </div>
    </article>
  );
}
