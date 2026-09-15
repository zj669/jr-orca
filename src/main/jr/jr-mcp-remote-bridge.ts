export const JR_MCP_REMOTE_BRIDGE_RELATIVE = joinJrBridgePath()

export const JR_MCP_REMOTE_BRIDGE_SOURCE = `#!/usr/bin/env node
'use strict'
const { spawnSync } = require('child_process')
const { Buffer } = require('buffer')

const TOOL_LIST = [
  'jr_workflow_get',
  'jr_specs_list',
  'jr_specs_get',
  'jr_task_get',
  'jr_task_create',
  'jr_task_update',
  'jr_artifacts_list',
  'jr_artifacts_get',
  'jr_artifact_upsert',
  'jr_journal_append',
  'jr_research_append',
  'jr_context_get',
  'jr_context_set',
  'jr_spec_propose',
  'jr_card_request_transition',
  'jr_projection_sync',
  'jr_projection_verify'
]

let pending = Buffer.alloc(0)
process.stdin.on('data', (chunk) => {
  pending = Buffer.concat([pending, Buffer.from(chunk)])
  drain()
})

function drain() {
  while (true) {
    const extracted = extractOne()
    if (extracted === undefined) {
      return
    }
    const response = handle(extracted)
    if (response) {
      process.stdout.write(encode(response))
    }
  }
}

function extractOne() {
  if (pending.length === 0) {
    return undefined
  }
  if (pending[0] === 0x7b) {
    const newline = pending.indexOf(0x0a)
    if (newline === -1) {
      return undefined
    }
    const line = pending.subarray(0, newline).toString('utf8').replace(/\\r$/, '')
    pending = pending.subarray(newline + 1)
    return line.trim() ? JSON.parse(line) : extractOne()
  }
  const headerEnd = pending.indexOf('\\r\\n\\r\\n')
  if (headerEnd === -1) {
    return undefined
  }
  const header = pending.subarray(0, headerEnd).toString('utf8')
  const match = /Content-Length:\\s*(\\d+)/i.exec(header)
  if (!match) {
    throw new Error('JR MCP bridge missing Content-Length')
  }
  const length = Number(match[1])
  const bodyStart = headerEnd + 4
  if (pending.length < bodyStart + length) {
    return undefined
  }
  const body = pending.subarray(bodyStart, bodyStart + length).toString('utf8')
  pending = pending.subarray(bodyStart + length)
  return JSON.parse(body)
}

function encode(message) {
  const json = JSON.stringify(message)
  return Buffer.concat([
    Buffer.from('Content-Length: ' + Buffer.byteLength(json, 'utf8') + '\\r\\n\\r\\n', 'utf8'),
    Buffer.from(json, 'utf8')
  ])
}

function handle(raw) {
  if (!raw || raw.jsonrpc !== '2.0' || typeof raw.method !== 'string' || raw.id === undefined) {
    return null
  }
  try {
    return { jsonrpc: '2.0', id: raw.id, result: dispatch(raw.method, raw.params) }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (raw.method === 'tools/call') {
      return {
        jsonrpc: '2.0',
        id: raw.id,
        result: { content: [{ type: 'text', text: message }], isError: true }
      }
    }
    return { jsonrpc: '2.0', id: raw.id, error: { code: -32603, message } }
  }
}

function dispatch(method, params) {
  if (method === 'initialize') {
    return {
      protocolVersion: (params && params.protocolVersion) || '2024-11-05',
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'jr-trellis', version: '0.1.0' }
    }
  }
  if (method === 'ping' || method === 'notifications/initialized') {
    return {}
  }
  if (method === 'tools/list') {
    return {
      tools: TOOL_LIST.map((name) => ({
        name,
        description: name,
        inputSchema: { type: 'object', properties: {} }
      }))
    }
  }
  if (method === 'tools/call') {
    if (!params || typeof params.name !== 'string') {
      throw new Error('MCP tools/call requires a tool name.')
    }
    const args = params.arguments && typeof params.arguments === 'object' ? params.arguments : {}
    const payload = callOrca(params.name, args)
    return { content: [{ type: 'text', text: payload }] }
  }
  throw new Error('Unsupported MCP method: ' + method)
}

function callOrca(name, args) {
  const result = spawnSync(
    'orca',
    ['jr', 'call', '--tool', name, '--args', JSON.stringify(args), '--json'],
    {
      encoding: 'utf8',
      env: process.env,
      input: '',
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024
    }
  )
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || 'orca jr call failed').trim())
  }
  return (result.stdout || '').trim()
}
`

function joinJrBridgePath(): string {
  return ['.jr', 'jr-mcp-bridge.cjs'].join('/')
}
