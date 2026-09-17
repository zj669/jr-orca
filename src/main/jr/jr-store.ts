import {
  isJrHarness,
  JR_HARNESS_CATALOG,
  type JrActor,
  type JrBoardSnapshot,
  type JrCard,
  type JrCardTransition,
  type JrControllerActor,
  type JrCreateCardInput,
  type JrExecutionLaunchRequest,
  type JrExecutionRelaunchRequest,
  type JrRecordAgentSessionInput,
  type JrDeliveryRecord,
  type JrRecordWorktreeInput,
  type JrReviewLaunchRequest,
  type JrReviewSnapshot,
  type JrShipRequest,
  type JrUpdateCardDetailsInput,
  type JrUpdateCardInput,
  type JrUpdateExecutionTargetInput,
  type JrUpdateReviewConfigurationInput,
  type JrAgentLifecycleState
} from '../../shared/jr/jr-types'
import { requireJrActor, requireJrController } from './jr-card-transition-guards'
import {
  getJrCard,
  JR_CARD_SELECT_COLUMNS,
  jrNow,
  readJrCard,
  recordJrEvent,
  upsertJrArtifact
} from './jr-card-records'
import { requireJrDatabaseRow } from './jr-database-records'
import { JrExecutionStore } from './jr-execution-store'
import { JrReviewStore } from './jr-review-store'
import { JrLifecycleStore } from './jr-lifecycle-store'
import { openJrSqlite } from './jr-store-schema'

const CONFIGURABLE_STATUSES = new Set<JrCard['status']>(['idea', 'discussion', 'planning'])

export class JrStore {
  private readonly db: ReturnType<typeof openJrSqlite>
  private readonly execution: JrExecutionStore
  private readonly review: JrReviewStore
  private readonly lifecycle: JrLifecycleStore

  constructor(databasePath: string) {
    this.db = openJrSqlite(databasePath)
    this.execution = new JrExecutionStore(this.db)
    this.review = new JrReviewStore(this.db)
    this.lifecycle = new JrLifecycleStore(this.db)
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
    const id = this.lifecycle.createCard(input, actor)
    return this.readCard(id)
  }

