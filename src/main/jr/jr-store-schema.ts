import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import SyncDatabase from '../sqlite/sync-database'
import { optionalJrDatabaseString, requireJrDatabaseRow } from './jr-database-records'

export function openJrSqlite(databasePath: string): SyncDatabase {
  mkdirSync(dirname(databasePath), { recursive: true })
  const db = new SyncDatabase(databasePath)
  db.exec(`
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
        review_harness TEXT,
        review_model_id TEXT,
        review_model_label TEXT,
        repository_id TEXT,
        base_ref TEXT,
        setup_decision TEXT NOT NULL DEFAULT 'inherit',
        worktree_id TEXT,
        worktree_path TEXT,
        worktree_branch TEXT,
        worktree_phase TEXT,
        agent_type TEXT,
        agent_tab_id TEXT,
        agent_pane_key TEXT,
        agent_pty_id TEXT,
        agent_status TEXT,
        acceptance TEXT NOT NULL DEFAULT '',
        priority TEXT,
        blocked_from_status TEXT,
        blocked_reason TEXT,
        blocked_owner TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS jr_artifacts (
        id TEXT PRIMARY KEY,
        card_id TEXT NOT NULL REFERENCES jr_cards(id) ON DELETE CASCADE,
        path TEXT NOT NULL,
        content TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL,
        UNIQUE(card_id, path)
      );

      CREATE TABLE IF NOT EXISTS jr_artifact_revisions (
        id TEXT PRIMARY KEY,
        artifact_id TEXT NOT NULL,
        card_id TEXT NOT NULL REFERENCES jr_cards(id) ON DELETE CASCADE,
        path TEXT NOT NULL,
        version INTEGER NOT NULL,
        content TEXT NOT NULL,
        actor TEXT NOT NULL,
        created_at TEXT NOT NULL
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
  ensureJrArtifactRevisionSchema(db)
  ensureJrCardContractSchema(db)
  return db
}

export function ensureJrArtifactRevisionSchema(db: SyncDatabase): void {
  const columns = new Set(
    db
      .prepare('PRAGMA table_info(jr_artifacts)')
      .all()
      .map(
        (row) =>
          optionalJrDatabaseString(requireJrDatabaseRow(row, 'JR schema is invalid.'), 'name') ?? ''
      )
  )
  if (!columns.has('version')) {
    db.exec('ALTER TABLE jr_artifacts ADD COLUMN version INTEGER NOT NULL DEFAULT 1')
  }
}

const CARD_CONTRACT_COLUMNS = [
  { name: 'acceptance', definition: "TEXT NOT NULL DEFAULT ''" },
  { name: 'priority', definition: 'TEXT' },
  { name: 'blocked_from_status', definition: 'TEXT' },
  { name: 'blocked_reason', definition: 'TEXT' },
  { name: 'blocked_owner', definition: 'TEXT' },
  { name: 'review_harness', definition: 'TEXT' },
  { name: 'review_model_id', definition: 'TEXT' },
  { name: 'review_model_label', definition: 'TEXT' }
] as const

export function ensureJrCardContractSchema(db: SyncDatabase): void {
  const columns = new Set(
    db
      .prepare('PRAGMA table_info(jr_cards)')
      .all()
      .map(
        (row) =>
          optionalJrDatabaseString(requireJrDatabaseRow(row, 'JR schema is invalid.'), 'name') ?? ''
      )
  )
  for (const column of CARD_CONTRACT_COLUMNS) {
    if (!columns.has(column.name)) {
      db.exec(`ALTER TABLE jr_cards ADD COLUMN ${column.name} ${column.definition}`)
    }
  }
}
