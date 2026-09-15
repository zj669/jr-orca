import { ipcMain } from 'electron'
import {
  type JrAgentLifecycleState,
  isJrCardTransition,
  isJrHarness,
  type JrRecordAgentSessionInput,
  type JrRecordWorktreeInput,
  type JrCardTransition,
  type JrControllerActor,
  type JrCreateCardInput,
  type JrUpdateCardInput,
  type JrUpdateExecutionTargetInput
} from '../../shared/jr/jr-types'
import { getJrStore, type JrStore } from '../jr/jr-store'

type JrHandlerStore = Pick<
  JrStore,
  | 'listBoard'
  | 'createCard'
  | 'updateCardConfiguration'
  | 'updateCardExecutionTarget'
  | 'transition'
  | 'prepareExecution'
  | 'recordWorktreeCreated'
  | 'recordWorktreeProgress'
  | 'recordAgentStarted'
  | 'recordAgentStatus'
  | 'recordAgentExit'
  | 'blockExecution'
>

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`JR ${field} is required.`)
  }
  return value.trim()
}

function parseActor(value: unknown): JrControllerActor {
  if (!isRecord(value)) {
    throw new Error('JR controller actor is required.')
  }
  const kind = requireString(value.kind, 'controller actor kind')
  if (kind !== 'human-controller' && kind !== 'master-controller') {
    throw new Error('JR actor must have controller capability.')
  }
  return { kind, id: requireString(value.id, 'controller actor id') }
}

function parseCreateCardInput(value: unknown): JrCreateCardInput {
  if (!isRecord(value)) {
    throw new Error('JR card input is required.')
  }
  const description = value.description
  if (description !== undefined && typeof description !== 'string') {
    throw new Error('JR card description must be text.')
  }
  return {
    title: requireString(value.title, 'card title'),
    ...(typeof description === 'string' ? { description } : {})
  }
}

function parseConfigurationInput(value: unknown): JrUpdateCardInput {
  if (!isRecord(value) || !isJrHarness(value.harness)) {
    throw new Error('JR Phase 1 harness is required.')
  }
  return {
    harness: value.harness,
    modelId: requireString(value.modelId, 'model id')
  }
}

function parseTransition(value: unknown): JrCardTransition {
  if (!isJrCardTransition(value)) {
    throw new Error('JR transition is not supported in this desktop slice.')
  }
  return value
}

function parseExecutionTargetInput(value: unknown): JrUpdateExecutionTargetInput {
  if (!isRecord(value)) {
    throw new Error('JR execution target is required.')
  }
  const setupDecision = value.setupDecision
  if (setupDecision !== 'inherit' && setupDecision !== 'run' && setupDecision !== 'skip') {
    throw new Error('JR setup policy is invalid.')
  }
  return {
    repositoryId: requireString(value.repositoryId, 'repository id'),
    baseRef: requireString(value.baseRef, 'base ref'),
    setupDecision
  }
}

function parseWorktreeInput(value: unknown): JrRecordWorktreeInput {
  if (!isRecord(value)) {
    throw new Error('JR worktree result is required.')
  }
  return {
    id: requireString(value.id, 'worktree id'),
    path: requireString(value.path, 'worktree path'),
    branch: requireString(value.branch, 'worktree branch')
  }
}

function parseAgentSessionInput(value: unknown): JrRecordAgentSessionInput {
  if (!isRecord(value) || !isJrExecutionAgent(value.agent)) {
    throw new Error('JR execution agent is required.')
  }
  return {
    agent: value.agent,
    tabId: requireString(value.tabId, 'agent tab id'),
    paneKey: requireString(value.paneKey, 'agent pane key'),
    ptyId: requireString(value.ptyId, 'agent pty id')
  }
}

function parseAgentLifecycleState(value: unknown): JrAgentLifecycleState {
  if (!isJrAgentLifecycleState(value)) {
    throw new Error('JR agent lifecycle state is invalid.')
  }
  return value
}

