import { randomUUID } from 'node:crypto'
import type SyncDatabase from '../sqlite/sync-database'
import {
  isJrCardPriority,
  isJrDeliveryRecord,
  isJrHarness,
  isJrReviewSnapshot,
  type JrActor,
  type JrArtifact,
  type JrCard,
  type JrModelChoice
} from '../../shared/jr/jr-types'
import {
  optionalJrDatabaseString,
  requireJrDatabaseCardStatus,
  requireJrDatabaseInteger,
  requireJrDatabaseRow,
  requireJrDatabaseString,
  type JrDatabaseRow
} from './jr-database-records'
import { listJrCardArtifacts, listJrCardEvents } from './jr-card-history-reader'
import { isJrResumableStatus } from './jr-blocked-state'

export function jrNow(): string {
  return new Date().toISOString()
}

export const JR_CARD_SELECT_COLUMNS = `id, title, description, acceptance, priority, status, harness, model_id, model_label,
                review_harness, review_model_id, review_model_label,
                repository_id, base_ref, setup_decision, worktree_id, worktree_path, worktree_branch,
                worktree_phase, agent_type, agent_tab_id, agent_pane_key, agent_pty_id, agent_status,
                review_json, delivery_json, blocked_from_status, blocked_reason, blocked_owner,
                created_at, updated_at`

export function getJrCard(db: SyncDatabase, cardId: string): JrCard {
  const row = db.prepare(`SELECT ${JR_CARD_SELECT_COLUMNS} FROM jr_cards WHERE id = ?`).get(cardId)
  if (row === undefined) {
    throw new Error('未找到 JR 卡片。')
  }
  return readJrCard(db, requireJrDatabaseRow(row, 'JR card row is invalid.'))
}

export function readJrCard(db: SyncDatabase, row: JrDatabaseRow): JrCard {
  const id = requireJrDatabaseString(row, 'id')
  const blockedFrom = optionalJrDatabaseString(row, 'blocked_from_status')
  const blockedReason = optionalJrDatabaseString(row, 'blocked_reason')
  const blockedOwner = optionalJrDatabaseString(row, 'blocked_owner')
  const priorityValue = optionalJrDatabaseString(row, 'priority')
  const harnessValue = optionalJrDatabaseString(row, 'harness')
  const modelId = optionalJrDatabaseString(row, 'model_id')
  const modelLabel = optionalJrDatabaseString(row, 'model_label')
  const reviewHarnessValue = optionalJrDatabaseString(row, 'review_harness')
  const reviewModelId = optionalJrDatabaseString(row, 'review_model_id')
  const reviewModelLabel = optionalJrDatabaseString(row, 'review_model_label')
  const model = readJrModelChoice(modelId, modelLabel)
  const reviewModel = readJrModelChoice(reviewModelId, reviewModelLabel)
  const worktreeId = optionalJrDatabaseString(row, 'worktree_id')
  const worktreePath = optionalJrDatabaseString(row, 'worktree_path')
  const worktreeBranch = optionalJrDatabaseString(row, 'worktree_branch')
  const agent = optionalJrDatabaseString(row, 'agent_type')
  const agentTabId = optionalJrDatabaseString(row, 'agent_tab_id')
  const agentPaneKey = optionalJrDatabaseString(row, 'agent_pane_key')
  const agentPtyId = optionalJrDatabaseString(row, 'agent_pty_id')
  const agentStatus = optionalJrDatabaseString(row, 'agent_status')
  return {
    id,
    title: requireJrDatabaseString(row, 'title'),
    description: requireJrDatabaseString(row, 'description'),
    acceptance: optionalJrDatabaseString(row, 'acceptance') ?? '',
    priority: priorityValue && isJrCardPriority(priorityValue) ? priorityValue : null,
    status: requireJrDatabaseCardStatus(row),
    harness: harnessValue && isJrHarness(harnessValue) ? harnessValue : null,
    model,
    reviewHarness:
      reviewHarnessValue && isJrHarness(reviewHarnessValue) ? reviewHarnessValue : null,
    reviewModel,
    execution: {
      repositoryId: optionalJrDatabaseString(row, 'repository_id'),
      baseRef: optionalJrDatabaseString(row, 'base_ref'),
      setupDecision: readSetupDecision(optionalJrDatabaseString(row, 'setup_decision')),
      worktree:
        worktreeId && worktreePath && worktreeBranch
          ? { id: worktreeId, path: worktreePath, branch: worktreeBranch }
          : null,
      worktreePhase: readWorktreePhase(optionalJrDatabaseString(row, 'worktree_phase')),
      agentSession:
        isJrExecutionAgent(agent) &&
        agentTabId &&
        agentPaneKey &&
        agentPtyId &&
        isJrAgentLifecycleState(agentStatus)
          ? {
              agent,
              tabId: agentTabId,
              paneKey: agentPaneKey,
              ptyId: agentPtyId,
              status: agentStatus
            }
          : null
    },
    review: readJrJson(optionalJrDatabaseString(row, 'review_json'), isJrReviewSnapshot),
    delivery: readJrJson(optionalJrDatabaseString(row, 'delivery_json'), isJrDeliveryRecord),
    blocked:
      blockedFrom && blockedReason && blockedOwner
        ? {
            fromStatus: isJrResumableStatus(blockedFrom) ? blockedFrom : 'planning',
            reason: blockedReason,
            owner: blockedOwner
          }
        : null,
    createdAt: requireJrDatabaseString(row, 'created_at'),
    updatedAt: requireJrDatabaseString(row, 'updated_at'),
    artifacts: listJrCardArtifacts(db, id),
    events: listJrCardEvents(db, id)
  }
}

