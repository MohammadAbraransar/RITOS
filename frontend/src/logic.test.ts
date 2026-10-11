import { describe, expect, it } from 'vitest'
import { isClosedStatus, priorityRank } from './logic'

describe('ticket UI logic', () => {
  it('orders priorities from critical to low', () => {
    expect(priorityRank('P1')).toBeLessThan(priorityRank('P4'))
  })
  it('identifies only terminal ticket states as closed', () => {
    expect(isClosedStatus('RESOLVED')).toBe(true)
    expect(isClosedStatus('IN_REVIEW')).toBe(false)
  })
})
