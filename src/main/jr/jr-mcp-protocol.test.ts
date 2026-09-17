import { describe, expect, it } from 'vitest'
import type { JrCard } from '../../shared/jr/jr-types'
import { handleJrMcpMessage } from './jr-mcp-protocol'
import { encodeJrMcpMessage, JrMcpStdioBuffer } from './jr-mcp-stdio-framing'
import { JR_TRELLIS_TOOL_NAMES } from './jr-trellis-tool-catalog'
import { JrTrellisToolHost } from './jr-trellis-tools'

const card = {
  id: 'card-1',
  title: 'MCP card',
  description: 'Read via tools',
  acceptance: 'Tools return SQLite-backed payloads.',
  priority: 'p2',
  status: 'planning',
  harness: 'claude',
  model: { id: 'sonnet', label: 'Sonnet', capabilitySource: 'orca-session-catalog' },
  execution: {
    repositoryId: 'repo-1',
    baseRef: 'main',
    setupDecision: 'skip',
    worktree: null,
    worktreePhase: null,
    agentSession: null
  },
  review: null,
  delivery: null,
  blocked: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  artifacts: [
    {
      id: 'a1',
      cardId: 'card-1',
      path: 'workflow.md',
      content: '# workflow',
      version: 1,
      updatedAt: '2026-01-01T00:00:00.000Z'
    }
  ],
  events: []
} satisfies JrCard

function host(): JrTrellisToolHost {
  return new JrTrellisToolHost(
    {
      readCard: () => card,
      transition: () => card,
      writeArtifact: () => card,
      writeTaskRecord: () => card,
      recordEvent: () => card
    },
    { cardId: 'card-1', actor: { kind: 'task-agent', id: 'worker' } }
  )
}

describe('JR MCP protocol', () => {
  it('lists Trellis tools and returns JSON payloads from tools/call', async () => {
    expect(
      await handleJrMcpMessage(host(), { jsonrpc: '2.0', id: 1, method: 'tools/list' })
    ).toEqual({
      jsonrpc: '2.0',
      id: 1,
      result: {
        tools: JR_TRELLIS_TOOL_NAMES.map((name) => expect.objectContaining({ name }))
      }
    })
    expect(
      await handleJrMcpMessage(host(), {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'jr_workflow_get', arguments: {} }
      })
    ).toEqual({
      jsonrpc: '2.0',
      id: 2,
      result: {
        content: [{ type: 'text', text: expect.stringContaining('jr-sqlite') }]
      }
    })
  })

  it('returns a tool error when a task agent asks for execution approval', async () => {
    expect(
      await handleJrMcpMessage(host(), {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'jr_card_request_transition',
          arguments: { transition: 'request-execution-approval' }
        }
      })
    ).toEqual({
      jsonrpc: '2.0',
      id: 3,
      result: {
        isError: true,
        content: [{ type: 'text', text: expect.stringContaining('待批准执行') }]
      }
    })
  })

  it('frames JSON-RPC messages as newline-delimited JSON', () => {
    const message = { jsonrpc: '2.0', id: 1, result: { ok: true } }
    const encoded = encodeJrMcpMessage(message)
    expect(encoded.toString('utf8')).toBe(`${JSON.stringify(message)}\n`)
    expect(new JrMcpStdioBuffer().push(encoded)).toEqual([
      { jsonrpc: '2.0', id: 1, result: { ok: true } }
    ])
  })

  it('accepts legacy Content-Length framed input', () => {
    const message = JSON.stringify({ jsonrpc: '2.0', id: 1, result: { ok: true } })
    const encoded = Buffer.from(
      `Content-Length: ${Buffer.byteLength(message, 'utf8')}\r\n\r\n${message}`
    )
    expect(new JrMcpStdioBuffer().push(encoded)).toEqual([
      { jsonrpc: '2.0', id: 1, result: { ok: true } }
    ])
  })
})