function readJrModelChoice(
  modelId: string | null,
  modelLabel: string | null
): JrModelChoice | null {
  return modelId && modelLabel
    ? { id: modelId, label: modelLabel, capabilitySource: 'orca-session-catalog' }
    : null
}

export function upsertJrArtifact(
  db: SyncDatabase,
  cardId: string,
  path: string,
  content: string,
  actor: JrActor
): JrArtifact {
  const timestamp = jrNow()
  const existing = db
    .prepare('SELECT id, version FROM jr_artifacts WHERE card_id = ? AND path = ?')
    .get(cardId, path)
  const current =
    existing === undefined ? null : requireJrDatabaseRow(existing, 'JR artifact row is invalid.')
  const version = current ? requireJrDatabaseInteger(current, 'version') + 1 : 1
  const artifactId = current ? requireJrDatabaseString(current, 'id') : randomUUID()
  if (current) {
    db.prepare('UPDATE jr_artifacts SET content = ?, version = ?, updated_at = ? WHERE id = ?').run(
      content,
      version,
      timestamp,
      artifactId
    )
  } else {
    db.prepare(
      `INSERT INTO jr_artifacts (id, card_id, path, content, version, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
    ).run(artifactId, cardId, path, content, version, timestamp)
  }
  db.prepare(
    `INSERT INTO jr_artifact_revisions (
       id, artifact_id, card_id, path, version, content, actor, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    randomUUID(),
    artifactId,
    cardId,
    path,
    version,
    content,
    `${actor.kind}:${actor.id}`,
    timestamp
  )
  recordJrEvent(db, cardId, 'artifact.upserted', `${path} v${version}`, actor)
  return {
    id: artifactId,
    cardId,
    path,
    content,
    version,
    updatedAt: timestamp
  }
}

export function recordJrEvent(
  db: SyncDatabase,
  cardId: string,
  kind: string,
  detail: string,
  actor: JrActor
): void {
  db.prepare(
    `INSERT INTO jr_events (id, card_id, kind, detail, actor, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
  ).run(randomUUID(), cardId, kind, detail, `${actor.kind}:${actor.id}`, jrNow())
}

export function setJrCardStatus(db: SyncDatabase, cardId: string, status: JrCard['status']): void {
  db.prepare('UPDATE jr_cards SET status = ?, updated_at = ? WHERE id = ?').run(
    status,
    jrNow(),
    cardId
  )
}

function readSetupDecision(value: string | null): JrCard['execution']['setupDecision'] {
  return value === 'run' || value === 'skip' ? value : 'inherit'
}

function readWorktreePhase(value: string | null): JrCard['execution']['worktreePhase'] {
  return value === 'fetching' || value === 'creating' ? value : null
}

function isJrExecutionAgent(
  value: string | null
): value is NonNullable<JrCard['execution']['agentSession']>['agent'] {
  return value === 'cursor' || value === 'claude' || value === 'codex' || value === 'gemini'
}

function isJrAgentLifecycleState(
  value: string | null
): value is NonNullable<JrCard['execution']['agentSession']>['status'] {
  return (
    value === null ||
    value === 'working' ||
    value === 'blocked' ||
    value === 'waiting' ||
    value === 'done'
  )
}

function readJrJson<T>(value: string | null, guard: (parsed: unknown) => parsed is T): T | null {
  if (!value) {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(value)
    return guard(parsed) ? parsed : null
  } catch {
    return null
  }
}
