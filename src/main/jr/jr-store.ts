import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type SyncDatabase from '../sqlite/sync-database'
import {
  isJrHarness,
  JR_HARNESS_CATALOG,
  type JrBoardSnapshot,
  type JrCard,
  type JrCardTransition,
  type JrControllerActor,
  type JrCreateCardInput,
  type JrExecutionLaunchRequest,
  type JrRecordAgentSessionInput,
  type JrDeliveryRecord,
  type JrRecordWorktreeInput,
  type JrReviewSnapshot,
  type JrShipRequest,
  type JrUpdateCardInput,
  type JrUpdateExecutionTargetInput,
  type JrAgentLifecycleState
} from '../../shared/jr/jr-types'
import {
  requireJrAiConfiguration,
  requireJrCardState,
  requireJrController
} from './jr-card-transition-guards'
import { buildJrPlanningArtifacts, jrTaskArtifactPath } from './jr-trellis-artifact-templates'
import {
  getJrCard,
  JR_CARD_SELECT_COLUMNS,
  jrNow,
  readJrCard,
  recordJrEvent,
  setJrCardStatus,
  upsertJrArtifact
} from './jr-card-records'
import { requireJrDatabaseRow } from './jr-database-records'
import { JrExecutionStore } from './jr-execution-store'
import { JrReviewStore } from './jr-review-store'
import { openJrSqlite } from './jr-store-schema'

const CONFIGURABLE_STATUSES = new Set<JrCard['status']>(['idea', 'discussion', 'planning'])

export class JrStore {
  private readonly db: SyncDatabase
  private readonly execution: JrExecutionStore
  private readonly review: JrReviewStore

  constructor(databasePath: string) {
    this.db = openJrSqlite(databasePath)
    this.execution = new JrExecutionStore(this.db)
    this.review = new JrReviewStore(this.db)
    this.ensureDemoCard()
  }

  listBoard(): JrBoardSnapshot {
    const rows = this.db
      .prepare(
        `SELECT ${JR_CARD_SELECT_COLUMNS}
         FROM jr_cards
         ORDER BY updated_at DESC`
      )
      .all()
    return {
      cards: rows.map((row) =>
        readJrCard(this.db, requireJrDatabaseRow(row, 'JR card row is invalid.'))
      ),
      harnesses: JR_HARNESS_CATALOG
    }
  }

  close(): void {
    this.db.close()
  }

  createCard(input: JrCreateCardInput, actor: JrControllerActor): JrCard {
    requireJrController(actor)
    const title = input.title.trim()
    const description = input.description?.trim() || '补充问题、预期结果和验收标准。'
    if (title.length < 2 || title.length > 160) {
      throw new Error('JR 卡片标题需要在 2 到 160 个字符之间。')
    }
    if (description.length > 2_000) {
      throw new Error('JR 卡片说明不能超过 2000 个字符。')
    }
    const timestamp = jrNow()
    const id = randomUUID()
    this.db
      .prepare(
        `INSERT INTO jr_cards (
          id, title, description, status, harness, model_id, model_label, created_at, updated_at
        ) VALUES (?, ?, ?, 'idea', NULL, NULL, NULL, ?, ?)`
      )
      .run(id, title, description, timestamp, timestamp)
    upsertJrArtifact(
      this.db,
      id,
      jrTaskArtifactPath(id, 'idea.md'),
      `# ${title}\n\n${description}\n`
    )
    recordJrEvent(this.db, id, '卡片已创建', '想法已记录，尚未授权 AI 讨论或执行。', actor)
    return this.getCard(id)
  }

  updateCardConfiguration(
    cardId: string,
    input: JrUpdateCardInput,
    actor: JrControllerActor
  ): JrCard {
    requireJrController(actor)
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
      .run(harness.id, model.id, model.label, jrNow(), cardId)
    recordJrEvent(this.db, cardId, 'AI 配置已更新', `${harness.label} · ${model.label}`, actor)
    return this.getCard(cardId)
  }

