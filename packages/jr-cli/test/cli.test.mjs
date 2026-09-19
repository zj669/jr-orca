import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

const cliPath = resolve(import.meta.dirname, '../bin/jr.mjs')

function runCli(repository, args, input) {
  return execFileSync(process.execPath, [cliPath, ...args], {
    cwd: repository,
    encoding: 'utf8',
    input
  })
}

test('initializes a Git repository and lists a created card', () => {
  const repository = mkdtempSync(join(tmpdir(), 'jr-cli-'))
  try {
    execFileSync('git', ['init'], { cwd: repository, stdio: 'ignore' })

    const initOutput = runCli(repository, ['init'])
    assert.match(initOutput, /已初始化 JR/)
    assert.equal(existsSync(join(repository, '.jr', 'state.sqlite')), true)
    assert.equal(existsSync(join(repository, '.mcp.json')), true)
    assert.equal(existsSync(join(repository, '.cursor', 'skills', 'jr-lifecycle', 'SKILL.md')), true)

    const created = JSON.parse(
      runCli(repository, ['card', 'create', '验证 JR 安装流程', '--description', '在临时 Git 仓库中创建并列出卡片。', '--json'])
    )
    assert.equal(created.status, 'idea')
    assert.equal(created.title, '验证 JR 安装流程')

    const board = JSON.parse(runCli(repository, ['status', '--json']))
    assert.equal(board.columns[0].label, '想法')
    assert.equal(board.columns[0].cards[0].id, created.id)

    const mcpOutput = runCli(
      repository,
      ['mcp'],
      '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}\n'
    )
    const response = JSON.parse(mcpOutput)
    assert.equal(response.result.tools[0].name, 'jr_card_create')
  } finally {
    rmSync(repository, { recursive: true, force: true })
  }
})
