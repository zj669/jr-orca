import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createRemoteSessionWriter, seedJrTrellisSessionFiles } from './jr-trellis-session-files'
import {
  JR_TRELLIS_CHECK_SKILL,
  JR_TRELLIS_FINISH_SKILL,
  JR_TRELLIS_IMPLEMENT_SKILL,
  JR_TRELLIS_PLAN_SKILL
} from './jr-trellis-skill-guides'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe('JR Trellis session files', () => {
  it('seeds MCP configs and plan/implement/check/finish skills without creating .trellis', async () => {
    const worktreePath = await mkdtemp(join(tmpdir(), 'orca-jr-session-'))
    temporaryDirectories.push(worktreePath)
    await writeFile(
      join(worktreePath, '.mcp.json'),
      `${JSON.stringify({ mcpServers: { other: { command: 'echo' } } }, null, 2)}\n`
    )

    const written = await seedJrTrellisSessionFiles({
      worktreePath,
      cardId: 'card-1',
      mcp: {
        command: '/opt/Orca',
        args: ['/opt/Orca/out/main/jr-mcp-stdio.js'],
        env: {
          ELECTRON_RUN_AS_NODE: '1',
          JR_DB_PATH: '/tmp/jr.sqlite',
          JR_CARD_ID: 'card-1',
          JR_ACTOR_KIND: 'task-agent',
          JR_ACTOR_ID: 'cursorcli:card-1'
        }
      }
    })

    expect(written).toEqual(
      expect.arrayContaining([
        '.mcp.json',
        join('.cursor', 'mcp.json'),
        join('.agents', 'skills', 'jr-trellis-plan', 'SKILL.md'),
        join('.claude', 'skills', 'jr-trellis-implement', 'SKILL.md'),
        join('.cursor', 'skills', 'jr-trellis-check', 'SKILL.md'),
        join('.agents', 'skills', 'jr-trellis-finish', 'SKILL.md')
      ])
    )

    const mcp = JSON.parse(await readFile(join(worktreePath, '.mcp.json'), 'utf8')) as {
      mcpServers: Record<string, { command: string; env: Record<string, string> }>
    }
    expect(mcp.mcpServers.other.command).toBe('echo')
    expect(mcp.mcpServers['jr-trellis']).toMatchObject({
      command: '/opt/Orca',
      env: { JR_CARD_ID: 'card-1', JR_ACTOR_KIND: 'task-agent' }
    })
    expect(
      await readFile(join(worktreePath, '.agents', 'skills', 'jr-trellis-plan', 'SKILL.md'), 'utf8')
    ).toBe(JR_TRELLIS_PLAN_SKILL)
    expect(
      await readFile(
        join(worktreePath, '.cursor', 'skills', 'jr-trellis-implement', 'SKILL.md'),
        'utf8'
      )
    ).toBe(JR_TRELLIS_IMPLEMENT_SKILL)
    expect(
      await readFile(
        join(worktreePath, '.claude', 'skills', 'jr-trellis-check', 'SKILL.md'),
        'utf8'
      )
    ).toBe(JR_TRELLIS_CHECK_SKILL)
    expect(
      await readFile(
        join(worktreePath, '.cursor', 'skills', 'jr-trellis-finish', 'SKILL.md'),
        'utf8'
      )
    ).toBe(JR_TRELLIS_FINISH_SKILL)
    await expect(readFile(join(worktreePath, '.trellis', 'workflow.md'), 'utf8')).rejects.toThrow()
  })

  it('throws when the worktree path is not a local directory and no remote writer is provided', async () => {
    const missing = join(tmpdir(), 'orca-jr-missing-worktree')
    await expect(
      seedJrTrellisSessionFiles({
        worktreePath: missing,
        cardId: 'card-1',
        mcp: { command: 'node', args: ['jr-mcp-stdio.js'], env: {} }
      })
    ).rejects.toThrow('no remote filesystem')
  })

  it('writes through a remote session writer and awaits async IO', async () => {
    const files = new Map<string, string>()
    let pending = 0
    const writer = createRemoteSessionWriter('/remote/worktree', true, {
      writeFile: async (absolutePath, content) => {
        pending += 1
        await Promise.resolve()
        files.set(absolutePath, content)
        pending -= 1
      },
      readFile: async (absolutePath) => files.get(absolutePath) ?? null
    })
    const written = await seedJrTrellisSessionFiles({
      worktreePath: '/remote/worktree',
      cardId: 'card-1',
      writer,
      mcp: { command: 'node', args: ['jr-mcp-bridge.cjs'], env: { JR_CARD_ID: 'card-1' } }
    })
    expect(pending).toBe(0)
    expect(written.length).toBeGreaterThan(0)
    expect(files.get('/remote/worktree/.mcp.json')).toContain('jr-trellis')
  })

  it('does not overwrite a worktree MCP file that is not valid JSON', async () => {
    const worktreePath = await mkdtemp(join(tmpdir(), 'orca-jr-bad-mcp-'))
    temporaryDirectories.push(worktreePath)
    await mkdir(join(worktreePath, '.cursor'), { recursive: true })
    await writeFile(join(worktreePath, '.mcp.json'), '{not json')

    await seedJrTrellisSessionFiles({
      worktreePath,
      cardId: 'card-1',
      mcp: { command: 'node', args: ['jr-mcp-stdio.js'], env: { JR_CARD_ID: 'card-1' } }
    })

    expect(await readFile(join(worktreePath, '.mcp.json'), 'utf8')).toBe('{not json')
    const cursorMcp = JSON.parse(
      await readFile(join(worktreePath, '.cursor', 'mcp.json'), 'utf8')
    ) as { mcpServers: { 'jr-trellis': { command: string } } }
    expect(cursorMcp.mcpServers['jr-trellis'].command).toBe('node')
  })
})
