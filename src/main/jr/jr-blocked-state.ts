import type SyncDatabase from '../sqlite/sync-database'
import type { JrActor, JrCard, JrCardStatus } from '../../shared/jr/jr-types'
import { jrNow, recordJrEvent, setJrCardStatus } from './jr-card-records'

const RESUMABLE: readonly JrCardStatus[] = [
  'idea',
  'discussion',
  'planning',
  'pending_execution_approval',
  'creating_worktree',
  'executing',
  'verifying',
  'pending_merge_approval',
  'shipping'
]

export function persistJrBlocked(
  db: SyncDatabase,
  card: JrCard,
  reason: string,
  actor: JrActor,
  kind: string
): void {
  const detail = reason.trim()
  if (detail.length === 0) {
    throw new Error('请先为卡片设置 受阻原因。')
  }
  const fromStatus =
    card.status === 'blocked' ? (card.blocked?.fromStatus ?? 'planning') : card.status
  db.prepare(
    `UPDATE jr_cards
     SET blocked_from_status = ?, blocked_reason = ?, blocked_owner = ?, updated_at = ?
     WHERE id = ?`
  ).run(fromStatus, detail, `${actor.kind}:${actor.id}`, jrNow(), card.id)
  setJrCardStatus(db, card.id, 'blocked')
  recordJrEvent(db, card.id, kind, `${detail} · 可恢复至 ${fromStatus}`, actor)
}

export function clearJrBlocked(db: SyncDatabase, cardId: string): JrCardStatus {
  const row: unknown = db
    .prepare('SELECT blocked_from_status FROM jr_cards WHERE id = ?')
    .get(cardId)
  const fromStatus = isBlockedFromRow(row) ? readResumableStatus(row.blocked_from_status) : null
  if (!fromStatus) {
    throw new Error('受阻卡片缺少可恢复的先前状态。')
  }
  db.prepare(
    `UPDATE jr_cards
     SET blocked_from_status = NULL, blocked_reason = NULL, blocked_owner = NULL, updated_at = ?
     WHERE id = ?`
  ).run(jrNow(), cardId)
  return fromStatus
}

function isBlockedFromRow(value: unknown): value is { blocked_from_status: unknown } {
  return value !== null && typeof value === 'object' && 'blocked_from_status' in value
}

export function isJrResumableStatus(value: string): value is JrCardStatus {
  return RESUMABLE.some((status) => status === value)
}

function readResumableStatus(value: unknown): JrCardStatus | null {
  return typeof value === 'string' && isJrResumableStatus(value) ? value : null
}
