import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { JR_MCP_REMOTE_BRIDGE_SOURCE } from './jr-mcp-remote-bridge'

describe('JR MCP remote bridge', () => {
  it('emits newline-delimited JSON-RPC responses', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'orca-jr-mcp-bridge-'))
    const bridgePath = join(directory, 'bridge.cjs')
    await writeFile(bridgePath, JR_MCP_REMOTE_BRIDGE_SOURCE)
    try {
      const bridge = spawn(process.execPath, [bridgePath], {
        stdio: ['pipe', 'pipe', 'pipe']
      })
      let stdout = ''
      let stderr = ''
      bridge.stdout.setEncoding('utf8')
      bridge.stdout.on('data', (chunk: string) => {
        stdout += chunk
      })
      bridge.stderr.setEncoding('utf8')
      bridge.stderr.on('data', (chunk: string) => {
        stderr += chunk
      })
      const exited = new Promise<void>((resolve, reject) => {
        bridge.on('error', reject)
        bridge.on('close', (code) => {
          if (code === 0) {
            resolve()
            return
          }
          reject(new Error(`Bridge exited with code ${code ?? 'null'}.`))
        })
      })

      bridge.stdin.end(
        `${JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: { protocolVersion: '2024-11-05' }
        })}\n`
      )
      await exited

      expect(stderr).toBe('')
      expect(stdout).toBe(
        `${JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: 'jr-trellis', version: '0.1.0' }
          }
        })}\n`
      )
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
