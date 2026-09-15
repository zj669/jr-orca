import { getJrDatabasePath } from './jr-store-access'
import { getJrMcpStdioPath } from './jr-mcp-stdio-path'
import { seedJrTrellisSessionFiles } from './jr-trellis-session-files'
import type { JrCard } from '../../shared/jr/jr-types'

export function seedJrTrellisHarnessSession(card: JrCard, worktreePath: string): string[] {
  return seedJrTrellisSessionFiles({
    worktreePath,
    cardId: card.id,
    mcp: {
      command: process.execPath,
      args: [getJrMcpStdioPath()],
      env: {
        ELECTRON_RUN_AS_NODE: '1',
        JR_DB_PATH: getJrDatabasePath(),
        JR_CARD_ID: card.id,
        JR_ACTOR_KIND: 'task-agent',
        JR_ACTOR_ID: `${card.harness ?? 'task'}:${card.id}`
      }
    }
  })
}
