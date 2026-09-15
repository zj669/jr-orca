import {
  isJrCardPriority,
  isJrCardTransition,
  isJrDeliveryRecord,
  isJrHarness,
  isJrReviewSnapshot,
  type JrAgentLifecycleState,
  type JrCardTransition,
  type JrControllerActor,
  type JrCreateCardInput,
  type JrDeliveryRecord,
  type JrMergeIntoBaseInput,
  type JrRecordAgentSessionInput,
  type JrRecordWorktreeInput,
  type JrReviewSnapshot,
  type JrUpdateCardDetailsInput,
  type JrUpdateCardInput,
  type JrUpdateExecutionTargetInput
} from '../../shared/jr/jr-types'

export function isJrIpcRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}

export function requireJrIpcString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`JR ${field} is required.`)
  }
  return value.trim()
}

export function parseJrControllerActor(value: unknown): JrControllerActor {
  if (!isJrIpcRecord(value)) {
    throw new Error('JR controller actor is required.')
  }
  const kind = requireJrIpcString(value.kind, 'controller actor kind')
  if (kind !== 'human-controller' && kind !== 'master-controller') {
    throw new Error('JR actor must have controller capability.')
  }
  return { kind, id: requireJrIpcString(value.id, 'controller actor id') }
}

export function parseJrCreateCardInput(value: unknown): JrCreateCardInput {
  if (!isJrIpcRecord(value)) {
    throw new Error('JR card input is required.')
  }
  const description = value.description
  if (description !== undefined && typeof description !== 'string') {
    throw new Error('JR card description must be text.')
  }
  return {
    title: requireJrIpcString(value.title, 'card title'),
    ...(typeof description === 'string' ? { description } : {})
  }
}

export function parseJrConfigurationInput(value: unknown): JrUpdateCardInput {
  if (!isJrIpcRecord(value) || !isJrHarness(value.harness)) {
    throw new Error('JR Phase 1 harness is required.')
  }
  return {
    harness: value.harness,
    modelId: requireJrIpcString(value.modelId, 'model id')
  }
}

export function parseJrCardTransition(value: unknown): JrCardTransition {
  if (!isJrCardTransition(value)) {
    throw new Error('JR transition is not supported in this desktop slice.')
  }
  return value
}

export function parseJrExecutionTargetInput(value: unknown): JrUpdateExecutionTargetInput {
  if (!isJrIpcRecord(value)) {
    throw new Error('JR execution target is required.')
  }
  const setupDecision = value.setupDecision
  if (setupDecision !== 'inherit' && setupDecision !== 'run' && setupDecision !== 'skip') {
    throw new Error('JR setup policy is invalid.')
  }
  return {
    repositoryId: requireJrIpcString(value.repositoryId, 'repository id'),
    baseRef: requireJrIpcString(value.baseRef, 'base ref'),
    setupDecision
  }
}

export function parseJrWorktreeInput(value: unknown): JrRecordWorktreeInput {
  if (!isJrIpcRecord(value)) {
    throw new Error('JR worktree result is required.')
  }
  return {
    id: requireJrIpcString(value.id, 'worktree id'),
    path: requireJrIpcString(value.path, 'worktree path'),
    branch: requireJrIpcString(value.branch, 'worktree branch')
  }
}

export function parseJrAgentSessionInput(value: unknown): JrRecordAgentSessionInput {
  if (!isJrIpcRecord(value) || !isJrExecutionAgent(value.agent)) {
    throw new Error('JR execution agent is required.')
  }
  return {
    agent: value.agent,
    tabId: requireJrIpcString(value.tabId, 'agent tab id'),
    paneKey: requireJrIpcString(value.paneKey, 'agent pane key'),
    ptyId: requireJrIpcString(value.ptyId, 'agent pty id')
  }
}

export function parseJrAgentLifecycleState(value: unknown): JrAgentLifecycleState {
  if (value !== 'working' && value !== 'blocked' && value !== 'waiting' && value !== 'done') {
    throw new Error('JR agent lifecycle state is invalid.')
  }
  return value
}

export function parseJrExitCode(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new Error('JR agent exit code is invalid.')
  }
  return value
}

export function parseJrReviewSnapshot(value: unknown): JrReviewSnapshot {
  if (!isJrReviewSnapshot(value)) {
    throw new Error('JR review snapshot is invalid.')
  }
  return value
}

export function parseJrDeliveryRecord(value: unknown): JrDeliveryRecord {
  if (!isJrDeliveryRecord(value)) {
    throw new Error('JR delivery record is invalid.')
  }
  return value
}

export function parseJrMergeIntoBaseInput(value: unknown): JrMergeIntoBaseInput {
  if (!isJrIpcRecord(value)) {
    throw new Error('JR local merge input is required.')
  }
  const connectionId = value.connectionId
  if (connectionId !== undefined && typeof connectionId !== 'string') {
    throw new Error('JR merge connection id is invalid.')
  }
  return {
    baseWorktreePath: requireJrIpcString(value.baseWorktreePath, 'base worktree path'),
    branch: requireJrIpcString(value.branch ?? value.featureBranch, 'feature branch'),
    expectedBaseRef: requireJrIpcString(value.expectedBaseRef ?? value.baseRef, 'base ref'),
    ...(connectionId ? { connectionId } : {})
  }
}

export function parseJrCardDetailsInput(value: unknown): JrUpdateCardDetailsInput {
  if (!isJrIpcRecord(value)) {
    throw new Error('JR card details are required.')
  }
  const input: JrUpdateCardDetailsInput = {}
  if (value.description !== undefined) {
    if (typeof value.description !== 'string') {
      throw new Error('JR card description must be text.')
    }
    input.description = value.description
  }
  if (value.acceptance !== undefined) {
    if (typeof value.acceptance !== 'string') {
      throw new Error('JR acceptance must be text.')
    }
    input.acceptance = value.acceptance
  }
  if (value.priority !== undefined) {
    if (!isJrCardPriority(value.priority)) {
      throw new Error('JR 优先级必须是 p0–p3。')
    }
    input.priority = value.priority
  }
  return input
}

function isJrExecutionAgent(value: unknown): value is JrRecordAgentSessionInput['agent'] {
  return value === 'cursor' || value === 'claude' || value === 'codex' || value === 'gemini'
}
