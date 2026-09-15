import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { JR_TRELLIS_IMPLEMENT_SKILL, JR_TRELLIS_PLAN_SKILL } from './jr-trellis-skill-guides'

export type JrTrellisMcpLaunch = {
  command: string
  args: string[]
  env: Record<string, string>
}

export type JrTrellisSessionSeedInput = {
  worktreePath: string
  cardId: string
  mcp: JrTrellisMcpLaunch
}

const MCP_RELATIVE_PATHS = ['.mcp.json', join('.cursor', 'mcp.json'), join('.claude', 'mcp.json')]
const SKILL_ROOTS = ['.agents', '.cursor', '.claude']
const SKILL_NAMES = ['jr-trellis-plan', 'jr-trellis-implement'] as const

export function seedJrTrellisSessionFiles(input: JrTrellisSessionSeedInput): string[] {
  if (!isLocalDirectory(input.worktreePath)) {
    return []
  }
  const written: string[] = []
  const server = {
    command: input.mcp.command,
    args: input.mcp.args,
    env: input.mcp.env
  }
  for (const relativePath of MCP_RELATIVE_PATHS) {
    const target = join(input.worktreePath, relativePath)
    if (writeMergedMcpConfig(target, server)) {
      written.push(relativePath)
    }
  }
  for (const root of SKILL_ROOTS) {
    for (const name of SKILL_NAMES) {
      const relativePath = join(root, 'skills', name, 'SKILL.md')
      const target = join(input.worktreePath, relativePath)
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(
        target,
        name === 'jr-trellis-plan' ? JR_TRELLIS_PLAN_SKILL : JR_TRELLIS_IMPLEMENT_SKILL
      )
      written.push(relativePath)
    }
  }
  return written
}

function isLocalDirectory(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isDirectory()
  } catch {
    return false
  }
}

function writeMergedMcpConfig(target: string, server: JrTrellisMcpLaunch): boolean {
  let parsed: unknown = { mcpServers: {} }
  if (existsSync(target)) {
    try {
      parsed = JSON.parse(readFileSync(target, 'utf8'))
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
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, `${JSON.stringify(next, null, 2)}\n`)
  return true
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
