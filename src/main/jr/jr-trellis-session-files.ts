import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, posix, win32 } from 'node:path'
import { JR_MCP_REMOTE_BRIDGE_RELATIVE, JR_MCP_REMOTE_BRIDGE_SOURCE } from './jr-mcp-remote-bridge'
import { JR_TRELLIS_SKILL_FILES, type JrTrellisSkillName } from './jr-trellis-skill-guides'

export type JrTrellisMcpLaunch = {
  command: string
  args: string[]
  env: Record<string, string>
}

export type JrTrellisSessionFileWriter = {
  join(relativePath: string): string
  isDirectory(): boolean
  readText(relativePath: string): string | null | Promise<string | null>
  writeText(relativePath: string, content: string): void | Promise<void>
}

export type JrTrellisSessionSeedInput = {
  worktreePath: string
  cardId: string
  mcp: JrTrellisMcpLaunch
  writer?: JrTrellisSessionFileWriter
}

const MCP_RELATIVE_PATHS = ['.mcp.json', join('.cursor', 'mcp.json'), join('.claude', 'mcp.json')]
const SKILL_ROOTS = ['.agents', '.cursor', '.claude']
const SKILL_NAMES = Object.keys(JR_TRELLIS_SKILL_FILES) as JrTrellisSkillName[]

export async function seedJrTrellisSessionFiles(
  input: JrTrellisSessionSeedInput
): Promise<string[]> {
  const writer = input.writer ?? createLocalSessionWriter(input.worktreePath)
  if (!writer.isDirectory()) {
    throw new Error(
      'JR cannot seed Trellis files: worktree is not a local directory and no remote filesystem was provided.'
    )
  }
  const written: string[] = []
  const server = {
    command: input.mcp.command,
    args: input.mcp.args,
    env: input.mcp.env
  }
  for (const relativePath of MCP_RELATIVE_PATHS) {
    if (await writeMergedMcpConfig(writer, relativePath, server)) {
      written.push(relativePath)
    }
  }
  for (const root of SKILL_ROOTS) {
    for (const name of SKILL_NAMES) {
      const relativePath = join(root, 'skills', name, 'SKILL.md')
      await writer.writeText(relativePath, JR_TRELLIS_SKILL_FILES[name])
      written.push(relativePath)
    }
  }
  return written
}

export function createLocalSessionWriter(worktreePath: string): JrTrellisSessionFileWriter {
  return {
    join(relativePath) {
      return join(worktreePath, relativePath)
    },
    isDirectory() {
      try {
        return existsSync(worktreePath) && statSync(worktreePath).isDirectory()
      } catch {
        return false
      }
    },
    readText(relativePath) {
      const target = join(worktreePath, relativePath)
      if (!existsSync(target)) {
        return null
      }
      return readFileSync(target, 'utf8')
    },
    writeText(relativePath, content) {
      const target = join(worktreePath, relativePath)
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, content)
    }
  }
}

export function createRemoteSessionWriter(
  worktreePath: string,
  posixPaths: boolean,
  io: {
    writeFile(absolutePath: string, content: string): void | Promise<void>
    readFile(absolutePath: string): string | null | Promise<string | null>
  }
): JrTrellisSessionFileWriter {
  const joinPath = posixPaths ? posix.join : win32.join
  return {
    join(relativePath) {
      return joinPath(worktreePath, relativePath)
    },
    isDirectory() {
      return true
    },
    readText(relativePath) {
      return io.readFile(joinPath(worktreePath, relativePath))
    },
    writeText: async (relativePath, content) => {
      await io.writeFile(joinPath(worktreePath, relativePath), content)
    }
  }
}

export async function seedJrRemoteMcpBridge(writer: JrTrellisSessionFileWriter): Promise<string> {
  await writer.writeText(JR_MCP_REMOTE_BRIDGE_RELATIVE, JR_MCP_REMOTE_BRIDGE_SOURCE)
  return JR_MCP_REMOTE_BRIDGE_RELATIVE
}

async function writeMergedMcpConfig(
  writer: JrTrellisSessionFileWriter,
  relativePath: string,
  server: JrTrellisMcpLaunch
): Promise<boolean> {
  let parsed: unknown = { mcpServers: {} }
  const existing = await writer.readText(relativePath)
  if (existing !== null) {
    try {
      parsed = JSON.parse(existing)
    } catch {
      return false
    }
  }
  if (!isRecord(parsed)) {
    return false
  }
  const servers = isRecord(parsed.mcpServers) ? parsed.mcpServers : {}
  const next = {
    ...parsed,
    mcpServers: {
      ...servers,
      'jr-trellis': server
    }
  }
  await writer.writeText(relativePath, `${JSON.stringify(next, null, 2)}\n`)
  return true
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
