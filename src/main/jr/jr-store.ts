import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import SyncDatabase from '../sqlite/sync-database'
import {
  isJrHarness,
  JR_CARD_STATUSES,
  JR_HARNESS_CATALOG,
  type JrArtifact,
  type JrBoardSnapshot,
  type JrCard,
  type JrCardStatus,
  type JrCardTransition,
  type JrControllerActor,
  type JrCreateCardInput,
  type JrEvent,
  type JrModelChoice,
  type JrUpdateCardInput
} from '../../shared/jr/jr-types'

type DbRow = Record<string, unknown>

const CONFIGURABLE_STATUSES = new Set<JrCardStatus>(['idea', 'discussion', 'planning'])

function isRecord(value: unknown): value is DbRow {
  return value !== null && typeof value === 'object'
}

function requireRecord(value: unknown, message: string): DbRow {
  if (!isRecord(value)) {
    throw new Error(message)
  }
  return value
}

function requireString(row: DbRow, key: string): string {
  const value = row[key]
  if (typeof value !== 'string') {
    throw new Error(`JR database field ${key} is invalid.`)
  }
  return value
}

function optionalString(row: DbRow, key: string): string | null {
  const value = row[key]
  return typeof value === 'string' ? value : null
}

function isJrCardStatus(value: string): value is JrCardStatus {
  return JR_CARD_STATUSES.some((status) => status === value)
}

function requireCardStatus(row: DbRow): JrCardStatus {
  const status = requireString(row, 'status')
  if (!isJrCardStatus(status)) {
    throw new Error(`JR database has an unknown status: ${status}.`)
  }
  return status
}

function now(): string {
  return new Date().toISOString()
}

function taskPath(cardId: string, artifact: string): string {
  return `tasks/${cardId}/${artifact}`
}

function planningArtifacts(card: JrCard): ReadonlyArray<{ path: string; content: string }> {
  const selectedModel = card.model?.label ?? '未选择'
  const selectedHarness = card.harness ?? '未选择'
  return [
    {
      path: 'workflow.md',
      content:
        '# JR Trellis workflow\n\nPlan → Execute → Finish is controlled by JR card state and controller approvals.\n'
    },
    {
      path: 'spec/jr-controller.md',
      content:
        '# JR controller contract\n\nTask harness agents use JR tools for workflow/spec/task data and cannot self-authorize execution or merge.\n'
    },
    {
      path: taskPath(card.id, 'prd.md'),
      content: `# ${card.title}\n\n## Outcome\n${card.description}\n\n## Acceptance criteria\n- Define the user-visible outcome.\n- Keep work inside the approved task boundary.\n- Request review only after validation.\n`
    },
    {
      path: taskPath(card.id, 'design.md'),
      content: `# ${card.title} — design\n\nHarness: ${selectedHarness}\nModel: ${selectedModel}\n\nRecord contracts, risks, and rollback before execution approval.\n`
    },
    {
      path: taskPath(card.id, 'implement.md'),
      content:
        '# Implementation checklist\n\n1. Read JR-backed PRD and specs.\n2. Implement only the approved scope.\n3. Run appropriate checks.\n4. Request review; do not merge.\n'
    }
  ]
}

export class JrStore {
  private readonly db: SyncDatabase

