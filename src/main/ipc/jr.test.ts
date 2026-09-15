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
  app: { getPath: () => '/unused-in-ipc-test' },
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

    expect(ipcHandleMock).toHaveBeenCalledTimes(4)

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
      { harness: 'claude', modelId: 'default' },
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
      model: { id: 'default' }
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
})
