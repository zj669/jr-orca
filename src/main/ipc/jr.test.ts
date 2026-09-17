import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { JrStore } from '../jr/jr-store'

type IpcHandler = (...args: unknown[]) => unknown

const { handlers, ipcHandleMock } = vi.hoisted(() => ({
  handlers: new Map<string, IpcHandler>(),
  ipcHandleMock: vi.fn((channel: string, handler: IpcHandler) => {
    handlers.set(channel, handler)
  })
}))

vi.mock('electron', () => ({
  app: {
    getPath: () => '/unused-in-ipc-test',
    getAppPath: () => '/unused-in-ipc-test',
    isPackaged: false
  },
  ipcMain: { handle: ipcHandleMock }
}))

import { registerJrHandlers } from './jr'

const temporaryDirectories: string[] = []
const stores: JrStore[] = []

async function createStore(): Promise<JrStore> {
  const directory = await mkdtemp(join(tmpdir(), 'orca-jr-ipc-'))
  temporaryDirectories.push(directory)
  const store = new JrStore(join(directory, 'jr.sqlite'))
  stores.push(store)
  return store
}

function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  const handler = handlers.get(channel)
  if (!handler) {
    throw new Error(`Missing IPC handler: ${channel}`)
  }
  return Promise.resolve(handler(...args))
}

beforeEach(() => {
  handlers.clear()
  ipcHandleMock.mockClear()
})

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

