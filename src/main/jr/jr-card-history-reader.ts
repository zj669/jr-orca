import type { JrArtifact, JrEvent } from '../../shared/jr/jr-types'
import type SyncDatabase from '../sqlite/sync-database'
import {
  requireJrDatabaseInteger,
  requireJrDatabaseRow,
  requireJrDatabaseString
} from './jr-database-records'

export function listJrCardArtifacts(db: SyncDatabase, cardId: string): JrArtifact[] {
  const rows = db
    .prepare(
      `SELECT id, card_id, path, content, version, updated_at FROM jr_artifacts
       WHERE card_id = ? ORDER BY path`
    )
    .all(cardId)
  return rows.map((value) => {
    const row = requireJrDatabaseRow(value, 'JR artifact row is invalid.')
    return {
      id: requireJrDatabaseString(row, 'id'),
      cardId: requireJrDatabaseString(row, 'card_id'),
      path: requireJrDatabaseString(row, 'path'),
      content: requireJrDatabaseString(row, 'content'),
      version: requireJrDatabaseInteger(row, 'version'),
      updatedAt: requireJrDatabaseString(row, 'updated_at')
    }
  })
}

export function listJrCardEvents(db: SyncDatabase, cardId: string): JrEvent[] {
  const rows = db
    .prepare(
      `SELECT id, card_id, kind, detail, actor, created_at FROM jr_events
       WHERE card_id = ? ORDER BY created_at DESC`
    )
    .all(cardId)
  return rows.map((value) => {
    const row = requireJrDatabaseRow(value, 'JR event row is invalid.')
    return {
      id: requireJrDatabaseString(row, 'id'),
      cardId: requireJrDatabaseString(row, 'card_id'),
      kind: requireJrDatabaseString(row, 'kind'),
      detail: requireJrDatabaseString(row, 'detail'),
      actor: requireJrDatabaseString(row, 'actor'),
      createdAt: requireJrDatabaseString(row, 'created_at')
    }
  })
}
