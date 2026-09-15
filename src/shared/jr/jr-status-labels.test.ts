import { describe, expect, it } from 'vitest'
import { JR_CARD_STATUSES } from './jr-types'
import { JR_STATUS_LABELS, jrStatusLabel } from './jr-status-labels'

describe('JR status labels', () => {
  it('covers every card status in Chinese', () => {
    expect(Object.keys(JR_STATUS_LABELS).sort()).toEqual([...JR_CARD_STATUSES].sort())
    expect(jrStatusLabel('shipping')).toBe('交付中')
    expect(jrStatusLabel('blocked')).toBe('受阻')
  })
})
