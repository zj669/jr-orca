import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  registerSshFilesystemProvider,
  unregisterSshFilesystemProvider
} from '../providers/ssh-filesystem-dispatch'
import { JR_MCP_REMOTE_BRIDGE_RELATIVE, JR_MCP_REMOTE_BRIDGE_SOURCE } from './jr-mcp-remote-bridge'
import type { JrCard } from '../../shared/jr/jr-types'

vi.mock('./jr-store-access', () => ({
  getJrDatabasePath: () => '/tmp/jr.sqlite'
}))

const { seedJrTrellisHarnessSession } = await import('./jr-trellis-session-seed')

const CONNECTION = 'ssh-jr-seed'
const card = {
  id: 'card-ssh',
  harness: 'cursorcli'
} as JrCard

afterEach(() => {
  unregisterSshFilesystemProvider(CONNECTION)
})

describe('seedJrTrellisHarnessSession', () => {
  it('writes the remote MCP bridge and jr-trellis server over an SSH filesystem provider', async () => {
    const files = new Map<string, string>()
    registerSshFilesystemProvider(CONNECTION, {
      writeFile: async (filePath: string, content: string) => {
        files.set(filePath, content)
      },
      readFile: async (filePath: string) => {
        const content = files.get(filePath)
        if (content === undefined) {
          throw new Error('missing')
        }
        return { content }
      }
    } as never)

    const written = await seedJrTrellisHarnessSession(card, '/remote/worktree', {
      connectionId: CONNECTION,
      posixRemote: true
    })

    expect(written).toEqual(expect.arrayContaining([JR_MCP_REMOTE_BRIDGE_RELATIVE, '.mcp.json']))
    expect(files.get(`/remote/worktree/${JR_MCP_REMOTE_BRIDGE_RELATIVE}`)).toBe(
      JR_MCP_REMOTE_BRIDGE_SOURCE
    )
    const mcp = JSON.parse(files.get('/remote/worktree/.mcp.json') ?? '{}') as {
      mcpServers: {
        'jr-trellis': { command: string; args: string[]; env: Record<string, string> }
      }
    }
    expect(mcp.mcpServers['jr-trellis']).toMatchObject({
      command: 'sh',
      env: {
        JR_CARD_ID: 'card-ssh',
        JR_ACTOR_KIND: 'task-agent',
        JR_MCP_BRIDGE_PATH: `/remote/worktree/${JR_MCP_REMOTE_BRIDGE_RELATIVE}`
      }
    })
    expect(mcp.mcpServers['jr-trellis'].args.join(' ')).toContain('$JR_MCP_BRIDGE_PATH')
  })

  it('uses cmd.exe for Windows remote worktrees', async () => {
    const files = new Map<string, string>()
    registerSshFilesystemProvider(CONNECTION, {
      writeFile: async (filePath: string, content: string) => {
        files.set(filePath, content)
      },
      readFile: async (filePath: string) => {
        const content = files.get(filePath)
        if (content === undefined) {
          throw new Error('missing')
        }
        return { content }
      }
    } as never)

    await seedJrTrellisHarnessSession(card, 'C:\\remote\\worktree', {
      connectionId: CONNECTION,
      posixRemote: false
    })

    const mcp = JSON.parse(files.get('C:\\remote\\worktree\\.mcp.json') ?? '{}') as {
      mcpServers: { 'jr-trellis': { command: string; args: string[] } }
    }
    expect(mcp.mcpServers['jr-trellis'].command).toBe('cmd.exe')
    expect(mcp.mcpServers['jr-trellis'].args[0]).toBe('/c')
  })
})
