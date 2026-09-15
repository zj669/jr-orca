import { describe, expect, it } from 'vitest'
import { sanitizeJrBlockReason } from './jr-block-reason'

describe('sanitizeJrBlockReason', () => {
  it('strips Electron IPC and git command wrappers from merge failures', () => {
    const reason = sanitizeJrBlockReason(
      "Error invoking remote method 'jr:mergeIntoBase': Error: Command failed: git merge --no-ff --no-edit PTY受阻复验\nerror: The following untracked working tree files would be overwritten by merge:\n\t.mcp.json"
    )
    expect(reason.startsWith('error: The following untracked')).toBe(true)
    expect(reason).not.toContain('Error invoking remote method')
    expect(reason).not.toContain('Command failed:')
  })
})
