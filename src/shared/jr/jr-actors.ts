export type JrControllerActor = {
  kind: 'human-controller' | 'master-controller'
  id: string
}

export type JrTaskAgentActor = {
  kind: 'task-agent'
  id: string
}

export type JrActor = JrControllerActor | JrTaskAgentActor

export const JR_TASK_AGENT_TRANSITIONS = [
  'begin-discussion',
  'begin-planning',
  'request-review'
] as const
export type JrTaskAgentTransition = (typeof JR_TASK_AGENT_TRANSITIONS)[number]

export function isJrTaskAgentTransition(value: unknown): value is JrTaskAgentTransition {
  return (
    typeof value === 'string' &&
    JR_TASK_AGENT_TRANSITIONS.some((transition) => transition === value)
  )
}

export function isJrActor(value: unknown): value is JrActor {
  if (!isActorRecord(value) || typeof value.id !== 'string' || value.id.trim().length === 0) {
    return false
  }
  return (
    value.kind === 'human-controller' ||
    value.kind === 'master-controller' ||
    value.kind === 'task-agent'
  )
}

export function isJrControllerActor(value: unknown): value is JrControllerActor {
  return isJrActor(value) && value.kind !== 'task-agent'
}

function isActorRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}
