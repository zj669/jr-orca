import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { JrActor, JrControllerActor } from '../../shared/jr/jr-types'
import { JrStore } from './jr-store'
import { JrTrellisToolHost } from './jr-trellis-tools'

const temporaryDirectories: string[] = []
const stores: JrStore[] = []
const controller: JrControllerActor = { kind: 'human-controller', id: 'test-walker' }
const worker: JrActor = { kind: 'task-agent', id: 'codex:jr-card' }

async function createStore(): Promise<JrStore> {
  const directory = await mkdtemp(join(tmpdir(), 'orca-jr-tools-'))
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

describe('JrTrellisToolHost', () => {
  it('reads workflow, specs, and task artifacts from SQLite', async () => {
    const store = await createStore()
    const card = await reachPlanning(store)
    const host = new JrTrellisToolHost(store, { cardId: card.id, actor: worker })

    expect(host.call('jr_workflow_get', {})).toEqual(
      expect.objectContaining({
        canonicalStore: 'jr-sqlite',
        trellisProjection: 'optional-read-only',
        workflow: expect.objectContaining({ path: 'workflow.md', version: 1 })
      })
    )
    expect(host.call('jr_specs_list', {})).toEqual({
      specs: [expect.objectContaining({ path: 'spec/jr-controller.md' })]
    })
    expect(host.call('jr_specs_get', { path: 'spec/jr-controller.md' })).toEqual({
      spec: expect.objectContaining({ content: expect.stringContaining('JR MCP tools') })
    })
    expect(host.call('jr_task_get', {})).toEqual(
      expect.objectContaining({
        artifacts: expect.arrayContaining([
          expect.objectContaining({ path: `tasks/${card.id}/prd.md` }),
          expect.objectContaining({ path: `tasks/${card.id}/design.md` }),
          expect.objectContaining({ path: `tasks/${card.id}/implement.md` })
        ])
      })
    )
  })

  it('versions and audits artifact upserts and journal/research appends', async () => {
    const store = await createStore()
    const card = await reachPlanning(store)
    const host = new JrTrellisToolHost(store, { cardId: card.id, actor: worker })
    const path = `tasks/${card.id}/prd.md`

    expect(
      host.call('jr_artifact_upsert', {
        path,
        content: '# Updated PRD\n\nKeep recovery specific.\n'
      })
    ).toEqual({ artifact: expect.objectContaining({ version: 2, path }) })
    expect(
      host.call('jr_artifact_upsert', {
        path,
        content: '# Updated PRD\n\nKeep recovery specific and testable.\n'
      })
    ).toEqual({ artifact: expect.objectContaining({ version: 3 }) })
    expect(host.call('jr_artifacts_list', {})).toEqual({
      artifacts: expect.arrayContaining([expect.objectContaining({ path, version: 3 })])
    })
    expect(host.call('jr_journal_append', { entry: 'Chose SQLite as the write source.' })).toEqual({
      artifact: expect.objectContaining({
        path: `tasks/${card.id}/journal.md`,
        content: expect.stringContaining('Chose SQLite as the write source.')
      })
    })
    expect(host.call('jr_research_append', { entry: 'Trellis files are a projection.' })).toEqual({
      artifact: expect.objectContaining({
        content: expect.stringContaining('Trellis files are a projection.')
      })
    })

    const persisted = store.readCard(card.id)
    expect(persisted.events.some((event) => event.kind === 'artifact.upserted')).toBe(true)
    expect(persisted.events[0]?.actor).toBe('task-agent:codex:jr-card')
  })

  it('lets task agents request review but not execution, worktree, ship, or merge promotions', async () => {
    const store = await createStore()
    const discussing = await reachDiscussion(store)
    const host = new JrTrellisToolHost(store, { cardId: discussing.id, actor: worker })

    expect(host.call('jr_card_request_transition', { transition: 'begin-planning' })).toEqual({
      requested: 'begin-planning',
      card: expect.objectContaining({ status: 'planning' })
    })
    expect(() =>
      host.call('jr_card_request_transition', { transition: 'request-execution-approval' })
    ).toThrow('待批准执行')
    expect(() =>
      host.call('jr_card_request_transition', { transition: 'creating_worktree' })
    ).toThrow('待批准执行')
    expect(store.readCard(discussing.id).status).toBe('planning')

    await reachExecuting(store, discussing.id)
    const executingHost = new JrTrellisToolHost(store, { cardId: discussing.id, actor: worker })
    expect(
      executingHost.call('jr_card_request_transition', { transition: 'request-review' })
    ).toEqual({
      requested: 'request-review',
      card: expect.objectContaining({ status: 'executing' })
    })
    expect(store.readCard(discussing.id).events[0]).toMatchObject({
      kind: 'Harness 请求验证',
      actor: 'task-agent:codex:jr-card'
    })
  })

  it('rejects .trellis paths and unsanctioned writes', async () => {
    const store = await createStore()
    const card = await reachPlanning(store)
    const host = new JrTrellisToolHost(store, { cardId: card.id, actor: worker })

    expect(() =>
      host.call('jr_artifact_upsert', { path: '.trellis/workflow.md', content: 'nope' })
    ).toThrow('.trellis')
    expect(() =>
      host.call('jr_artifact_upsert', {
        path: `tasks/${card.id}/../secret.md`,
        content: 'nope'
      })
    ).toThrow('not writable')
    expect(
      store.readCard(card.id).artifacts.some((artifact) => artifact.path.includes('.trellis'))
    ).toBe(false)
  })
})

async function reachDiscussion(store: JrStore) {
  const card = store.createCard({ title: 'Plan recovery with tools' }, controller)
  store.updateCardConfiguration(card.id, { harness: 'codex', modelId: 'gpt-5.6-sol' }, controller)
  store.updateCardExecutionTarget(
    card.id,
    { repositoryId: 'repo-1', baseRef: 'main', setupDecision: 'skip' },
    controller
  )
  return store.transition(card.id, 'begin-discussion', controller)
}

async function reachPlanning(store: JrStore) {
  const card = await reachDiscussion(store)
  return store.transition(card.id, 'begin-planning', controller)
}

async function reachExecuting(store: JrStore, cardId: string) {
  store.transition(cardId, 'request-execution-approval', controller)
  store.prepareExecution(cardId, controller)
  store.recordWorktreeCreated(
    cardId,
    { id: 'repo-1::/tmp/jr-tools', path: '/tmp/jr-tools', branch: 'jr/tools' },
    controller
  )
  return store.recordAgentStarted(
    cardId,
    { agent: 'codex', tabId: 'tab-1', paneKey: 'tab-1:pane-1', ptyId: 'pty-1' },
    controller
  )
}
