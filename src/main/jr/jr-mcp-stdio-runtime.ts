import { existsSync, statSync } from 'node:fs'
import { JrStore } from './jr-store'
import { handleJrMcpMessage } from './jr-mcp-protocol'
import { readJrMcpSessionFromEnv } from './jr-mcp-session'
import { encodeJrMcpMessage, JrMcpStdioBuffer } from './jr-mcp-stdio-framing'
import { createLocalJrProjectionWriter } from './jr-trellis-projection-fs'
import { JrTrellisToolHost } from './jr-trellis-tools'

export function startJrMcpStdioFromEnv(
  env: NodeJS.Dict<string> = process.env,
  stdin: NodeJS.ReadableStream = process.stdin,
  stdout: NodeJS.WritableStream = process.stdout
): JrStore {
  const session = readJrMcpSessionFromEnv(env)
  const store = new JrStore(session.databasePath)
  const worktreePath = env.JR_WORKTREE_PATH?.trim()
  const projection =
    worktreePath && isLocalDirectory(worktreePath)
      ? createLocalJrProjectionWriter(worktreePath)
      : undefined
  const host = new JrTrellisToolHost(store, {
    cardId: session.cardId,
    actor: session.actor,
    projection
  })
  const buffer = new JrMcpStdioBuffer()
  stdin.on('data', (chunk: string | Buffer) => {
    const payload = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
    for (const message of buffer.push(payload)) {
      void handleJrMcpMessage(host, message).then((response) => {
        if (response !== null) {
          stdout.write(encodeJrMcpMessage(response))
        }
      })
    }
  })
  const close = (): void => {
    store.close()
  }
  stdin.on('end', close)
  stdin.on('close', close)
  return store
}

function isLocalDirectory(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isDirectory()
  } catch {
    return false
  }
}