  constructor(databasePath: string) {
    mkdirSync(dirname(databasePath), { recursive: true })
    this.db = new SyncDatabase(databasePath)
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS jr_cards (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        status TEXT NOT NULL,
        harness TEXT,
        model_id TEXT,
        model_label TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS jr_artifacts (
        id TEXT PRIMARY KEY,
        card_id TEXT NOT NULL REFERENCES jr_cards(id) ON DELETE CASCADE,
        path TEXT NOT NULL,
        content TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(card_id, path)
      );

      CREATE TABLE IF NOT EXISTS jr_events (
        id TEXT PRIMARY KEY,
        card_id TEXT NOT NULL REFERENCES jr_cards(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        detail TEXT NOT NULL,
        actor TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `)
    this.ensureDemoCard()
  }

  listBoard(): JrBoardSnapshot {
    const rows = this.db
      .prepare(
        `SELECT id, title, description, status, harness, model_id, model_label, created_at, updated_at
         FROM jr_cards
         ORDER BY updated_at DESC`
      )
      .all()
    return {
      cards: rows.map((row) => this.readCard(requireRecord(row, 'JR card row is invalid.'))),
      harnesses: JR_HARNESS_CATALOG
    }
  }

  close(): void {
    this.db.close()
  }

  createCard(input: JrCreateCardInput, actor: JrControllerActor): JrCard {
    this.requireController(actor)
    const title = input.title.trim()
    const description = input.description?.trim() || '补充问题、预期结果和验收标准。'
    if (title.length < 2 || title.length > 160) {
      throw new Error('JR 卡片标题需要在 2 到 160 个字符之间。')
    }
    if (description.length > 2_000) {
      throw new Error('JR 卡片说明不能超过 2000 个字符。')
    }
    const timestamp = now()
    const id = randomUUID()
    this.db
      .prepare(
        `INSERT INTO jr_cards (
          id, title, description, status, harness, model_id, model_label, created_at, updated_at
        ) VALUES (?, ?, ?, 'idea', NULL, NULL, NULL, ?, ?)`
      )
      .run(id, title, description, timestamp, timestamp)
    this.upsertArtifact(id, taskPath(id, 'idea.md'), `# ${title}\n\n${description}\n`)
    this.recordEvent(id, '卡片已创建', '想法已记录，尚未授权 AI 讨论或执行。', actor)
    return this.getCard(id)
  }

  updateCardConfiguration(
    cardId: string,
    input: JrUpdateCardInput,
    actor: JrControllerActor
  ): JrCard {
    this.requireController(actor)
    const card = this.getCard(cardId)
    if (!CONFIGURABLE_STATUSES.has(card.status)) {
      throw new Error('执行批准后不能修改 harness 或模型；请返回规划中后重试。')
    }
    if (!isJrHarness(input.harness)) {
      throw new Error('选择的 harness 不在 Phase 1 范围内。')
    }
    const harness = JR_HARNESS_CATALOG.find((item) => item.id === input.harness)
    const model = harness?.models.find((item) => item.id === input.modelId)
    if (!harness || !model) {
      throw new Error('该模型不受当前 harness 支持。')
    }
    this.db
      .prepare(
        `UPDATE jr_cards
         SET harness = ?, model_id = ?, model_label = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(harness.id, model.id, model.label, now(), cardId)
    this.recordEvent(cardId, 'AI 配置已更新', `${harness.label} · ${model.label}`, actor)
    return this.getCard(cardId)
  }

  transition(cardId: string, transition: JrCardTransition, actor: JrControllerActor): JrCard {
    this.requireController(actor)
    const card = this.getCard(cardId)
    if (transition === 'begin-discussion') {
      this.requireState(card, 'idea', '开始讨论')
      this.requireAiConfiguration(card)
      this.setStatus(cardId, 'discussion')
      this.upsertArtifact(
        cardId,
        taskPath(cardId, 'discussion.md'),
        `# Discussion\n\nHarness: ${card.harness}\nModel: ${card.model?.label}\n\nCapture decisions using JR-backed artifacts before planning.\n`
      )
      this.recordEvent(cardId, '讨论已开始', '已绑定卡片的 harness 与模型；该阶段不授权代码写入。', actor)
    } else if (transition === 'begin-planning') {
      this.requireState(card, 'discussion', '进入规划')
      this.requireAiConfiguration(card)
      this.setStatus(cardId, 'planning')
      const plannedCard = this.getCard(cardId)
      for (const artifact of planningArtifacts(plannedCard)) {
        this.upsertArtifact(cardId, artifact.path, artifact.content)
      }
      this.recordEvent(cardId, '规划已开始', 'Trellis PRD、设计和实施计划已存入 JR 数据库。', actor)
    } else {
      this.requireState(card, 'planning', '提交执行审批')
      this.requireAiConfiguration(card)
      this.requireArtifact(cardId, taskPath(cardId, 'prd.md'))
      this.setStatus(cardId, 'pending_execution_approval')
      this.recordEvent(
        cardId,
        '等待执行审批',
        '控制器已冻结计划。仅 controller 可以在后续切片启动 Orca worktree。',
        actor
      )
    }
    return this.getCard(cardId)
  }

  private ensureDemoCard(): void {
    const row = this.db.prepare('SELECT id FROM jr_cards LIMIT 1').get()
    if (row !== undefined) {
      return
    }
    this.createCard(
      {
        title: '梳理邀请链接失效后的恢复体验',
        description: '讨论用户遇到失效邀请链接时的恢复路径，并在规划中写出可验证的交付边界。'
      },
      { kind: 'human-controller', id: 'local-user' }
    )
  }

  private getCard(cardId: string): JrCard {
    const row = this.db
      .prepare(
        `SELECT id, title, description, status, harness, model_id, model_label, created_at, updated_at
         FROM jr_cards WHERE id = ?`
      )
      .get(cardId)
    if (row === undefined) {
      throw new Error('未找到 JR 卡片。')
    }
    return this.readCard(requireRecord(row, 'JR card row is invalid.'))
  }

  private readCard(row: DbRow): JrCard {
    const id = requireString(row, 'id')
    const harnessValue = optionalString(row, 'harness')
    const modelId = optionalString(row, 'model_id')
    const modelLabel = optionalString(row, 'model_label')
    const model: JrModelChoice | null =
      modelId && modelLabel
        ? { id: modelId, label: modelLabel, capabilitySource: 'orca-default' }
        : null
    return {
      id,
      title: requireString(row, 'title'),
      description: requireString(row, 'description'),
      status: requireCardStatus(row),
      harness: harnessValue && isJrHarness(harnessValue) ? harnessValue : null,
      model,
      createdAt: requireString(row, 'created_at'),
      updatedAt: requireString(row, 'updated_at'),
      artifacts: this.listArtifacts(id),
      events: this.listEvents(id)
    }
  }

  private listArtifacts(cardId: string): JrArtifact[] {
    const rows = this.db
      .prepare(
        `SELECT id, card_id, path, content, updated_at FROM jr_artifacts
         WHERE card_id = ? ORDER BY path`
      )
      .all(cardId)
    return rows.map((value) => {
      const row = requireRecord(value, 'JR artifact row is invalid.')
      return {
        id: requireString(row, 'id'),
        cardId: requireString(row, 'card_id'),
        path: requireString(row, 'path'),
        content: requireString(row, 'content'),
        updatedAt: requireString(row, 'updated_at')
      }
    })
  }

  private listEvents(cardId: string): JrEvent[] {
    const rows = this.db
      .prepare(
        `SELECT id, card_id, kind, detail, actor, created_at FROM jr_events
         WHERE card_id = ? ORDER BY created_at DESC`
      )
      .all(cardId)
    return rows.map((value) => {
      const row = requireRecord(value, 'JR event row is invalid.')
      return {
        id: requireString(row, 'id'),
        cardId: requireString(row, 'card_id'),
        kind: requireString(row, 'kind'),
        detail: requireString(row, 'detail'),
        actor: requireString(row, 'actor'),
        createdAt: requireString(row, 'created_at')
      }
    })
  }

  private upsertArtifact(cardId: string, path: string, content: string): void {
    this.db
      .prepare(
        `INSERT INTO jr_artifacts (id, card_id, path, content, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(card_id, path) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`
      )
      .run(randomUUID(), cardId, path, content, now())
  }

  private recordEvent(
    cardId: string,
    kind: string,
    detail: string,
    actor: JrControllerActor
  ): void {
    this.db
      .prepare(
        `INSERT INTO jr_events (id, card_id, kind, detail, actor, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(randomUUID(), cardId, kind, detail, `${actor.kind}:${actor.id}`, now())
  }

  private setStatus(cardId: string, status: JrCardStatus): void {
    this.db
      .prepare('UPDATE jr_cards SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, now(), cardId)
  }

  private requireArtifact(cardId: string, path: string): void {
    const row = this.db
      .prepare('SELECT id FROM jr_artifacts WHERE card_id = ? AND path = ?')
      .get(cardId, path)
    if (row === undefined) {
      throw new Error('PRD 尚未写入 JR 数据库。')
    }
  }

  private requireController(actor: JrControllerActor): void {
    if (
      (actor.kind !== 'human-controller' && actor.kind !== 'master-controller') ||
      actor.id.trim().length === 0
    ) {
      throw new Error('该操作需要具备 controller 能力的 actor。')
    }
  }

  private requireAiConfiguration(card: JrCard): void {
    if (!card.harness || !card.model) {
      throw new Error('请先为卡片选择 Phase 1 harness 和模型。')
    }
  }

  private requireState(card: JrCard, expected: JrCardStatus, action: string): void {
    if (card.status !== expected) {
      throw new Error(`卡片必须处于 ${expected} 才能${action}。`)
    }
  }
}

let jrStore: JrStore | null = null

export function getJrStore(): JrStore {
  if (!jrStore) {
    jrStore = new JrStore(join(app.getPath('userData'), 'jr', 'jr.sqlite'))
  }
  return jrStore
}
