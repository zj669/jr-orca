import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type {
  BoardData,
  CardStatus,
  JrCard,
  RunEvent,
  TrellisArtifact,
} from "@/lib/jr/types";

type CardRow = Omit<JrCard, "artifacts" | "events"> & {
  task_key: string;
  base_branch: string | null;
  worktree_path: string | null;
  execution_provider: JrCard["executionProvider"];
  created_at: string;
  updated_at: string;
};

type ArtifactRow = {
  id: string;
  card_id: string;
  path: string;
  content: string;
  updated_at: string;
};

type EventRow = {
  id: string;
  card_id: string;
  event: string;
  detail: string;
  created_at: string;
};

const dbPath = process.env.JR_DB_PATH ?? join(process.cwd(), ".jr", "jr.sqlite");

declare global {
  var jrDatabase: DatabaseSync | undefined;
  var jrDatabaseInitialized: boolean | undefined;
}

function getDatabase() {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = global.jrDatabase ?? new DatabaseSync(dbPath);
  global.jrDatabase = db;

  if (!global.jrDatabaseInitialized) {
    db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS cards (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        status TEXT NOT NULL,
        task_key TEXT NOT NULL UNIQUE,
        branch TEXT,
        base_branch TEXT,
        worktree_path TEXT,
        execution_provider TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS artifacts (
        id TEXT PRIMARY KEY,
        card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
        path TEXT NOT NULL,
        content TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(card_id, path)
      );

      CREATE TABLE IF NOT EXISTS run_events (
        id TEXT PRIMARY KEY,
        card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
        event TEXT NOT NULL,
        detail TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
    global.jrDatabaseInitialized = true;
    seedDemoCard(db);
  }

  return db;
}

function now() {
  return new Date().toISOString();
}

function slugify(title: string) {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\u4e00-\u9fff]+/g, "-")
    .replace(/(^-|-$)/g, "");

  return slug || "task";
}

function trellisState(status: CardStatus) {
  if (status === "backlog") return "planning";
  if (status === "developing") return "in_progress";
  return "completed";
}

function taskDirectory(card: Pick<JrCard, "taskKey">) {
  return `tasks/${card.taskKey}`;
}

function createTaskJson(card: JrCard) {
  return JSON.stringify(
    {
      id: card.id,
      title: card.title,
      status: trellisState(card.status),
      task_key: card.taskKey,
      branch: card.branch,
      source: "JR SQLite (canonical); this worktree copy is a generated projection.",
    },
    null,
    2,
  );
}

function createArtifacts(card: JrCard) {
  const taskDir = taskDirectory(card);
  const title = card.title;

  return [
    {
      path: "workflow.md",
      content: `# JR Trellis workflow\n\n> Generated from JR's SQLite task record. Do not edit this projection directly.\n\n## Plan\n- Read \`${taskDir}/prd.md\` and the relevant specs before changing code.\n- Keep implementation context scoped to this task.\n\n## Execute\n- Make the smallest change that satisfies the PRD.\n- Run the task-appropriate checks before requesting review.\n\n## Finish\n- Record reusable learnings in a spec when justified.\n- Commit work, then hand it to JR for approval and merge.\n`,
    },
    {
      path: "spec/jr-board.md",
      content: `# JR execution contract\n\n- The JR database is the source of truth for task artifacts and lifecycle.\n- Files in \`.trellis/\` are generated worktree projections.\n- Read the PRD before implementation and keep changes within its acceptance criteria.\n- Do not directly edit generated Trellis files; update them through JR.\n`,
    },
    {
      path: `${taskDir}/task.json`,
      content: createTaskJson(card),
    },
    {
      path: `${taskDir}/prd.md`,
      content: `# ${title}\n\n## 目标\n${card.description}\n\n## 验收标准\n- 在独立 Git worktree 中完成本任务。\n- 实现前阅读相关规范与本 PRD。\n- 完成后运行适用的验证，并交由 Walker 审批合并。\n\n## 非目标\n- 不在本任务中直接修改 JR 的数据库记录。\n- 不把 Trellis 投影文件作为事实来源。\n`,
    },
    {
      path: `${taskDir}/design.md`,
      content: `# ${title} — 技术设计\n\n## 边界\n本任务在 JR 为其创建的独立 worktree 中执行。\n\n## 数据与流程\nJR SQLite 保存 PRD、设计、实现计划和上下文清单；执行时将它们投影到 \`.trellis/\`。开发完成后由 JR 审批门禁合并分支。\n\n## 回滚\n拒绝合并即可保留卡片和 worktree 供进一步修改；删除 worktree 不会删除数据库中的任务工件。\n`,
    },
    {
      path: `${taskDir}/implement.md`,
      content: `# ${title} — 实施清单\n\n1. 阅读 \`prd.md\`、\`design.md\` 和 \`../../spec/jr-board.md\`。\n2. 检查现有代码，实施范围内的最小变更。\n3. 运行 lint、type-check 和相关测试。\n4. 在 JR 中标记为待审批；不要自行合并。\n`,
    },
    {
      path: `${taskDir}/implement.jsonl`,
      content: `${JSON.stringify({ path: ".trellis/spec/jr-board.md", reason: "JR task and projection contract" })}\n${JSON.stringify({ path: `.trellis/${taskDir}/prd.md`, reason: "Task requirements" })}\n${JSON.stringify({ path: `.trellis/${taskDir}/design.md`, reason: "Task boundaries" })}\n${JSON.stringify({ path: `.trellis/${taskDir}/implement.md`, reason: "Execution checklist" })}\n`,
    },
    {
      path: `${taskDir}/check.jsonl`,
      content: `${JSON.stringify({ path: ".trellis/spec/jr-board.md", reason: "Review against JR task contract" })}\n${JSON.stringify({ path: `.trellis/${taskDir}/prd.md`, reason: "Acceptance criteria" })}\n`,
    },
  ];
}

