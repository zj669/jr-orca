import type SyncDatabase from '../sqlite/sync-database'
import { jrHarnessAgent } from '../../shared/jr/jr-harness-agent'
import type {
  JrAgentLifecycleState,
  JrCard,
  JrControllerActor,
  JrExecutionLaunchRequest,
  JrExecutionRelaunchRequest,
  JrRecordAgentSessionInput,
  JrRecordWorktreeInput,
  JrUpdateExecutionTargetInput
} from '../../shared/jr/jr-types'
import { requireJrAiConfiguration, requireJrCardState } from './jr-card-transition-guards'
import { jrTaskArtifactPath, buildJrExecutionPrompt } from './jr-trellis-artifact-templates'
import { jrNow, recordJrEvent, setJrCardStatus } from './jr-card-records'
import { persistJrBlocked } from './jr-blocked-state'
import { optionalJrDatabaseString, requireJrDatabaseRow } from './jr-database-records'

const TARGET_CONFIGURABLE_STATUSES = new Set<JrCard['status']>(['idea', 'discussion', 'planning'])

export class JrExecutionStore {
  constructor(private readonly db: SyncDatabase) {
    this.ensureSchema()
  }

  updateTarget(card: JrCard, input: JrUpdateExecutionTargetInput, actor: JrControllerActor): void {
    if (!TARGET_CONFIGURABLE_STATUSES.has(card.status)) {
      throw new Error('执行批准后不能修改仓库或基础分支；请返回规划中后重试。')
    }
    const repositoryId = requireText(input.repositoryId, '仓库')
    const baseRef = requireText(input.baseRef, '基础分支')
    if (!isSetupDecision(input.setupDecision)) {
      throw new Error('JR setup policy is invalid.')
    }
    this.db
      .prepare(
        `UPDATE jr_cards
         SET repository_id = ?, base_ref = ?, setup_decision = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(repositoryId, baseRef, input.setupDecision, jrNow(), card.id)
    recordJrEvent(
      this.db,
      card.id,
      '执行目标已更新',
      `仓库 ${repositoryId} · 基础分支 ${baseRef} · setup ${input.setupDecision}`,
      actor
    )
  }

  requireTarget(card: JrCard): void {
    requireText(card.execution.repositoryId, '仓库')
    requireText(card.execution.baseRef, '基础分支')
  }

  prepareLaunch(card: JrCard, actor: JrControllerActor): JrExecutionLaunchRequest {
    requireJrCardState(card, 'pending_execution_approval', '批准执行')
    requireJrAiConfiguration(card)
    this.requireTarget(card)
    const repositoryId = card.execution.repositoryId
    const baseRef = card.execution.baseRef
    if (!repositoryId || !baseRef) {
      throw new Error('JR 执行目标未配置。')
    }
    requireJrExecutionArtifact(card, 'prd.md')
    requireJrExecutionArtifact(card, 'implement.md')
    if (!card.model) {
      throw new Error('JR harness 模型未配置。')
    }
    if (!card.harness) {
      throw new Error('JR harness 未配置。')
    }
    setJrCardStatus(this.db, card.id, 'creating_worktree')
    this.db
      .prepare('UPDATE jr_cards SET worktree_phase = ?, updated_at = ? WHERE id = ?')
      .run('creating', jrNow(), card.id)
    recordJrEvent(
      this.db,
      card.id,
      '执行已获批准',
      'Controller 已批准执行；正在通过 Orca 创建 worktree。',
      actor
    )
    return {
      cardId: card.id,
      title: card.title,
      harness: card.harness,
      model: card.model,
      execution: {
        repositoryId,
        baseRef,
        setupDecision: card.execution.setupDecision
      },
      prompt: buildJrExecutionPrompt(card)
    }
  }

  prepareRelaunch(card: JrCard): JrExecutionRelaunchRequest {
    requireJrCardState(card, 'executing', '重新启动执行 AI')
    requireJrAiConfiguration(card)
    const worktree = card.execution.worktree
    if (!worktree) {
      throw new Error('JR 返工需要保留原有 Orca worktree。')
    }
    if (!card.harness || !card.model) {
      throw new Error('JR 执行 AI 未配置。')
    }
    requireJrReviewFindings(card)
    return {
      cardId: card.id,
      title: card.title,
      harness: card.harness,
      model: card.model,
      worktree,
      prompt: buildJrExecutionPrompt(card)
    }
  }

  recordWorktreeCreated(
    card: JrCard,
    input: JrRecordWorktreeInput,
    actor: JrControllerActor
  ): void {
    requireJrCardState(card, 'creating_worktree', '记录 worktree')
    const worktreeId = requireText(input.id, 'worktree id')
    const path = requireText(input.path, 'worktree path')
    const branch = requireText(input.branch, 'worktree branch')
    this.db
      .prepare(
        `UPDATE jr_cards
         SET worktree_id = ?, worktree_path = ?, worktree_branch = ?, worktree_phase = NULL,
             updated_at = ?
         WHERE id = ?`
      )
      .run(worktreeId, path, branch, jrNow(), card.id)
    recordJrEvent(this.db, card.id, 'Orca worktree 已创建', `${branch} · ${path}`, actor)
  }

  recordWorktreeProgress(
    card: JrCard,
    phase: 'fetching' | 'creating',
    actor: JrControllerActor
  ): void {
    if (card.status !== 'creating_worktree') {
      return
    }
    this.db
      .prepare('UPDATE jr_cards SET worktree_phase = ?, updated_at = ? WHERE id = ?')
      .run(phase, jrNow(), card.id)
    recordJrEvent(this.db, card.id, 'Orca worktree 进度', phase, actor)
  }

  recordAgentStarted(
    card: JrCard,
    input: JrRecordAgentSessionInput,
    actor: JrControllerActor
  ): void {
    const relaunching = card.status === 'executing'
    if (card.status !== 'creating_worktree' && !relaunching) {
      throw new Error('JR 卡片必须处于创建工作树或执行中，才能启动执行 AI。')
    }
    const expectedAgent = card.harness ? jrHarnessAgent(card.harness) : null
    if (!expectedAgent || input.agent !== expectedAgent) {
      throw new Error('JR harness 与 Orca agent launcher 不匹配。')
    }
    this.db
      .prepare(
        `UPDATE jr_cards
         SET agent_type = ?, agent_tab_id = ?, agent_pane_key = ?, agent_pty_id = ?,
             agent_status = 'working', updated_at = ?
         WHERE id = ?`
      )
      .run(
        input.agent,
        requireText(input.tabId, 'agent tab id'),
        requireText(input.paneKey, 'agent pane key'),
        requireText(input.ptyId, 'agent pty id'),
        jrNow(),
        card.id
      )
    if (!relaunching) {
      setJrCardStatus(this.db, card.id, 'executing')
    }
    recordJrEvent(
      this.db,
      card.id,
      relaunching ? 'Orca 执行 AI 已重新启动' : 'Orca harness 已启动',
      relaunching
        ? `${input.agent} 已在原有 worktree 中重新启动，并携带审查结论。`
        : `${input.agent} 已在关联 worktree 中启动。`,
      actor
    )
  }

  recordAgentStatus(card: JrCard, status: JrAgentLifecycleState, actor: JrControllerActor): void {
    if (card.status !== 'executing') {
      return
    }
    this.db
      .prepare('UPDATE jr_cards SET agent_status = ?, updated_at = ? WHERE id = ?')
      .run(status, jrNow(), card.id)
    if (status === 'blocked') {
      persistJrBlocked(this.db, card, 'Agent lifecycle 报告 blocked。', actor, 'Harness 报告受阻')
    }
  }

  block(card: JrCard, reason: string, actor: JrControllerActor): void {
    if (card.status !== 'creating_worktree' && card.status !== 'executing') {
      return
    }
    persistJrBlocked(this.db, card, reason, actor, '执行受阻')
  }

  recordAgentExit(card: JrCard, code: number, actor: JrControllerActor): void {
    if (card.status !== 'executing') {
      return
    }
    this.db
      .prepare('UPDATE jr_cards SET agent_status = ?, updated_at = ? WHERE id = ?')
      .run('done', jrNow(), card.id)
    recordJrEvent(
      this.db,
      card.id,
      'Harness 会话已退出',
      `Agent process exited with code ${code}.`,
      actor
    )
  }

  private ensureSchema(): void {
    const columns = new Set(
      this.db
        .prepare('PRAGMA table_info(jr_cards)')
        .all()
        .map(
          (row) =>
            optionalJrDatabaseString(requireJrDatabaseRow(row, 'JR schema is invalid.'), 'name') ??
            ''
        )
    )
    for (const column of EXECUTION_COLUMNS) {
      if (!columns.has(column.name)) {
        this.db.exec(`ALTER TABLE jr_cards ADD COLUMN ${column.name} ${column.definition}`)
      }
    }
  }
}

const EXECUTION_COLUMNS = [
  { name: 'repository_id', definition: 'TEXT' },
  { name: 'base_ref', definition: 'TEXT' },
  { name: 'setup_decision', definition: "TEXT NOT NULL DEFAULT 'inherit'" },
  { name: 'worktree_id', definition: 'TEXT' },
  { name: 'worktree_path', definition: 'TEXT' },
  { name: 'worktree_branch', definition: 'TEXT' },
  { name: 'worktree_phase', definition: 'TEXT' },
  { name: 'agent_type', definition: 'TEXT' },
  { name: 'agent_tab_id', definition: 'TEXT' },
  { name: 'agent_pane_key', definition: 'TEXT' },
  { name: 'agent_pty_id', definition: 'TEXT' },
  { name: 'agent_status', definition: 'TEXT' }
] as const

function requireText(value: string | null | undefined, field: string): string {
  const normalized = value?.trim()
  if (!normalized) {
    throw new Error(`请先为卡片设置 ${field}。`)
  }
  return normalized
}

function isSetupDecision(value: unknown): value is JrCard['execution']['setupDecision'] {
  return value === 'inherit' || value === 'run' || value === 'skip'
}

function requireJrExecutionArtifact(card: JrCard, artifact: string): void {
  const path = jrTaskArtifactPath(card.id, artifact)
  if (!card.artifacts.some((candidate) => candidate.path === path)) {
    throw new Error(`JR 执行需要已保存的 ${artifact}。`)
  }
}

function requireJrReviewFindings(card: JrCard): void {
  const path = jrTaskArtifactPath(card.id, 'review.md')
  if (
    !card.artifacts.some(
      (candidate) => candidate.path === path && candidate.content.trim().length > 0
    )
  ) {
    throw new Error('JR 返工需要已保存的审查结论。')
  }
}
