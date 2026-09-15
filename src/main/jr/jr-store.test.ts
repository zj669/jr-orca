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
    const targeted = store.updateCardExecutionTarget(
      card.id,
      { repositoryId: 'repo-1', baseRef: 'main', setupDecision: 'run' },
      controller
    )
    expect(targeted.execution).toMatchObject({
      repositoryId: 'repo-1',
      baseRef: 'main',
      setupDecision: 'run'
    })

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
    store.updateCardExecutionTarget(
      card.id,
      { repositoryId: 'repo-1', baseRef: 'main', setupDecision: 'inherit' },
      controller
    )
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

  it('persists the approved execution handoff and blocks only after Orca reports a failure', async () => {
    const store = await createStore()
    const card = store.createCard({ title: 'Create a real worktree' }, controller)
    store.updateCardConfiguration(card.id, { harness: 'cursorcli', modelId: 'default' }, controller)
    store.updateCardExecutionTarget(
      card.id,
      { repositoryId: 'repo-orca', baseRef: 'main', setupDecision: 'skip' },
      controller
    )
    store.transition(card.id, 'begin-discussion', controller)
    store.transition(card.id, 'begin-planning', controller)
    store.transition(card.id, 'request-execution-approval', controller)

    const launch = store.prepareExecution(card.id, controller)
    expect(launch).toMatchObject({
      harness: 'cursorcli',
      execution: {
        repositoryId: 'repo-orca',
        baseRef: 'main',
        setupDecision: 'skip'
      }
    })
    expect(launch.prompt).toContain(`tasks/${card.id}/prd.md`)
    expect(store.listBoard().cards.find((item) => item.id === card.id)?.status).toBe(
      'creating_worktree'
    )

    store.recordWorktreeProgress(card.id, 'fetching', controller)
    store.recordWorktreeCreated(
      card.id,
      { id: 'repo-orca::/tmp/jr-worktree', path: '/tmp/jr-worktree', branch: 'jr/worktree' },
      controller
    )
    const executing = store.recordAgentStarted(
      card.id,
      {
        agent: 'cursor',
        tabId: 'tab-jr',
        paneKey: 'tab-jr:pane-jr',
        ptyId: 'pty-jr'
      },
      controller
    )

    expect(executing).toMatchObject({
      status: 'executing',
      execution: {
        worktree: {
          id: 'repo-orca::/tmp/jr-worktree',
          path: '/tmp/jr-worktree',
          branch: 'jr/worktree'
        },
        agentSession: {
          agent: 'cursor',
          tabId: 'tab-jr',
          paneKey: 'tab-jr:pane-jr',
          ptyId: 'pty-jr',
          status: 'working'
        }
      }
    })

    const blocked = store.recordAgentStatus(card.id, 'blocked', controller)
    expect(blocked.status).toBe('blocked')
    expect(blocked.events[0]).toMatchObject({
      kind: 'Harness 报告受阻',
      actor: 'human-controller:test-walker'
    })
  })

  it('requires a persisted execution target before controller approval', async () => {
    const store = await createStore()
    const card = store.createCard({ title: 'Missing execution target' }, controller)
    store.updateCardConfiguration(card.id, { harness: 'claude', modelId: 'default' }, controller)
    store.transition(card.id, 'begin-discussion', controller)
    store.transition(card.id, 'begin-planning', controller)

    expect(() => store.transition(card.id, 'request-execution-approval', controller)).toThrow(
      '请先为卡片设置 仓库。'
    )
  })
})