function mapArtifact(row: ArtifactRow): TrellisArtifact {
  return {
    id: row.id,
    cardId: row.card_id,
    path: row.path,
    content: row.content,
    updatedAt: row.updated_at,
  };
}

function mapEvent(row: EventRow): RunEvent {
  return {
    id: row.id,
    cardId: row.card_id,
    event: row.event,
    detail: row.detail,
    createdAt: row.created_at,
  };
}

function getArtifacts(db: DatabaseSync, cardId: string) {
  return (
    db
      .prepare(
        "SELECT id, card_id, path, content, updated_at FROM artifacts WHERE card_id = ? ORDER BY path",
      )
      .all(cardId) as ArtifactRow[]
  ).map(mapArtifact);
}

function getEvents(db: DatabaseSync, cardId: string) {
  return (
    db
      .prepare(
        "SELECT id, card_id, event, detail, created_at FROM run_events WHERE card_id = ? ORDER BY created_at DESC",
      )
      .all(cardId) as EventRow[]
  ).map(mapEvent);
}

function mapCard(db: DatabaseSync, row: CardRow): JrCard {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    taskKey: row.task_key,
    branch: row.branch,
    baseBranch: row.base_branch,
    worktreePath: row.worktree_path,
    executionProvider: row.execution_provider,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    artifacts: getArtifacts(db, row.id),
    events: getEvents(db, row.id),
  };
}

function getCardRow(db: DatabaseSync, id: string) {
  return db
    .prepare(
      `SELECT id, title, description, status, task_key, branch, base_branch,
        worktree_path, execution_provider, created_at, updated_at
       FROM cards WHERE id = ?`,
    )
    .get(id) as CardRow | undefined;
}

function upsertArtifact(db: DatabaseSync, cardId: string, path: string, content: string) {
  const timestamp = now();
  db.prepare(
    `INSERT INTO artifacts (id, card_id, path, content, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(card_id, path) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`,
  ).run(randomUUID(), cardId, path, content, timestamp);
}

function syncTaskArtifact(db: DatabaseSync, card: JrCard) {
  upsertArtifact(
    db,
    card.id,
    `${taskDirectory(card)}/task.json`,
    createTaskJson(card),
  );
}

