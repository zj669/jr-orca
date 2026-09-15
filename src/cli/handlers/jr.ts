import { join } from 'node:path'
import { existsSync, statSync } from 'node:fs'
import type { CommandHandler } from '../dispatch'
import { getOptionalStringFlag, getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { getDefaultUserDataPath } from '../runtime-client'
import { rejectRemoteSelectionFlags } from '../remote-selection-flag-rejection'
import { JR_TRELLIS_TOOL_NAMES } from '../../main/jr/jr-trellis-tool-catalog'
import { JrStore } from '../../main/jr/jr-store'
import { JrTrellisToolHost } from '../../main/jr/jr-trellis-tools'
import { createLocalJrProjectionWriter } from '../../main/jr/jr-trellis-projection-fs'
import { startJrMcpStdioFromEnv } from '../../main/jr/jr-mcp-stdio-runtime'

const REMOTE_SELECTION_SUFFIX =
  '`jr` commands. They always run against this desktop JR SQLite database.'

export const JR_HANDLERS: Record<string, CommandHandler> = {
  'jr mcp': async ({ flags }) => {
    rejectRemoteSelectionFlags(flags, REMOTE_SELECTION_SUFFIX)
    const env = {
      ...process.env,
      JR_DB_PATH: process.env.JR_DB_PATH?.trim() || defaultJrDatabasePath()
    }
    startJrMcpStdioFromEnv(env)
    await new Promise<void>((resolve) => {
      const finish = (): void => resolve()
      process.stdin.once('end', finish)
      process.stdin.once('close', finish)
    })
  },
  'jr call': async ({ flags, json }) => {
    rejectRemoteSelectionFlags(flags, REMOTE_SELECTION_SUFFIX)
    const tool = getRequiredStringFlag(flags, 'tool')
    const rawArgs = getOptionalStringFlag(flags, 'args') ?? '{}'
    const args = parseArgsJson(rawArgs)
    const databasePath = process.env.JR_DB_PATH?.trim() || defaultJrDatabasePath()
    const cardId = requireEnv(process.env.JR_CARD_ID, 'JR_CARD_ID')
    const store = new JrStore(databasePath)
    try {
      const worktreePath = process.env.JR_WORKTREE_PATH?.trim()
      const host = new JrTrellisToolHost(store, {
        cardId,
        actor: {
          kind: 'task-agent',
          id: process.env.JR_ACTOR_ID?.trim() || `task-agent:${cardId}`
        },
        projection:
          worktreePath && isLocalDirectory(worktreePath)
            ? createLocalJrProjectionWriter(worktreePath)
            : undefined
      })
      const result = await host.call(tool, args)
      printResult(result, json, () => JSON.stringify(result, null, 2))
    } finally {
      store.close()
    }
  },
  'jr tools': async ({ flags, json }) => {
    rejectRemoteSelectionFlags(flags, REMOTE_SELECTION_SUFFIX)
    printResult({ tools: [...JR_TRELLIS_TOOL_NAMES] }, json, () => JR_TRELLIS_TOOL_NAMES.join('\n'))
  }
}

function defaultJrDatabasePath(): string {
  return join(getDefaultUserDataPath(), 'jr', 'jr.sqlite')
}

function parseArgsJson(raw: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(raw)
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('JR --args must be a JSON object.')
  }
  return parsed
}

function requireEnv(value: string | undefined, name: string): string {
  const normalized = value?.trim()
  if (!normalized) {
    throw new Error(`${name} is required for orca jr call.`)
  }
  return normalized
}

function isLocalDirectory(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isDirectory()
  } catch {
    return false
  }
}
