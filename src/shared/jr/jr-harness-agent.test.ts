import { describe, expect, it } from 'vitest'
import { jrHarnessAgent } from './jr-harness-agent'

describe('jrHarnessAgent', () => {
  it.each([
    ['cursorcli', 'cursor'],
    ['claude', 'claude'],
    ['codex', 'codex'],
    ['gemini', 'gemini']
  ] as const)('maps %s to Orca %s agent launcher profile', (harness, agent) => {
    expect(jrHarnessAgent(harness)).toBe(agent)
  })
})