  transition(cardId: string, transition: JrCardTransition, actor: JrControllerActor): JrCard {
    requireJrController(actor)
    const card = this.getCard(cardId)
    if (transition === 'begin-discussion') {
      requireJrCardState(card, 'idea', '开始讨论')
      requireJrAiConfiguration(card)
      setJrCardStatus(this.db, cardId, 'discussion')
      upsertJrArtifact(
        this.db,
        cardId,
        jrTaskArtifactPath(cardId, 'discussion.md'),
        `# Discussion\n\nHarness: ${card.harness}\nModel: ${card.model?.label}\n\nCapture decisions using JR-backed artifacts before planning.\n`
      )
      recordJrEvent(
        this.db,
        cardId,
        '讨论已开始',
        '已绑定卡片的 harness 与模型；该阶段不授权代码写入。',
        actor
      )
    } else if (transition === 'begin-planning') {
      requireJrCardState(card, 'discussion', '进入规划')
      requireJrAiConfiguration(card)
      setJrCardStatus(this.db, cardId, 'planning')
      const plannedCard = this.getCard(cardId)
      for (const artifact of buildJrPlanningArtifacts(plannedCard)) {
        upsertJrArtifact(this.db, cardId, artifact.path, artifact.content)
      }
      recordJrEvent(
        this.db,
        cardId,
        '规划已开始',
        'Trellis PRD、设计和实施计划已存入 JR 数据库。',
        actor
      )
    } else {
      requireJrCardState(card, 'planning', '提交执行审批')
      requireJrAiConfiguration(card)
      this.execution.requireTarget(card)
      setJrCardStatus(this.db, cardId, 'pending_execution_approval')
      recordJrEvent(
        this.db,
        cardId,
        '等待执行审批',
        '控制器已冻结计划。只有明确批准才能创建 Orca worktree。',
        actor
      )
    }
    return this.getCard(cardId)
  }

  updateCardExecutionTarget(
    cardId: string,
    input: JrUpdateExecutionTargetInput,
    actor: JrControllerActor
  ): JrCard {
    requireJrController(actor)
    this.execution.updateTarget(this.getCard(cardId), input, actor)
    return this.getCard(cardId)
  }

  prepareExecution(cardId: string, actor: JrControllerActor): JrExecutionLaunchRequest {
    requireJrController(actor)
    return this.execution.prepareLaunch(this.getCard(cardId), actor)
  }

  recordWorktreeCreated(
    cardId: string,
    input: JrRecordWorktreeInput,
    actor: JrControllerActor
  ): JrCard {
    requireJrController(actor)
    this.execution.recordWorktreeCreated(this.getCard(cardId), input, actor)
    return this.getCard(cardId)
  }

  recordWorktreeProgress(
    cardId: string,
    phase: 'fetching' | 'creating',
    actor: JrControllerActor
  ): JrCard {
    requireJrController(actor)
    this.execution.recordWorktreeProgress(this.getCard(cardId), phase, actor)
    return this.getCard(cardId)
  }

  recordAgentStarted(
    cardId: string,
    input: JrRecordAgentSessionInput,
    actor: JrControllerActor
  ): JrCard {
    requireJrController(actor)
    this.execution.recordAgentStarted(this.getCard(cardId), input, actor)
    return this.getCard(cardId)
  }

  recordAgentStatus(
    cardId: string,
    status: JrAgentLifecycleState,
    actor: JrControllerActor
  ): JrCard {
    requireJrController(actor)
    this.execution.recordAgentStatus(this.getCard(cardId), status, actor)
    return this.getCard(cardId)
  }

  recordAgentExit(cardId: string, code: number, actor: JrControllerActor): JrCard {
    requireJrController(actor)
    this.execution.recordAgentExit(this.getCard(cardId), code, actor)
    return this.getCard(cardId)
  }

  blockExecution(cardId: string, reason: string, actor: JrControllerActor): JrCard {
    requireJrController(actor)
    const card = this.getCard(cardId)
    if (!this.review.block(card, reason, actor)) {
      this.execution.block(card, reason, actor)
    }
    return this.getCard(cardId)
  }

  requestReview(cardId: string, snapshot: JrReviewSnapshot, actor: JrControllerActor): JrCard {
    requireJrController(actor)
    this.review.requestReview(this.getCard(cardId), snapshot, actor)
    return this.getCard(cardId)
  }

  passVerification(cardId: string, actor: JrControllerActor): JrCard {
    requireJrController(actor)
    this.review.passVerification(this.getCard(cardId), actor)
    return this.getCard(cardId)
  }

  returnToExecution(cardId: string, actor: JrControllerActor): JrCard {
    requireJrController(actor)
    this.review.returnToExecution(this.getCard(cardId), actor)
    return this.getCard(cardId)
  }

  prepareShip(cardId: string, actor: JrControllerActor): JrShipRequest {
    requireJrController(actor)
    return this.review.prepareShip(this.getCard(cardId), actor)
  }

  recordMerged(cardId: string, delivery: JrDeliveryRecord, actor: JrControllerActor): JrCard {
    requireJrController(actor)
    this.review.recordMerged(this.getCard(cardId), delivery, actor)
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
    return getJrCard(this.db, cardId)
  }
}

let jrStore: JrStore | null = null

export function getJrStore(): JrStore {
  if (!jrStore) {
    jrStore = new JrStore(join(app.getPath('userData'), 'jr', 'jr.sqlite'))
  }
  return jrStore
}