describe('JR IPC', () => {
  it('persists controller-approved artifacts and blocks task agents from execution approval', async () => {
    const store = await createStore()
    registerJrHandlers(store)

    expect(ipcHandleMock).toHaveBeenCalledTimes(25)

    await invoke(
      'jr:createCard',
      undefined,
      { title: 'Plan a recovery path', description: 'Keep recovery specific and testable.' },
      { kind: 'human-controller', id: 'walker' }
    )
    const card = store.listBoard().cards.find((item) => item.title === 'Plan a recovery path')
    if (!card) {
      throw new Error('Expected the IPC-created JR card.')
    }

    await invoke(
      'jr:updateCardConfiguration',
      undefined,
      card.id,
      { harness: 'claude', modelId: 'sonnet' },
      { kind: 'human-controller', id: 'walker' }
    )
    await invoke(
      'jr:updateCardReviewConfiguration',
      undefined,
      card.id,
      { harness: 'codex', modelId: 'gpt-5.6-sol' },
      { kind: 'human-controller', id: 'walker' }
    )
    await invoke('jr:transitionCard', undefined, card.id, 'begin-discussion', {
      kind: 'human-controller',
      id: 'walker'
    })
    await invoke('jr:transitionCard', undefined, card.id, 'begin-planning', {
      kind: 'master-controller',
      id: 'delivery-master'
    })
    await invoke(
      'jr:updateCardExecutionTarget',
      undefined,
      card.id,
      { repositoryId: 'repo-1', baseRef: 'main', setupDecision: 'inherit' },
      { kind: 'human-controller', id: 'walker' }
    )
    await invoke(
      'jr:updateCardDetails',
      undefined,
      card.id,
      {
        acceptance: 'Recovery is specific, testable, and stays in the approved boundary.',
        priority: 'p1'
      },
      { kind: 'human-controller', id: 'walker' }
    )

    expect(() =>
      invoke('jr:transitionCard', undefined, card.id, 'request-execution-approval', {
        kind: 'task-agent',
        id: 'claude-worker'
      })
    ).toThrow('JR actor must have controller capability.')

    expect(store.listBoard().cards.find((item) => item.id === card.id)?.status).toBe('planning')

    await invoke('jr:transitionCard', undefined, card.id, 'request-execution-approval', {
      kind: 'human-controller',
      id: 'walker'
    })

    const persisted = store.listBoard().cards.find((item) => item.id === card.id)
    expect(persisted).toMatchObject({
      status: 'pending_execution_approval',
      harness: 'claude',
      model: { id: 'sonnet' },
      reviewHarness: 'codex',
      reviewModel: { id: 'gpt-5.6-sol' }
    })
    expect(persisted?.artifacts.map((artifact) => artifact.path)).toEqual(
      expect.arrayContaining([
        `tasks/${card.id}/discussion.md`,
        `tasks/${card.id}/prd.md`,
        `tasks/${card.id}/design.md`,
        `tasks/${card.id}/implement.md`
      ])
    )
    expect(persisted?.events[0]).toMatchObject({
      kind: '等待执行审批',
      actor: 'human-controller:walker'
    })
  })

  it('requires controller capability and validates native worktree lifecycle payloads', async () => {
    const store = await createStore()
    registerJrHandlers(store)
    const card = store.createCard(
      {
        title: 'Launch validation',
        description: 'Define the recovery path when an invitation is no longer valid.'
      },
      { kind: 'human-controller', id: 'walker' }
    )
    store.updateCardConfiguration(
      card.id,
      { harness: 'codex', modelId: 'gpt-5.6-sol' },
      {
        kind: 'human-controller',
        id: 'walker'
      }
    )
    store.updateCardExecutionTarget(
      card.id,
      { repositoryId: 'repo-1', baseRef: 'main', setupDecision: 'inherit' },
      { kind: 'human-controller', id: 'walker' }
    )
    store.updateCardDetails(
      card.id,
      {
        acceptance: 'Recovery is specific, testable, and stays in the approved boundary.',
        priority: 'p1'
      },
      { kind: 'human-controller', id: 'walker' }
    )
    store.transition(card.id, 'begin-discussion', { kind: 'human-controller', id: 'walker' })
    store.transition(card.id, 'begin-planning', { kind: 'human-controller', id: 'walker' })
    store.transition(card.id, 'request-execution-approval', {
      kind: 'human-controller',
      id: 'walker'
    })

    expect(() =>
      invoke('jr:prepareExecution', undefined, card.id, { kind: 'task-agent', id: 'worker' })
    ).toThrow('JR actor must have controller capability.')

    await invoke('jr:prepareExecution', undefined, card.id, {
      kind: 'human-controller',
      id: 'walker'
    })
    await invoke(
      'jr:recordWorktreeCreated',
      undefined,
      card.id,
      { id: 'repo-1::/tmp/jr', path: '/tmp/jr', branch: 'jr/launch-validation' },
      { kind: 'human-controller', id: 'walker' }
    )
    await invoke(
      'jr:recordAgentStarted',
      undefined,
      card.id,
      { agent: 'codex', tabId: 'tab-1', paneKey: 'tab-1:pane-1', ptyId: 'pty-1' },
      { kind: 'human-controller', id: 'walker' }
    )
    await invoke('jr:recordAgentStatus', undefined, card.id, 'blocked', {
      kind: 'human-controller',
      id: 'walker'
    })

    expect(store.listBoard().cards.find((item) => item.id === card.id)).toMatchObject({
      status: 'blocked',
      execution: {
        worktree: { branch: 'jr/launch-validation' },
        agentSession: { agent: 'codex', status: 'blocked' }
      }
    })
  })

  it('keeps merge approval on the controller and validates the review snapshot', async () => {
    const store = await createStore()
    registerJrHandlers(store)
    const card = store.createCard(
      {
        title: 'Review validation',
        description: 'Define the recovery path when an invitation is no longer valid.'
      },
      { kind: 'human-controller', id: 'walker' }
    )
    store.updateCardConfiguration(
      card.id,
      { harness: 'claude', modelId: 'sonnet' },
      { kind: 'human-controller', id: 'walker' }
    )
    store.updateCardExecutionTarget(
      card.id,
      { repositoryId: 'repo-1', baseRef: 'main', setupDecision: 'inherit' },
      { kind: 'human-controller', id: 'walker' }
    )
    store.updateCardDetails(
      card.id,
      {
        acceptance: 'Recovery is specific, testable, and stays in the approved boundary.',
        priority: 'p1'
      },
      { kind: 'human-controller', id: 'walker' }
    )
    store.transition(card.id, 'begin-discussion', { kind: 'human-controller', id: 'walker' })
    store.transition(card.id, 'begin-planning', { kind: 'human-controller', id: 'walker' })
    store.transition(card.id, 'request-execution-approval', {
      kind: 'human-controller',
      id: 'walker'
    })
    store.prepareExecution(card.id, { kind: 'human-controller', id: 'walker' })
    store.recordWorktreeCreated(
      card.id,
      { id: 'repo-1::/tmp/jr', path: '/tmp/jr', branch: 'jr/review' },
      { kind: 'human-controller', id: 'walker' }
    )
    store.recordAgentStarted(
      card.id,
      { agent: 'claude', tabId: 'tab-1', paneKey: 'tab-1:pane-1', ptyId: 'pty-1' },
      { kind: 'human-controller', id: 'walker' }
    )

    expect(() =>
      invoke(
        'jr:requestReview',
        undefined,
        card.id,
        { changedFiles: 1 },
        {
          kind: 'human-controller',
          id: 'walker'
        }
      )
    ).toThrow('JR review snapshot is invalid.')

    await invoke(
      'jr:requestReview',
      undefined,
      card.id,
      {
        worktreeId: 'repo-1::/tmp/jr',
        branch: 'jr/review',
        baseRef: 'main',
        headOid: 'abc',
        mergeBase: 'def',
        changedFiles: 2,
        commitsAhead: 1,
        commitsBehind: 0,
        uncommittedFiles: 0,
        conflicted: false,
        compareStatus: 'ready',
        capturedAt: '2026-01-01T00:00:00.000Z'
      },
      { kind: 'human-controller', id: 'walker' }
    )

    expect(() =>
      invoke('jr:passVerification', undefined, card.id, { kind: 'task-agent', id: 'worker' })
    ).toThrow('JR actor must have controller capability.')

    await invoke('jr:passVerification', undefined, card.id, {
      kind: 'human-controller',
      id: 'walker'
    })
    expect(store.listBoard().cards.find((item) => item.id === card.id)?.status).toBe(
      'pending_merge_approval'
    )
  })
})
