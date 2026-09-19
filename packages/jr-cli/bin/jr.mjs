#!/usr/bin/env node

import { randomUUID } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import { spawnSync } from 'node:child_process'

const DATABASE_FILE = 'state.sqlite'
const PROJECT_DIRECTORY = '.jr'
const MCP_SERVER = {
  command: 'npx',
  args: ['--no-install', 'jr', 'mcp']
}

const BOARD_COLUMNS = [
  { key: 'idea', label: '想法', statuses: ['idea'] },
  { key: 'planning', label: '规划', statuses: ['discussion', 'planning'] },
  {
    key: 'execution',
    label: '执行',
    statuses: ['pending_execution_approval', 'creating_worktree', 'executing']
  },
  {
    key: 'review',
    label: '审查',
    statuses: ['verifying', 'pending_merge_approval', 'shipping']
  },
  { key: 'done', label: '完成', statuses: ['merged'] }
]

const STATUS_LABELS = {
  idea: '想法',
  discussion: '讨论中',
  planning: '规划中',
  pending_execution_approval: '待批准执行',
  creating_worktree: '创建工作树',
  executing: '执行中',
  verifying: '验证中',
  pending_merge_approval: '待批准合并',
  shipping: '交付中',
  merged: '已合并',
  blocked: '受阻',
  cancelled: '已取消'
}

const LIFECYCLE_SKILL = `---
name: jr-lifecycle
description: 使用 JR 本地 SQLite 看板管理想法、规划、执行、审查和完成。
---

# JR 交付生命周期

Trellis 仅启发 JR 的安装体验与卡片生命周期；不要复制、读取或供应 Trellis 源码。

1. 先调用 \`jr_board_list\` 查看看板，或调用 \`jr_card_create\` 创建想法。
2. SQLite（\`.jr/state.sqlite\`）是唯一事实来源；不要直接修改 \`.trellis/\`。
3. 看板固定为：想法、规划、执行、审查、完成。受阻卡片留在原列。
4. 执行 AI 与审查 AI 必须分开配置；审查失败必须回到同一个 worktree。
5. 只有 controller 可以批准执行、通过验证和批准合并。工作代理不能绕过这些闸门。
`

class CliError extends Error {}

await main(process.argv.slice(2))

async function main(args) {
  try {
    const [command] = args
    if (command === 'init') {
      const root = gitRepositoryRoot(process.cwd())
      const result = initializeProject(root)
      printInitResult(result)
      return
    }
    if (command === 'status' || command === 'board') {
      const root = gitRepositoryRoot(process.cwd())
      const database = openProjectDatabase(root)
      try {
        const board = readBoard(database)
        if (hasFlag(args.slice(1), '--json')) {
          process.stdout.write(`${JSON.stringify(board, null, 2)}\n`)
        } else {
          printBoard(board)
        }
      } finally {
        database.close()
      }
      return
    }
    if (command === 'card' && args[1] === 'create') {
      const root = gitRepositoryRoot(process.cwd())
      const { positionals, flags } = parseOptions(args.slice(2))
      const title = positionals.join(' ').trim()
      const description = getSingleFlag(flags, '--description') ?? '尚未补充说明。'
      const database = openProjectDatabase(root)
      try {
        const card = createCard(database, title, description)
        if (hasFlag(args.slice(2), '--json')) {
          process.stdout.write(`${JSON.stringify(card, null, 2)}\n`)
        } else {
          process.stdout.write(`已创建想法卡片：${card.title}\nID：${card.id}\n`)
        }
      } finally {
        database.close()
      }
      return
    }
    if (command === 'mcp') {
      const root = gitRepositoryRoot(process.cwd())
      await runMcpServer(root)
      return
    }
    printHelp()
    process.exitCode = command ? 1 : 0
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误'
    process.stderr.write(`错误：${message}\n`)
    process.exitCode = 1
  }
}

function printHelp() {
  process.stdout.write(`JR：仓库本地交付看板

用法：
  jr init
  jr status [--json]
  jr board [--json]
  jr card create <标题> [--description <说明>] [--json]
  jr mcp

说明：
  \`jr init\` 必须在 Git 仓库中运行。SQLite 是唯一事实来源。
  Trellis 仅是安装体验与生命周期灵感；JR 不包含 Trellis 源码。
`)
}

function gitRepositoryRoot(cwd) {
  const inside = runGit(cwd, ['rev-parse', '--is-inside-work-tree'])
  if (inside !== 'true') {
    throw new CliError('请在 Git 仓库中运行 JR。')
  }
  return runGit(cwd, ['rev-parse', '--show-toplevel'])
}

function runGit(cwd, args) {
  const result = spawnSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    windowsHide: true
  })
  if (result.error || result.status !== 0) {
    throw new CliError('无法读取当前 Git 仓库。')
  }
  return result.stdout.trim()
}

