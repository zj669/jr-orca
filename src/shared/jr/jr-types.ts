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
  capabilitySource: 'orca-default'
}

export type JrCard = {
  id: string
  title: string
  description: string
  status: JrCardStatus
  harness: JrHarness | null
  model: JrModelChoice | null
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
  harnesses: Array<{
    id: JrHarness
    label: string
    models: JrModelChoice[]
  }>
}

export type JrControllerActor = {
  kind: 'human-controller' | 'master-controller'
  id: string
}

export type JrCreateCardInput = {
  title: string
  description?: string
}

export type JrUpdateCardInput = {
  harness: JrHarness
  modelId: string
}

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
    models: [{ id: 'default', label: 'Orca 默认模型', capabilitySource: 'orca-default' }]
  },
  {
    id: 'claude',
    label: 'Claude Code',
    models: [{ id: 'default', label: 'Orca 默认模型', capabilitySource: 'orca-default' }]
  },
  {
    id: 'codex',
    label: 'Codex',
    models: [{ id: 'default', label: 'Orca 默认模型', capabilitySource: 'orca-default' }]
  },
  {
    id: 'gemini',
    label: 'Gemini',
    models: [{ id: 'default', label: 'Orca 默认模型', capabilitySource: 'orca-default' }]
  }
]

export function isJrHarness(value: unknown): value is JrHarness {
  return typeof value === 'string' && JR_HARNESSES.some((harness) => harness === value)
}

export function isJrCardTransition(value: unknown): value is JrCardTransition {
  return (
    typeof value === 'string' && JR_CARD_TRANSITIONS.some((transition) => transition === value)
  )
}
