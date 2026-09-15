import { getAgentSessionOptionCatalog } from '../agent-session-option-catalog'

export const JR_HARNESSES = ['cursorcli', 'claude', 'codex', 'gemini'] as const
export type JrHarness = (typeof JR_HARNESSES)[number]

export const JR_CARD_STATUSES = [
  'idea',
  'discussion',
  'planning',
  'pending_execution_approval',
  'creating_worktree',
  'executing',
  'verifying',
  'pending_merge_approval',
  'shipping',
  'merged',
  'blocked',
  'cancelled'
] as const
export type JrCardStatus = (typeof JR_CARD_STATUSES)[number]

export type JrModelChoice = {
  id: string
  label: string
  capabilitySource: 'orca-session-catalog'
}

export type JrExecutionTarget = {
  repositoryId: string | null
  baseRef: string | null
  setupDecision: 'inherit' | 'run' | 'skip'
}

export type JrWorktreeReference = {
  id: string
  path: string
  branch: string
}

export type JrAgentSession = {
  agent: 'cursor' | 'claude' | 'codex' | 'gemini'
  tabId: string
  paneKey: string
  ptyId: string
  status: 'working' | 'blocked' | 'waiting' | 'done' | null
}

export type JrExecutionState = JrExecutionTarget & {
  worktree: JrWorktreeReference | null
  worktreePhase: 'fetching' | 'creating' | null
  agentSession: JrAgentSession | null
}

export const JR_COMPARE_STATUSES = [
  'ready',
  'invalid-base',
  'unborn-head',
  'no-merge-base',
  'loading',
  'error'
] as const
export type JrCompareStatus = (typeof JR_COMPARE_STATUSES)[number]

export type JrReviewSnapshot = {
  worktreeId: string
  branch: string
  baseRef: string
  headOid: string | null
  mergeBase: string | null
  changedFiles: number
  commitsAhead: number
  commitsBehind: number
  uncommittedFiles: number
  conflicted: boolean
  compareStatus: JrCompareStatus
  capturedAt: string
}

export const JR_DELIVERY_METHODS = ['hosted-pr', 'local-base-merge'] as const
export type JrDeliveryMethod = (typeof JR_DELIVERY_METHODS)[number]

export type JrDeliveryRecord = {
  method: JrDeliveryMethod
  prNumber: number | null
  mergedInto: string
  headOid: string | null
}

export type JrShipRequest = {
  cardId: string
  title: string
  worktree: JrWorktreeReference
  repositoryId: string
  baseRef: string
  review: JrReviewSnapshot
}

export type JrMergeIntoBaseInput = {
  baseWorktreePath: string
  branch: string
  expectedBaseRef: string
  connectionId?: string
}

export type JrCard = {
  id: string
  title: string
  description: string
  status: JrCardStatus
  harness: JrHarness | null
  model: JrModelChoice | null
  execution: JrExecutionState
  review: JrReviewSnapshot | null
  delivery: JrDeliveryRecord | null
  createdAt: string
  updatedAt: string
  artifacts: JrArtifact[]
  events: JrEvent[]
}

export type JrArtifact = {
  id: string
  cardId: string
  path: string
  content: string
  version: number
  updatedAt: string
}

export type JrEvent = {
  id: string
  cardId: string
  kind: string
  detail: string
  actor: string
  createdAt: string
}

export type JrBoardSnapshot = {
  cards: JrCard[]
  harnesses: {
    id: JrHarness
    label: string
    models: JrModelChoice[]
  }[]
}

export type {
  JrActor,
  JrControllerActor,
  JrTaskAgentActor,
  JrTaskAgentTransition
} from './jr-actors'
export {
  isJrActor,
  isJrControllerActor,
  isJrTaskAgentTransition,
  JR_TASK_AGENT_TRANSITIONS
} from './jr-actors'

export type JrCreateCardInput = {
  title: string
  description?: string
}

export type JrUpdateCardInput = {
  harness: JrHarness
  modelId: string
}

export type JrUpdateExecutionTargetInput = {
  repositoryId: string
  baseRef: string
  setupDecision: JrExecutionTarget['setupDecision']
}

export type JrExecutionLaunchRequest = {
  cardId: string
  title: string
  harness: JrHarness
  model: JrModelChoice
  execution: {
    repositoryId: string
    baseRef: string
    setupDecision: JrExecutionTarget['setupDecision']
  }
  prompt: string
}

export type JrRecordWorktreeInput = JrWorktreeReference

export type JrRecordAgentSessionInput = Omit<JrAgentSession, 'status'>

export type JrAgentLifecycleState = NonNullable<JrAgentSession['status']>

export const JR_CARD_TRANSITIONS = [
  'begin-discussion',
  'begin-planning',
  'request-execution-approval'
] as const
export type JrCardTransition = (typeof JR_CARD_TRANSITIONS)[number]

export const JR_HARNESS_CATALOG: JrBoardSnapshot['harnesses'] = [
  {
    id: 'cursorcli',
    label: 'Cursor CLI',
    models: jrHarnessModels('cursor')
  },
  {
    id: 'claude',
    label: 'Claude Code',
    models: jrHarnessModels('claude')
  },
  {
    id: 'codex',
    label: 'Codex',
    models: jrHarnessModels('codex')
  },
  {
    id: 'gemini',
    label: 'Gemini',
    models: jrHarnessModels('gemini')
  }
]

export function isJrHarness(value: unknown): value is JrHarness {
  return typeof value === 'string' && JR_HARNESSES.some((harness) => harness === value)
}

export function isJrCardTransition(value: unknown): value is JrCardTransition {
  return typeof value === 'string' && JR_CARD_TRANSITIONS.some((transition) => transition === value)
}

export function isJrCompareStatus(value: unknown): value is JrCompareStatus {
  return typeof value === 'string' && JR_COMPARE_STATUSES.some((status) => status === value)
}

export function isJrDeliveryMethod(value: unknown): value is JrDeliveryMethod {
  return typeof value === 'string' && JR_DELIVERY_METHODS.some((method) => method === value)
}

export function isJrReviewSnapshot(value: unknown): value is JrReviewSnapshot {
  if (!isJrRecord(value)) {
    return false
  }
  return (
    typeof value.worktreeId === 'string' &&
    typeof value.branch === 'string' &&
    typeof value.baseRef === 'string' &&
    (value.headOid === null || typeof value.headOid === 'string') &&
    (value.mergeBase === null || typeof value.mergeBase === 'string') &&
    typeof value.changedFiles === 'number' &&
    typeof value.commitsAhead === 'number' &&
    typeof value.commitsBehind === 'number' &&
    typeof value.uncommittedFiles === 'number' &&
    typeof value.conflicted === 'boolean' &&
    isJrCompareStatus(value.compareStatus) &&
    typeof value.capturedAt === 'string'
  )
}

export function isJrDeliveryRecord(value: unknown): value is JrDeliveryRecord {
  if (!isJrRecord(value)) {
    return false
  }
  return (
    isJrDeliveryMethod(value.method) &&
    (value.prNumber === null || typeof value.prNumber === 'number') &&
    typeof value.mergedInto === 'string' &&
    (value.headOid === null || typeof value.headOid === 'string')
  )
}

function isJrRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}

function jrHarnessModels(agent: 'cursor' | 'claude' | 'codex' | 'gemini'): JrModelChoice[] {
  const catalog = getAgentSessionOptionCatalog(agent)
  return (
    catalog?.models.map((model) => ({
      id: model.id,
      label: model.label,
      capabilitySource: 'orca-session-catalog'
    })) ?? []
  )
}
