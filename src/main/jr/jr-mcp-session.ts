import type { JrTaskAgentActor } from '../../shared/jr/jr-actors'

export type JrMcpSession = {
  databasePath: string
  cardId: string
  actor: JrTaskAgentActor
}

export function readJrMcpSessionFromEnv(env: NodeJS.Dict<string>): JrMcpSession {
  const databasePath = requireEnv(env.JR_DB_PATH, 'JR_DB_PATH')
  const cardId = requireEnv(env.JR_CARD_ID, 'JR_CARD_ID')
  const actorId = env.JR_ACTOR_ID?.trim() || `task-agent:${cardId}`
  return {
    databasePath,
    cardId,
    actor: { kind: 'task-agent', id: actorId }
  }
}

function requireEnv(value: string | undefined, name: string): string {
  const normalized = value?.trim()
  if (!normalized) {
    throw new Error(`${name} is required for the JR Trellis MCP server.`)
  }
  return normalized
}
