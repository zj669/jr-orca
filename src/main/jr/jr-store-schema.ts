import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import SyncDatabase from '../sqlite/sync-database'

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
  return db
}