  updateCardConfiguration(
    cardId: string,
    input: JrUpdateCardInput,
    actor: JrControllerActor
  ): JrCard {
    requireJrController(actor)
    const card = this.readCard(cardId)
    if (!CONFIGURABLE_STATUSES.has(card.status)) {
      throw new Error('执行批准后不能修改 harness 或模型；请返回规划中后重试。')
    }
    if (!isJrHarness(input.harness)) {
      throw new Error('选择的 harness 不在 Phase 1 范围内。')
    }
    const { harness, model } = resolveJrHarnessModel(input)
    this.db
      .prepare(
        `UPDATE jr_cards
         SET harness = ?, model_id = ?, model_label = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(harness.id, model.id, model.label, jrNow(), cardId)
    recordJrEvent(this.db, cardId, 'AI 配置已更新', `${harness.label} · ${model.label}`, actor)
    const updated = this.readCard(cardId)
    this.lifecycle.invalidatePlanIfNeeded(card, updated, actor)
    return this.readCard(cardId)
  }

  updateCardReviewConfiguration(
    cardId: string,
    input: JrUpdateReviewConfigurationInput,
    actor: JrControllerActor
  ): JrCard {
    requireJrController(actor)
    const card = this.readCard(cardId)
    if (card.status === 'merged' || card.status === 'cancelled') {
      throw new Error('卡片完成后不能修改审查 AI。')
    }
    const { harness, model } = resolveJrHarnessModel(input)
    this.db
      .prepare(
        `UPDATE jr_cards
         SET review_harness = ?, review_model_id = ?, review_model_label = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(harness.id, model.id, model.label, jrNow(), cardId)
    recordJrEvent(this.db, cardId, '审查 AI 配置已更新', `${harness.label} · ${model.label}`, actor)
    return this.readCard(cardId)
  }

  transition(cardId: string, transition: JrCardTransition, actor: JrActor): JrCard {
    this.lifecycle.transition(this.readCard(cardId), transition, actor)
    return this.readCard(cardId)
  }

  updateCardExecutionTarget(
    cardId: string,
    input: JrUpdateExecutionTargetInput,
    actor: JrControllerActor
  ): JrCard {
    requireJrController(actor)
    this.execution.updateTarget(this.readCard(cardId), input, actor)
    return this.readCard(cardId)
  }

  prepareExecution(cardId: string, actor: JrControllerActor): JrExecutionLaunchRequest {
    requireJrController(actor)
    return this.execution.prepareLaunch(this.readCard(cardId), actor)
  }

  prepareExecutionRelaunch(cardId: string, actor: JrControllerActor): JrExecutionRelaunchRequest {
    requireJrController(actor)
    return this.execution.prepareRelaunch(this.readCard(cardId))
  }

  prepareReviewLaunch(cardId: string, actor: JrControllerActor): JrReviewLaunchRequest {
    requireJrController(actor)
    return this.review.prepareLaunch(this.readCard(cardId))
  }

  recordWorktreeCreated(
    cardId: string,
    input: JrRecordWorktreeInput,
    actor: JrControllerActor
  ): JrCard {
    requireJrController(actor)
    this.execution.recordWorktreeCreated(this.readCard(cardId), input, actor)
    return this.readCard(cardId)
  }

  recordWorktreeProgress(
    cardId: string,
    phase: 'fetching' | 'creating',
    actor: JrControllerActor
  ): JrCard {
    requireJrController(actor)
    this.execution.recordWorktreeProgress(this.readCard(cardId), phase, actor)
    return this.readCard(cardId)
  }

  recordAgentStarted(
    cardId: string,
    input: JrRecordAgentSessionInput,
    actor: JrControllerActor
  ): JrCard {
    requireJrController(actor)
    this.execution.recordAgentStarted(this.readCard(cardId), input, actor)
    return this.readCard(cardId)
  }

  recordAgentStatus(
    cardId: string,
    status: JrAgentLifecycleState,
    actor: JrControllerActor
  ): JrCard {
    requireJrController(actor)
    this.execution.recordAgentStatus(this.readCard(cardId), status, actor)
    return this.readCard(cardId)
  }

  recordAgentExit(cardId: string, code: number, actor: JrControllerActor): JrCard {
    requireJrController(actor)
    this.execution.recordAgentExit(this.readCard(cardId), code, actor)
    return this.readCard(cardId)
  }

  blockExecution(cardId: string, reason: string, actor: JrControllerActor): JrCard {
    requireJrController(actor)
    const card = this.readCard(cardId)
    if (!this.review.block(card, reason, actor)) {
      this.execution.block(card, reason, actor)
    }
    return this.readCard(cardId)
  }

  requestReview(cardId: string, snapshot: JrReviewSnapshot, actor: JrControllerActor): JrCard {
    requireJrController(actor)
    this.review.requestReview(this.readCard(cardId), snapshot, actor)
    return this.readCard(cardId)
  }

  passVerification(cardId: string, actor: JrControllerActor): JrCard {
    requireJrController(actor)
    this.review.passVerification(this.readCard(cardId), actor)
    return this.readCard(cardId)
  }

  returnToExecution(cardId: string, actor: JrControllerActor): JrCard {
    requireJrController(actor)
    this.review.returnToExecution(this.readCard(cardId), actor)
    return this.readCard(cardId)
  }

  prepareShip(cardId: string, actor: JrControllerActor): JrShipRequest {
    requireJrController(actor)
    return this.review.prepareShip(this.readCard(cardId), actor)
  }

  recordMerged(cardId: string, delivery: JrDeliveryRecord, actor: JrControllerActor): JrCard {
    requireJrController(actor)
    this.review.recordMerged(this.readCard(cardId), delivery, actor)
    return this.readCard(cardId)
  }

  updateCardDetails(
    cardId: string,
    input: JrUpdateCardDetailsInput,
    actor: JrControllerActor
  ): JrCard {
    requireJrController(actor)
    this.lifecycle.updateDetails(this.readCard(cardId), input, actor)
    return this.readCard(cardId)
  }

  rejectExecutionApproval(cardId: string, actor: JrControllerActor): JrCard {
    requireJrController(actor)
    this.lifecycle.rejectExecutionApproval(this.readCard(cardId), actor)
    return this.readCard(cardId)
  }

  resumeBlocked(cardId: string, actor: JrControllerActor): JrCard {
    requireJrController(actor)
    this.lifecycle.resumeBlocked(this.readCard(cardId), actor)
    return this.readCard(cardId)
  }

  writeTaskRecord(
    cardId: string,
    input: { title?: string; summary?: string; acceptance?: string },
    actor: JrActor
  ): JrCard {
    requireJrActor(actor)
    this.lifecycle.writeTaskRecord(this.readCard(cardId), input, actor)
    return this.readCard(cardId)
  }

  writeArtifact(cardId: string, path: string, content: string, actor: JrActor): JrCard {
    requireJrActor(actor)
    this.readCard(cardId)
    upsertJrArtifact(this.db, cardId, path, content, actor)
    return this.readCard(cardId)
  }

  recordEvent(cardId: string, kind: string, detail: string, actor: JrActor): JrCard {
    requireJrActor(actor)
    this.readCard(cardId)
    recordJrEvent(this.db, cardId, kind, detail, actor)
    return this.readCard(cardId)
  }

  readCard(cardId: string): JrCard {
    return getJrCard(this.db, cardId)
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
}

function resolveJrHarnessModel(input: JrUpdateCardInput): {
  harness: (typeof JR_HARNESS_CATALOG)[number]
  model: (typeof JR_HARNESS_CATALOG)[number]['models'][number]
} {
  if (!isJrHarness(input.harness)) {
    throw new Error('选择的 harness 不在 Phase 1 范围内。')
  }
  const harness = JR_HARNESS_CATALOG.find((item) => item.id === input.harness)
  const model = harness?.models.find((item) => item.id === input.modelId)
  if (!harness || !model) {
    throw new Error('该模型不受当前 harness 支持。')
  }
  return { harness, model }
}
