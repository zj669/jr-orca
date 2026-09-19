import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
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

test('initializes CLI skills without MCP files and lists a created card', () => {
  const repository = mkdtempSync(join(tmpdir(), 'jr-cli-'))
  try {
    execFileSync('git', ['init'], { cwd: repository, stdio: 'ignore' })

    const initOutput = runCli(repository, ['init'])
    assert.match(initOutput, /已初始化 JR/)
    assert.equal(existsSync(join(repository, '.jr', 'state.sqlite')), true)
    assert.equal(existsSync(join(repository, '.mcp.json')), false)
    assert.equal(existsSync(join(repository, '.cursor', 'mcp.json')), false)
    assert.equal(existsSync(join(repository, '.codex', 'config.toml')), false)
    const skillPath = join(repository, '.cursor', 'skills', 'jr-lifecycle', 'SKILL.md')
    assert.equal(existsSync(skillPath), true)
    const skill = readFileSync(skillPath, 'utf8')
    assert.match(skill, /只使用 JR CLI/)
    assert.doesNotMatch(skill, /jr_card_create|jr_board_list/)

    const created = JSON.parse(
      runCli(repository, [
        'card',
        'create',
        '验证 JR 安装流程',
        '--description',
        '在临时 Git 仓库中创建并列出卡片。',
        '--json'
      ])
    )
    assert.equal(created.status, 'idea')
    assert.equal(created.title, '验证 JR 安装流程')

    const board = JSON.parse(runCli(repository, ['status', '--json']))
    assert.equal(board.columns[0].label, '想法')
    assert.equal(board.columns[0].cards[0].id, created.id)
  } finally {
    rmSync(repository, { recursive: true, force: true })
  }
})
