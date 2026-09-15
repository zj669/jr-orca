import { dirname } from 'node:path'
import { getJrDatabasePath } from './jr-store-access'
import { getJrMcpStdioPath } from './jr-mcp-stdio-path'
import { requireSshFilesystemProvider } from '../providers/ssh-filesystem-dispatch'
import {
  createRemoteSessionWriter,
  seedJrRemoteMcpBridge,
  seedJrTrellisSessionFiles
} from './jr-trellis-session-files'
import type { JrCard } from '../../shared/jr/jr-types'

export async function seedJrTrellisHarnessSession(
  card: JrCard,
  worktreePath: string,
  options?: { connectionId?: string | null; posixRemote?: boolean }
): Promise<string[]> {
  const actorId = `${card.harness ?? 'task'}:${card.id}`
  const databasePath = getJrDatabasePath()
  const sharedEnv = {
    JR_DB_PATH: databasePath,
    JR_CARD_ID: card.id,
    JR_WORKTREE_PATH: worktreePath,
    JR_ACTOR_KIND: 'task-agent',
    JR_ACTOR_ID: actorId,
    ORCA_USER_DATA_PATH: dirname(dirname(databasePath))
  }
  if (!options?.connectionId) {
    return seedJrTrellisSessionFiles({
      worktreePath,
      cardId: card.id,
      mcp: {
        command: process.execPath,
        args: [getJrMcpStdioPath()],
        env: {
          ELECTRON_RUN_AS_NODE: '1',
          ...sharedEnv
        }
      }
    })
  }
  const provider = requireSshFilesystemProvider(options.connectionId)
  const posixRemote = options?.posixRemote ?? !worktreePath.includes('\\')
  const writer = createRemoteSessionWriter(worktreePath, posixRemote, {
    writeFile: (absolutePath, content) => provider.writeFile(absolutePath, content),
    readFile: async (absolutePath) => {
      try {
        const file = await provider.readFile(absolutePath)
        return file.content
      } catch {
        return null
      }
    }
  })
  const relativeBridge = await seedJrRemoteMcpBridge(writer)
  const bridgePath = writer.join(relativeBridge)
  const written = await seedJrTrellisSessionFiles({
    worktreePath,
    cardId: card.id,
    writer,
    mcp: {
      command: posixRemote ? 'sh' : 'cmd.exe',
      args: posixRemote
        ? ['-c', 'exec "${ORCA_RELAY_NODE_PATH:-node}" "$JR_MCP_BRIDGE_PATH"']
        : ['/c', '"%ORCA_RELAY_NODE_PATH%" "%JR_MCP_BRIDGE_PATH%"'],
      env: {
        ...sharedEnv,
        JR_MCP_BRIDGE_PATH: bridgePath
      }
    }
  })
  return [...written, relativeBridge]
}
