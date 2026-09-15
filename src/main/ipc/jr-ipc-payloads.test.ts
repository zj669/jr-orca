import { describe, expect, it } from 'vitest'
import { parseJrMergeIntoBaseInput } from './jr-ipc-payloads'

describe('parseJrMergeIntoBaseInput', () => {
  it('accepts the canonical merge fields', () => {
    expect(
      parseJrMergeIntoBaseInput({
        baseWorktreePath: '/repo',
        branch: 'refs/heads/jr/task',
        expectedBaseRef: 'main'
      })
    ).toEqual({
      baseWorktreePath: '/repo',
      branch: 'refs/heads/jr/task',
      expectedBaseRef: 'main'
    })
  })

  it('accepts featureBranch and baseRef aliases used by ad-hoc IPC callers', () => {
    expect(
      parseJrMergeIntoBaseInput({
        baseWorktreePath: '/repo',
        featureBranch: 'jr/task',
        baseRef: 'main'
      })
    ).toEqual({
      baseWorktreePath: '/repo',
      branch: 'jr/task',
      expectedBaseRef: 'main'
    })
  })

  it('rejects a payload without a feature branch', () => {
    expect(() =>
      parseJrMergeIntoBaseInput({
        baseWorktreePath: '/repo',
        expectedBaseRef: 'main'
      })
    ).toThrow('feature branch is required')
  })
})