function initializeProject(root) {
  const jrDirectory = join(root, PROJECT_DIRECTORY)
  mkdirSync(jrDirectory, { recursive: true })
  const databasePath = join(jrDirectory, DATABASE_FILE)
  const database = openDatabase(databasePath)
  database.close()

  const mcpPaths = [
    mergeMcpJson(join(root, '.mcp.json')),
    mergeMcpJson(join(root, '.cursor', 'mcp.json')),
    installCodexMcpConfig(join(root, '.codex', 'config.toml'))
  ]
  const skillPaths = [
    installSkill(join(root, '.claude', 'skills', 'jr-lifecycle', 'SKILL.md')),
    installSkill(join(root, '.cursor', 'skills', 'jr-lifecycle', 'SKILL.md')),
    installSkill(join(root, '.codex', 'skills', 'jr-lifecycle', 'SKILL.md'))
  ]

  writeJson(join(jrDirectory, 'mcp.json'), { mcpServers: { jr: MCP_SERVER } })
  return { root, databasePath, mcpPaths, skillPaths }
}

function printInitResult(result) {
  process.stdout.write(`已初始化 JR\n仓库：${result.root}\n数据库：${result.databasePath}\n`)
  for (const configuration of result.mcpPaths) {
    const action = configuration.installed ? '已写入' : '保留已有'
    process.stdout.write(`MCP 配置：${action} ${configuration.path}\n`)
  }
  for (const skill of result.skillPaths) {
    const action = skill.installed ? '已写入' : '保留已有'
    process.stdout.write(`技能：${action} ${skill.path}\n`)
  }
}

function mergeMcpJson(path) {
  const config = existsSync(path) ? readJson(path) : {}
  if (!isRecord(config)) {
    throw new CliError(`MCP 配置不是 JSON 对象：${path}`)
  }
  const servers = config.mcpServers ?? {}
  if (!isRecord(servers)) {
    throw new CliError(`MCP 配置的 mcpServers 必须是对象：${path}`)
  }
  if (!Object.hasOwn(servers, 'jr')) {
    servers.jr = MCP_SERVER
    config.mcpServers = servers
    writeJson(path, config)
    return { path, installed: true }
  }
  return { path, installed: false }
}

function installCodexMcpConfig(path) {
  mkdirSync(dirname(path), { recursive: true })
  const configuration = `[mcp_servers.jr]
command = "npx"
args = ["--no-install", "jr", "mcp"]
`
  if (existsSync(path)) {
    const existing = readFileSync(path, 'utf8')
    if (existing.includes('[mcp_servers.jr]')) {
      return { path, installed: false }
    }
    writeFileSync(path, `${existing.trimEnd()}\n\n${configuration}`, 'utf8')
    return { path, installed: true }
  }
  writeFileSync(path, configuration, 'utf8')
  return { path, installed: true }
}

function installSkill(path) {
  if (existsSync(path)) {
    return { path, installed: false }
  }
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, LIFECYCLE_SKILL, 'utf8')
  return { path, installed: true }
}

function openProjectDatabase(root) {
  const databasePath = join(root, PROJECT_DIRECTORY, DATABASE_FILE)
  if (!existsSync(databasePath)) {
    throw new CliError('尚未初始化 JR。请先运行 `jr init`。')
  }
  return openDatabase(databasePath)
}