function parseExitCode(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new Error('JR agent exit code is invalid.')
  }
  return value
}

function isJrExecutionAgent(value: unknown): value is JrRecordAgentSessionInput['agent'] {
  return value === 'cursor' || value === 'claude' || value === 'codex' || value === 'gemini'
}

function isJrAgentLifecycleState(value: unknown): value is JrAgentLifecycleState {
  return value === 'working' || value === 'blocked' || value === 'waiting' || value === 'done'
}

export function registerJrHandlers(store: JrHandlerStore = getJrStore()): void {
  ipcMain.handle('jr:listBoard', () => store.listBoard())
  ipcMain.handle('jr:createCard', (_event, rawInput: unknown, rawActor: unknown) =>
    store.createCard(parseCreateCardInput(rawInput), parseActor(rawActor))
  )
  ipcMain.handle(
    'jr:updateCardConfiguration',
    (_event, cardId: unknown, rawInput: unknown, rawActor: unknown) =>
      store.updateCardConfiguration(
        requireString(cardId, 'card id'),
        parseConfigurationInput(rawInput),
        parseActor(rawActor)
      )
  )
  ipcMain.handle(
    'jr:updateCardExecutionTarget',
    (_event, cardId: unknown, rawInput: unknown, rawActor: unknown) =>
      store.updateCardExecutionTarget(
        requireString(cardId, 'card id'),
        parseExecutionTargetInput(rawInput),
        parseActor(rawActor)
      )
  )
  ipcMain.handle(
    'jr:transitionCard',
    (_event, cardId: unknown, rawTransition: unknown, rawActor: unknown) =>
      store.transition(
        requireString(cardId, 'card id'),
        parseTransition(rawTransition),
        parseActor(rawActor)
      )
  )
  ipcMain.handle('jr:prepareExecution', (_event, cardId: unknown, rawActor: unknown) =>
    store.prepareExecution(requireString(cardId, 'card id'), parseActor(rawActor))
  )
  ipcMain.handle(
    'jr:recordWorktreeCreated',
    (_event, cardId: unknown, rawInput: unknown, rawActor: unknown) =>
      store.recordWorktreeCreated(
        requireString(cardId, 'card id'),
        parseWorktreeInput(rawInput),
        parseActor(rawActor)
      )
  )
  ipcMain.handle(
    'jr:recordWorktreeProgress',
    (_event, cardId: unknown, rawPhase: unknown, rawActor: unknown) => {
      if (rawPhase !== 'fetching' && rawPhase !== 'creating') {
        throw new Error('JR worktree progress phase is invalid.')
      }
      return store.recordWorktreeProgress(
        requireString(cardId, 'card id'),
        rawPhase,
        parseActor(rawActor)
      )
    }
  )
  ipcMain.handle(
    'jr:recordAgentStarted',
    (_event, cardId: unknown, rawInput: unknown, rawActor: unknown) =>
      store.recordAgentStarted(
        requireString(cardId, 'card id'),
        parseAgentSessionInput(rawInput),
        parseActor(rawActor)
      )
  )
  ipcMain.handle(
    'jr:recordAgentStatus',
    (_event, cardId: unknown, rawStatus: unknown, rawActor: unknown) =>
      store.recordAgentStatus(
        requireString(cardId, 'card id'),
        parseAgentLifecycleState(rawStatus),
        parseActor(rawActor)
      )
  )
  ipcMain.handle(
    'jr:recordAgentExit',
    (_event, cardId: unknown, rawCode: unknown, rawActor: unknown) =>
      store.recordAgentExit(
        requireString(cardId, 'card id'),
        parseExitCode(rawCode),
        parseActor(rawActor)
      )
  )
  ipcMain.handle(
    'jr:blockExecution',
    (_event, cardId: unknown, rawReason: unknown, rawActor: unknown) =>
      store.blockExecution(
        requireString(cardId, 'card id'),
        requireString(rawReason, 'execution failure reason'),
        parseActor(rawActor)
      )
  )
}
