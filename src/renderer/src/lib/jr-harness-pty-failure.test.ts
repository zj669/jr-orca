import { describe, expect, it } from 'vitest'
import {
  createJrHarnessPtyFailureScanner,
  matchJrHarnessPtyFailure
} from './jr-harness-pty-failure'

describe('JR harness PTY failure', () => {
  it('detects a missing cursor-agent binary while the shell stays open', () => {
    expect(matchJrHarnessPtyFailure('bash: cursor-agent: command not found\n全流程验收卡 $ ')).toBe(
      'Harness 二进制不在 PATH 上。'
    )
  })

  it('detects an Origin-scoped Cursor session token', () => {
    expect(
      matchJrHarnessPtyFailure(
        'Error: [permission_denied] This session token is scoped to Origin CLI usage and is not permitted on this endpoint.\n仓库下拉持久化验收 $ '
      )
    ).toBe('Cursor Agent 认证失败：当前会话 token 不能调用 Cursor API。')
  })

  it('ignores ordinary agent output', () => {
    expect(matchJrHarnessPtyFailure('## Approved task\nTitle: 仓库下拉持久化验收\n')).toBeNull()
  })

  it('matches across chunked PTY writes once', () => {
    const scan = createJrHarnessPtyFailureScanner()
    expect(
      scan('Error: [permission_denied] This session token is scoped to Origin CLI usage')
    ).toBeNull()
    expect(scan(' and is not permitted on this endpoint.\n$ ')).toBe(
      'Cursor Agent 认证失败：当前会话 token 不能调用 Cursor API。'
    )
    expect(scan(' and is not permitted on this endpoint.\n$ ')).toBeNull()
  })
})
