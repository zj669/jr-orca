import { JrStore } from './jr-store'
import { handleJrMcpMessage } from './jr-mcp-protocol'
import { readJrMcpSessionFromEnv } from './jr-mcp-session'
import { encodeJrMcpMessage, JrMcpStdioBuffer } from './jr-mcp-stdio-framing'
import { JrTrellisToolHost } from './jr-trellis-tools'

export function startJrMcpStdioFromEnv(
  env: NodeJS.Dict<string> = process.env,
  stdin: NodeJS.ReadableStream = process.stdin,
  stdout: NodeJS.WritableStream = process.stdout
): JrStore {
  const session = readJrMcpSessionFromEnv(env)
  const store = new JrStore(session.databasePath)
  const host = new JrTrellisToolHost(store, { cardId: session.cardId, actor: session.actor })
  const buffer = new JrMcpStdioBuffer()
  stdin.on('data', (chunk: string | Buffer) => {
    const payload = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
    for (const message of buffer.push(payload)) {
      const response = handleJrMcpMessage(host, message)
      if (response !== null) {
        stdout.write(encodeJrMcpMessage(response))
      }
    }
  })
  const close = (): void => {
    store.close()
  }
  stdin.on('end', close)
  stdin.on('close', close)
  return store
}