function recordEvent(db: DatabaseSync, cardId: string, event: string, detail: string) {
  db.prepare(
    "INSERT INTO run_events (id, card_id, event, detail, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(randomUUID(), cardId, event, detail, now());
}

function seedDemoCard(db: DatabaseSync) {
  const count = db.prepare("SELECT COUNT(*) AS count FROM cards").get() as {
    count: number;
  };

  if (count.count > 0) return;

  createCardInternal(db, {
    title: "为结算失败增加可恢复的错误状态",
    description:
      "梳理结算接口的失败分支，给用户清晰的恢复提示，并用覆盖失败与重试路径的测试验证。",
  });
}

function createCardInternal(
  db: DatabaseSync,
  input: { title: string; description: string },
) {
  const timestamp = now();
  const card: JrCard = {
    id: randomUUID(),
    title: input.title.trim(),
    description: input.description.trim(),
    status: "backlog",
    taskKey: `${new Date().toISOString().slice(5, 10)}-${slugify(input.title)}-${randomUUID().slice(0, 5)}`,
    branch: null,
    baseBranch: null,
    worktreePath: null,
    executionProvider: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    artifacts: [],
    events: [],
  };

  db.prepare(
    `INSERT INTO cards (
      id, title, description, status, task_key, branch, base_branch,
      worktree_path, execution_provider, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    card.id,
    card.title,
    card.description,
    card.status,
    card.taskKey,
    card.branch,
    card.baseBranch,
    card.worktreePath,
    card.executionProvider,
    card.createdAt,
    card.updatedAt,
  );

  for (const artifact of createArtifacts(card)) {
    upsertArtifact(db, card.id, artifact.path, artifact.content);
  }
  recordEvent(db, card.id, "任务已创建", "JR 已将 PRD、设计和执行清单写入 SQLite。");

  return findCard(db, card.id);
}

export function createCard(input: { title: string; description: string }) {
  return createCardInternal(getDatabase(), input);
}

export function getCard(id: string) {
  return findCard(getDatabase(), id);
}

function findCard(db: DatabaseSync, id: string) {
  const row = getCardRow(db, id);
  if (!row) return null;
  return mapCard(db, row);
}

function persistCard(db: DatabaseSync, card: JrCard) {
  db.prepare(
    `UPDATE cards SET status = ?, branch = ?, base_branch = ?, worktree_path = ?,
      execution_provider = ?, updated_at = ? WHERE id = ?`,
  ).run(
    card.status,
    card.branch,
    card.baseBranch,
    card.worktreePath,
    card.executionProvider,
    card.updatedAt,
    card.id,
  );
}

export function activateCard(
  id: string,
  execution: {
    branch: string;
    baseBranch: string;
    worktreePath: string;
    executionProvider: "git-worktree" | "orca-cli";
  },
) {
  const db = getDatabase();
  const current = findCard(db, id);
  if (!current) return null;

  const card: JrCard = {
    ...current,
    status: "developing",
    ...execution,
    updatedAt: now(),
  };
  persistCard(db, card);
  syncTaskArtifact(db, card);
  recordEvent(
    db,
    id,
    "已创建开发环境",
    `${execution.executionProvider === "orca-cli" ? "Orca" : "Git"} 已创建 ${execution.branch}。`,
  );
  return findCard(db, id);
}

export function markReadyForReview(id: string) {
  const db = getDatabase();
  const current = findCard(db, id);
  if (!current) return null;

  const card: JrCard = {
    ...current,
    status: "ready_review",
    updatedAt: now(),
  };
  persistCard(db, card);
  syncTaskArtifact(db, card);
  recordEvent(db, id, "等待审批", "开发已完成；等待 Walker 批准并合并。");
  return findCard(db, id);
}

export function markMerged(id: string, mergeCommit: string) {
  const db = getDatabase();
  const current = findCard(db, id);
  if (!current) return null;

  const card: JrCard = {
    ...current,
    status: "merged",
    updatedAt: now(),
  };
  persistCard(db, card);
  recordEvent(db, id, "已合并", `JR 已完成合并：${mergeCommit.slice(0, 10)}。`);
  return findCard(db, id);
}

export function getBoard(): BoardData {
  const db = getDatabase();
  const rows = db
    .prepare(
      `SELECT id, title, description, status, task_key, branch, base_branch,
        worktree_path, execution_provider, created_at, updated_at
       FROM cards
       ORDER BY CASE status
         WHEN 'backlog' THEN 1
         WHEN 'developing' THEN 2
         WHEN 'ready_review' THEN 3
         ELSE 4 END, created_at DESC`,
    )
    .all() as CardRow[];

  return {
    cards: rows.map((row) => mapCard(db, row)),
    workspace: {
      dbPath,
      worktreeNote:
        "每次执行都会创建原生 Git worktree；Orca 可将外部 worktree 导入并继续管理。",
    },
  };
}
