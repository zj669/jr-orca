import { randomUUID } from 'node:crypto'
import type SyncDatabase from '../sqlite/sync-database'
import {
  assertJrExecutionContract,
  isJrCardPriority,
  JR_PLACEHOLDER_DESCRIPTION,
  type JrActor,
  type JrCard,
  type JrCardTransition,
  type JrControllerActor,
  type JrCreateCardInput,
  type JrUpdateCardDetailsInput
} from '../../shared/jr/jr-types'
import {
  requireJrActor,
  requireJrAiConfiguration,
  requireJrCardState,
  requireJrController
} from './jr-card-transition-guards'
import { buildJrPlanningArtifacts, jrTaskArtifactPath } from './jr-trellis-artifact-templates'
import {
  getJrCard,
  jrNow,
  recordJrEvent,
  setJrCardStatus,
  upsertJrArtifact
} from './jr-card-records'
import { clearJrBlocked } from './jr-blocked-state'

const CONFIGURABLE = new Set<JrCard['status']>(['idea', 'discussion', 'planning'])

export class JrLifecycleStore {
  constructor(private readonly db: SyncDatabase) {}

  createCard(input: JrCreateCardInput, actor: JrControllerActor): string {
    requireJrController(actor)
    const title = input.title.trim()
    const description = input.description?.trim() || JR_PLACEHOLDER_DESCRIPTION
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
      `# ${title}\n\n${description}\n`,
      actor
    )
    recordJrEvent(this.db, id, '卡片已创建', '想法已记录，尚未授权 AI 讨论或执行。', actor)
    return id
  }

  transition(card: JrCard, transition: JrCardTransition, actor: JrActor): void {
    requireJrActor(actor)
    if (transition === 'begin-discussion') {
      requireJrCardState(card, 'idea', '开始讨论')
      requireJrAiConfiguration(card)
      setJrCardStatus(this.db, card.id, 'discussion')
      upsertJrArtifact(
        this.db,
        card.id,
        jrTaskArtifactPath(card.id, 'discussion.md'),
        `# Discussion\n\nHarness: ${card.harness}\nModel: ${card.model?.label}\n\nCapture decisions using JR-backed artifacts before planning.\n`,
        actor
      )
      recordJrEvent(
        this.db,
        card.id,
        '讨论已开始',
        '已绑定卡片的 harness 与模型；该阶段不授权代码写入。',
        actor
      )
      return
    }
    if (transition === 'begin-planning') {
      requireJrCardState(card, 'discussion', '进入规划')
      requireJrAiConfiguration(card)
      setJrCardStatus(this.db, card.id, 'planning')
      this.seedAcceptanceFromDescription(card, actor)
      const plannedCard = getJrCard(this.db, card.id)
      for (const artifact of buildJrPlanningArtifacts(plannedCard)) {
        upsertJrArtifact(this.db, card.id, artifact.path, artifact.content, actor)
      }
      recordJrEvent(
        this.db,
        card.id,
        '规划已开始',
        'Trellis PRD、设计和实施计划已存入 JR 数据库。',
        actor
      )
      return
    }
    requireJrController(actor)
    requireJrCardState(card, 'planning', '提交执行审批')
    this.assertReadyForExecution(card)
    setJrCardStatus(this.db, card.id, 'pending_execution_approval')
    recordJrEvent(
      this.db,
      card.id,
      '等待执行审批',
      '控制器已冻结计划。只有明确批准才能创建 Orca worktree。Harness 与模型此后不可变。',
      actor
    )
  }

  updateDetails(card: JrCard, input: JrUpdateCardDetailsInput, actor: JrControllerActor): void {
    requireJrController(actor)
    if (!CONFIGURABLE.has(card.status)) {
      throw new Error('执行批准后不能修改问题、验收标准或优先级。')
    }
    const description = input.description?.trim()
    const acceptance = input.acceptance?.trim()
    const priority = input.priority
    if (description !== undefined) {
      if (description.length > 2_000) {
        throw new Error('JR 卡片说明不能超过 2000 个字符。')
      }
      this.db
        .prepare('UPDATE jr_cards SET description = ?, updated_at = ? WHERE id = ?')
        .run(description, jrNow(), card.id)
      recordJrEvent(this.db, card.id, '问题与结果已更新', description.slice(0, 120), actor)
    }
    if (acceptance !== undefined) {
      if (acceptance.length > 2_000) {
        throw new Error('JR 验收标准不能超过 2000 个字符。')
      }
      this.db
        .prepare('UPDATE jr_cards SET acceptance = ?, updated_at = ? WHERE id = ?')
        .run(acceptance, jrNow(), card.id)
      upsertJrArtifact(
        this.db,
        card.id,
        jrTaskArtifactPath(card.id, 'acceptance.md'),
        `# Acceptance\n\n${acceptance}\n`,
        actor
      )
      recordJrEvent(this.db, card.id, '验收标准已更新', acceptance.slice(0, 120), actor)
    }
    if (priority !== undefined) {
      if (!isJrCardPriority(priority)) {
        throw new Error('JR 优先级必须是 p0–p3。')
      }
      this.db
        .prepare('UPDATE jr_cards SET priority = ?, updated_at = ? WHERE id = ?')
        .run(priority, jrNow(), card.id)
      recordJrEvent(this.db, card.id, '优先级已更新', priority, actor)
    }
  }

  invalidatePlanIfNeeded(previous: JrCard, next: JrCard, actor: JrActor): void {
    if (previous.status !== 'planning') {
      return
    }
    const harnessChanged = previous.harness !== next.harness
    const modelChanged = previous.model?.id !== next.model?.id
    if (!harnessChanged && !modelChanged) {
      return
    }
    for (const artifact of buildJrPlanningArtifacts(next)) {
      upsertJrArtifact(this.db, next.id, artifact.path, artifact.content, actor)
    }
    recordJrEvent(
      this.db,
      next.id,
      '计划已作废',
      'Harness 或模型已变更；规划工件已重置，需重新规划。',
      actor
    )
  }

  rejectExecutionApproval(card: JrCard, actor: JrControllerActor): void {
    requireJrController(actor)
    requireJrCardState(card, 'pending_execution_approval', '退回规划')
    setJrCardStatus(this.db, card.id, 'planning')
    recordJrEvent(this.db, card.id, '执行审批已拒绝', 'Controller 将卡片退回规划中。', actor)
  }

  resumeBlocked(card: JrCard, actor: JrControllerActor): void {
    requireJrController(actor)
    requireJrCardState(card, 'blocked', '恢复')
    const fromStatus = clearJrBlocked(this.db, card.id)
    setJrCardStatus(this.db, card.id, fromStatus)
    recordJrEvent(this.db, card.id, '已从受阻恢复', `恢复至 ${fromStatus}`, actor)
  }

  assertReadyForExecution(card: JrCard): void {
    requireJrAiConfiguration(card)
    assertJrExecutionContract(card)
  }

  seedAcceptanceFromDescription(card: JrCard, actor: JrActor): void {
    if (card.acceptance.trim().length > 0) {
      return
    }
    if (card.description.trim() === JR_PLACEHOLDER_DESCRIPTION) {
      return
    }
    this.db
      .prepare('UPDATE jr_cards SET acceptance = ?, updated_at = ? WHERE id = ?')
      .run(card.description.trim(), jrNow(), card.id)
    upsertJrArtifact(
      this.db,
      card.id,
      jrTaskArtifactPath(card.id, 'acceptance.md'),
      `# Acceptance\n\n${card.description.trim()}\n`,
      actor
    )
  }

  writeTaskRecord(
    card: JrCard,
    input: { title?: string; summary?: string; acceptance?: string },
    actor: JrActor
  ): void {
    const title = input.title?.trim() || card.title
    const summary = input.summary?.trim() || card.description
    const acceptance = input.acceptance?.trim() || card.acceptance
    const content = `# ${title}\n\n## Summary\n${summary}\n\n## Acceptance\n${acceptance}\n`
    upsertJrArtifact(this.db, card.id, jrTaskArtifactPath(card.id, 'task.md'), content, actor)
    if (CONFIGURABLE.has(card.status) && input.acceptance?.trim()) {
      this.db
        .prepare('UPDATE jr_cards SET acceptance = ?, updated_at = ? WHERE id = ?')
        .run(input.acceptance.trim(), jrNow(), card.id)
    }
  }
}
