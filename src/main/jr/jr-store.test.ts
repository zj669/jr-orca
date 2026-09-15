import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { JrControllerActor } from '../../shared/jr/jr-types'
import { JrStore } from './jr-store'

const temporaryDirectories: string[] = []
const stores: JrStore[] = []
const controller: JrControllerActor = { kind: 'human-controller', id: 'test-walker' }

async function createStore(): Promise<JrStore> {
  const directory = await mkdtemp(join(tmpdir(), 'orca-jr-'))
  temporaryDirectories.push(directory)
  const store = new JrStore(join(directory, 'jr.sqlite'))
  stores.push(store)
  return store
}

afterEach(async () => {
  for (const store of stores.splice(0)) {
    store.close()
  }
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe('JrStore', () => {
  it('keeps Trellis planning artifacts in its database and requires a controller approval handoff', async () => {
    const store = await createStore()
    const card = store.createCard(
      {
        title: 'Make invite recovery actionable',
        description: 'Define the recovery path when an invitation is no longer valid.'
      },
      controller
    )

    const configured = store.updateCardConfiguration(
      card.id,
      { harness: 'codex', modelId: 'default' },
      controller
    )
    expect(configured.harness).toBe('codex')
    expect(configured.model?.id).toBe('default')

    const discussing = store.transition(card.id, 'begin-discussion', controller)
    expect(discussing.status).toBe('discussion')
    expect(discussing.artifacts.map((artifact) => artifact.path)).toContain(
      `tasks/${card.id}/discussion.md`
    )

    const planning = store.transition(card.id, 'begin-planning', controller)
    expect(planning.status).toBe('planning')
    expect(planning.artifacts.map((artifact) => artifact.path)).toEqual(
      expect.arrayContaining(['workflow.md', 'spec/jr-controller.md', `tasks/${card.id}/prd.md`])
    )

    const awaitingApproval = store.transition(card.id, 'request-execution-approval', controller)
    expect(awaitingApproval.status).toBe('pending_execution_approval')
    expect(awaitingApproval.events[0]).toMatchObject({
      kind: '等待执行审批',
      actor: 'human-controller:test-walker'
    })
  })

  it('does not start a discussion before a card is configured', async () => {
    const store = await createStore()
    const card = store.createCard({ title: 'Unconfigured idea' }, controller)

    expect(() => store.transition(card.id, 'begin-discussion', controller)).toThrow(
      '请先为卡片选择 Phase 1 harness 和模型。'
    )
  })

  it('retains card configuration and Trellis artifacts after reopening SQLite', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'orca-jr-reopen-'))
    temporaryDirectories.push(directory)
    const databasePath = join(directory, 'jr.sqlite')
    const store = new JrStore(databasePath)
    stores.push(store)
    const card = store.createCard({ title: 'Persist artifacts' }, controller)
    store.updateCardConfiguration(card.id, { harness: 'gemini', modelId: 'default' }, controller)
    store.transition(card.id, 'begin-discussion', controller)
    store.transition(card.id, 'begin-planning', controller)
    store.close()
    stores.splice(stores.indexOf(store), 1)

    const reopened = new JrStore(databasePath)
    stores.push(reopened)
    const restored = reopened.listBoard().cards.find((item) => item.id === card.id)

    expect(restored).toMatchObject({
      harness: 'gemini',
      model: { id: 'default' },
      status: 'planning'
    })
    expect(restored?.artifacts.map((artifact) => artifact.path)).toEqual(
      expect.arrayContaining([
        `tasks/${card.id}/discussion.md`,
        `tasks/${card.id}/prd.md`,
        'spec/jr-controller.md',
        'workflow.md'
      ])
    )
  })
})
