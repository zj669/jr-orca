import { JR_TRELLIS_TOOL_DEFINITIONS } from './jr-trellis-tool-catalog'
import type { JrTrellisToolHost } from './jr-trellis-tools'

const PROTOCOL_VERSION = '2024-11-05'

export type JrMcpRequest = {
  jsonrpc: '2.0'
  id?: string | number | null
  method?: string
  params?: unknown
}

export async function handleJrMcpMessage(
  host: JrTrellisToolHost,
  raw: unknown
): Promise<unknown | null> {
  if (!isRecord(raw) || raw.jsonrpc !== '2.0' || typeof raw.method !== 'string') {
    return jsonRpcError(null, -32600, 'Invalid JSON-RPC request.')
  }
  const id = 'id' in raw ? raw.id : undefined
  const method = raw.method
  if (id === undefined) {
    return null
  }
  try {
    return { jsonrpc: '2.0', id, result: await dispatch(host, method, raw.params) }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'JR MCP call failed.'
    if (method === 'tools/call') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: message }],
          isError: true
        }
      }
    }
    return jsonRpcError(id, -32603, message)
  }
}

async function dispatch(
  host: JrTrellisToolHost,
  method: string,
  params: unknown
): Promise<unknown> {
  if (method === 'initialize') {
    const protocolVersion =
      isRecord(params) && typeof params.protocolVersion === 'string'
        ? params.protocolVersion
        : PROTOCOL_VERSION
    return {
      protocolVersion,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'jr-trellis', version: '0.1.0' }
    }
  }
  if (method === 'ping' || method === 'notifications/initialized') {
    return {}
  }
  if (method === 'tools/list') {
    return { tools: JR_TRELLIS_TOOL_DEFINITIONS }
  }
  if (method === 'tools/call') {
    return callTool(host, params)
  }
  throw new Error(`Unsupported MCP method: ${method}`)
}

async function callTool(host: JrTrellisToolHost, params: unknown): Promise<unknown> {
  if (!isRecord(params) || typeof params.name !== 'string') {
    throw new Error('MCP tools/call requires a tool name.')
  }
  const rawArgs = params.arguments
  const args = rawArgs === undefined ? {} : rawArgs
  if (!isRecord(args)) {
    throw new Error('MCP tool arguments must be an object.')
  }
  const payload = await host.call(params.name, args)
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }]
  }
}

function jsonRpcError(id: unknown, code: number, message: string): unknown {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
