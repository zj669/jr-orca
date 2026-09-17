import { describe, expect, it } from 'vitest'
import { JR_BOARD_COLUMNS, jrCardBoardColumn } from './jr-board-columns'
import type { JrCardStatus } from '../../../../shared/jr/jr-types'

describe('JR board columns', () => {
  it('groups lifecycle states into five visible columns', () => {
    const cases: readonly [JrCardStatus, string | null][] = [
      ['idea', 'idea'],
      ['discussion', 'planning'],
      ['planning', 'planning'],
      ['pending_execution_approval', 'execution'],
      ['creating_worktree', 'execution'],
      ['executing', 'execution'],
      ['verifying', 'review'],
      ['pending_merge_approval', 'review'],
      ['shipping', 'review'],
      ['merged', 'complete'],
      ['cancelled', null]
    ]

    expect(JR_BOARD_COLUMNS).toHaveLength(5)
    for (const [status, column] of cases) {
      expect(jrCardBoardColumn({ status, blocked: null })).toBe(column)
    }
  })

  it('keeps blocked cards in their resumable column', () => {
    expect(
      jrCardBoardColumn({
        status: 'blocked',
        blocked: {
          fromStatus: 'pending_merge_approval',
          owner: 'human-controller:local-user',
          reason: '等待合并批准'
        }
      })
    ).toBe('review')
  })
})
