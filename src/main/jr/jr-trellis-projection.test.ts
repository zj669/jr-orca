import { describe, expect, it } from 'vitest'
import { createLocalJrProjectionWriter } from './jr-trellis-projection-fs'
import { syncJrTrellisProjection, verifyJrTrellisProjection } from './jr-trellis-projection'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { JrCard } from '../../shared/jr/jr-types'

const card: JrCard = {
  id: 'card-1',
  title: 'Projection',
  description: 'SQLite is canonical.',
  acceptance: 'Hashes match SQLite.',
  priority: 'p2',
  status: 'planning',
  harness: 'codex',
  model: { id: 'gpt-5.6-sol', label: 'GPT', capabilitySource: 'orca-session-catalog' },
  execution: {
    repositoryId: 'repo-1',
    baseRef: 'main',
    setupDecision: 'skip',
    worktree: null,
    worktreePhase: null,
    agentSession: null
  },
  review: null,
  delivery: null,
  blocked: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  artifacts: [
    {
      id: 'a1',
      cardId: 'card-1',
      path: 'workflow.md',
      content: '# workflow\n',
      version: 1,
      updatedAt: '2026-01-01T00:00:00.000Z'
    }
  ],
  events: []
}

describe('JR Trellis projection', () => {
  it('syncs hashed files and rejects finish when a projected file is tampered', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'orca-jr-projection-'))
    try {
      const writer = createLocalJrProjectionWriter(directory)
      const manifest = await syncJrTrellisProjection(card, writer)
      expect(manifest.files.some((file) => file.path === '.trellis/workflow.md')).toBe(true)
      await expect(verifyJrTrellisProjection(card, writer)).resolves.toEqual({
        ok: true,
        present: true,
        manifest: expect.objectContaining({ cardId: 'card-1' })
      })
      await writeFile(join(directory, '.trellis', 'workflow.md'), 'tampered')
      await expect(verifyJrTrellisProjection(card, writer)).rejects.toThrow('hashes differ')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
