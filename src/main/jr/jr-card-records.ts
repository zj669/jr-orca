import { randomUUID } from 'node:crypto'
import type SyncDatabase from '../sqlite/sync-database'
import {
  isJrHarness,
  type JrCard,
  type JrControllerActor,
  type JrModelChoice
} from '../../shared/jr/jr-types'
import {
  optionalJrDatabaseString,
  requireJrDatabaseCardStatus,
  requireJrDatabaseRow,
  requireJrDatabaseString,
  type JrDatabaseRow
} from './jr-database-records'
import { listJrCardArtifacts, listJrCardEvents } from './jr-card-history-reader'

export function jrNow(): string {
  return new Date().toISOString()
}

export function getJrCard(db: SyncDatabase, cardId: string): JrCard {
  const row = db
    .prepare(
      `SELECT id, title, description, status, harness, model_id, model_label, repository_id, base_ref,
              setup_decision, worktree_id, worktree_path, worktree_branch, worktree_phase, agent_type,
              agent_tab_id, agent_pane_key, agent_pty_id, agent_status, created_at, updated_at
       FROM jr_cards WHERE id = ?`
    )
    .get(cardId)
  if (row === undefined) {
    throw new Error('未找到 JR 卡片。')
  }
  return readJrCard(db, requireJrDatabaseRow(row, 'JR card row is invalid.'))
}

export function readJrCard(db: SyncDatabase, row: JrDatabaseRow): JrCard {
  const id = requireJrDatabaseString(row, 'id')
  const harnessValue = optionalJrDatabaseString(row, 'harness')
  const modelId = optionalJrDatabaseString(row, 'model_id')
  const modelLabel = optionalJrDatabaseString(row, 'model_label')
  const model: JrModelChoice | null =
    modelId && modelLabel
      ? { id: modelId, label: modelLabel, capabilitySource: 'orca-session-catalog' }
      : null
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
    status: requireJrDatabaseCardStatus(row),
    harness: harnessValue && isJrHarness(harnessValue) ? harnessValue : null,
    model,
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
    createdAt: requireJrDatabaseString(row, 'created_at'),
    updatedAt: requireJrDatabaseString(row, 'updated_at'),
    artifacts: listJrCardArtifacts(db, id),
    events: listJrCardEvents(db, id)
  }
}

export function upsertJrArtifact(
  db: SyncDatabase,
  cardId: string,
  path: string,
  content: string
): void {
  db.prepare(
    `INSERT INTO jr_artifacts (id, card_id, path, content, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(card_id, path) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`
  ).run(randomUUID(), cardId, path, content, jrNow())
}

export function recordJrEvent(
  db: SyncDatabase,
  cardId: string,
  kind: string,
  detail: string,
  actor: JrControllerActor
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
