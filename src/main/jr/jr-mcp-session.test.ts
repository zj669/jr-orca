import type { JrTaskAgentActor } from '../../shared/jr/jr-actors'
import { describe, expect, it } from 'vitest'
import { readJrMcpSessionFromEnv } from './jr-mcp-session'

describe('readJrMcpSessionFromEnv', () => {
  it('always binds the stdio server as a task agent even if env claims controller', () => {
    const session = readJrMcpSessionFromEnv({
      JR_DB_PATH: '/tmp/jr.sqlite',
      JR_CARD_ID: 'card-1',
      JR_ACTOR_KIND: 'human-controller',
      JR_ACTOR_ID: 'walker'
    })
    const actor: JrTaskAgentActor = session.actor
    expect(actor).toEqual({ kind: 'task-agent', id: 'walker' })
    expect(session.cardId).toBe('card-1')
  })
})