function openDatabase(databasePath) {
  mkdirSync(dirname(databasePath), { recursive: true })
  const database = new DatabaseSync(databasePath)
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS cards (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      detail TEXT NOT NULL,
      actor TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `)
  return database
}

function createCard(database, title, description) {
  const normalizedTitle = title.trim()
  const normalizedDescription = description.trim()
  if (normalizedTitle.length < 2 || normalizedTitle.length > 160) {
    throw new CliError('卡片标题需要在 2 到 160 个字符之间。')
  }
  if (normalizedDescription.length > 2_000) {
    throw new CliError('卡片说明不能超过 2000 个字符。')
  }
  const now = new Date().toISOString()
  const card = {
    id: randomUUID(),
    title: normalizedTitle,
    description: normalizedDescription || '尚未补充说明。',
    status: 'idea',
    statusLabel: STATUS_LABELS.idea,
    createdAt: now,
    updatedAt: now
  }
  database
    .prepare(
      `INSERT INTO cards (id, title, description, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(card.id, card.title, card.description, card.status, card.createdAt, card.updatedAt)
  database
    .prepare(
      `INSERT INTO events (id, card_id, kind, detail, actor, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      randomUUID(),
      card.id,
      '卡片已创建',
      '想法已记录，尚未授权 AI 讨论或执行。',
      'human-controller',
      now
    )
  return card
}

function readBoard(database) {
  const cards = database
    .prepare(
      `SELECT id, title, description, status, created_at, updated_at
       FROM cards
       ORDER BY updated_at DESC`
    )
    .all()
    .map((row) => cardFromRow(row))
  return {
    columns: BOARD_COLUMNS.map((column) => ({
      key: column.key,
      label: column.label,
      statuses: column.statuses,
      cards: cards.filter((card) => column.statuses.includes(card.status))
    })),
    blocked: cards.filter((card) => card.status === 'blocked'),
    cancelled: cards.filter((card) => card.status === 'cancelled')
  }
}

function cardFromRow(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    statusLabel: STATUS_LABELS[row.status] ?? row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function printBoard(board) {
  process.stdout.write('JR 看板\n')
  for (const column of board.columns) {
    process.stdout.write(`\n${column.label} (${column.cards.length})\n`)
    for (const card of column.cards) {
      process.stdout.write(`  • ${card.title} [${card.id}]\n`)
    }
  }
  if (board.blocked.length > 0) {
    process.stdout.write(`\n受阻 (${board.blocked.length})\n`)
  }
}

function parseOptions(args) {
  const positionals = []
  const flags = new Map()
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (!argument.startsWith('--')) {
      positionals.push(argument)
      continue
    }
    if (argument === '--json') {
      flags.set(argument, true)
      continue
    }
    const value = args[index + 1]
    if (!value || value.startsWith('--')) {
      throw new CliError(`${argument} 需要一个值。`)
    }
    flags.set(argument, value)
    index += 1
  }
  return { positionals, flags }
}

function hasFlag(args, flag) {
  return args.includes(flag)
}

function getSingleFlag(flags, flag) {
  const value = flags.get(flag)
  return typeof value === 'string' ? value : undefined
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    throw new CliError(`无法读取 JSON 配置：${path}`)
  }
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

async function runMcpServer(root) {
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity })
  for await (const line of input) {
    if (!line.trim()) {
      continue
    }
    const response = await handleMcpMessage(root, line)
    if (response) {
      process.stdout.write(`${JSON.stringify(response)}\n`)
    }
  }
}

async function handleMcpMessage(root, line) {
  let request
  try {
    request = JSON.parse(line)
  } catch {
    return mcpError(null, -32700, '无效 JSON。')
  }
  if (!isRecord(request) || typeof request.method !== 'string') {
    return mcpError(null, -32600, '无效 JSON-RPC 请求。')
  }
  const id = Object.hasOwn(request, 'id') ? request.id : undefined
  try {
    if (request.method === 'initialize') {
      return mcpResult(id, {
        protocolVersion: '2025-03-26',
        capabilities: { tools: {} },
        serverInfo: { name: 'jr', version: '0.1.0' }
      })
    }
    if (request.method === 'notifications/initialized') {
      return undefined
    }
    if (request.method === 'tools/list') {
      return mcpResult(id, { tools: mcpTools() })
    }
    if (request.method === 'tools/call') {
      const result = callMcpTool(root, request.params)
      return mcpResult(id, { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] })
    }
    return id === undefined ? undefined : mcpError(id, -32601, '未实现的方法。')
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误'
    return id === undefined ? undefined : mcpError(id, -32000, message)
  }
}

function mcpTools() {
  return [
    {
      name: 'jr_card_create',
      description: '创建一张处于想法列的 JR 卡片。',
      inputSchema: {
        type: 'object',
        required: ['title'],
        properties: {
          title: { type: 'string', minLength: 2, description: '卡片标题' },
          description: { type: 'string', description: '问题、预期结果或背景' }
        }
      }
    },
    {
      name: 'jr_board_list',
      description: '读取 JR 的五列看板和受阻卡片。',
      inputSchema: { type: 'object', properties: {} }
    }
  ]
}

function callMcpTool(root, params) {
  if (!isRecord(params) || typeof params.name !== 'string') {
    throw new CliError('tools/call 缺少工具名称。')
  }
  const argumentsValue = isRecord(params.arguments) ? params.arguments : {}
  const database = openProjectDatabase(root)
  try {
    if (params.name === 'jr_card_create') {
      if (typeof argumentsValue.title !== 'string') {
        throw new CliError('jr_card_create 需要 title。')
      }
      const description =
        typeof argumentsValue.description === 'string' ? argumentsValue.description : '尚未补充说明。'
      return createCard(database, argumentsValue.title, description)
    }
    if (params.name === 'jr_board_list') {
      return readBoard(database)
    }
    throw new CliError(`未知 JR 工具：${params.name}`)
  } finally {
    database.close()
  }
}

function mcpResult(id, result) {
  return { jsonrpc: '2.0', id, result }
}

function mcpError(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } }
}
