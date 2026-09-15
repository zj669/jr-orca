import type { JrActor, JrCard, JrCardStatus, JrControllerActor } from '../../shared/jr/jr-types'

export function requireJrActor(actor: JrActor): void {
  if (actor.id.trim().length === 0) {
    throw new Error('JR actor id is required.')
  }
}

export function requireJrController(actor: JrActor): asserts actor is JrControllerActor {
  requireJrActor(actor)
  if (actor.kind !== 'human-controller' && actor.kind !== 'master-controller') {
    throw new Error('该操作需要具备 controller 能力的 actor。')
  }
}

export function requireJrAiConfiguration(card: JrCard): void {
  if (!card.harness || !card.model) {
    throw new Error('请先为卡片选择 Phase 1 harness 和模型。')
  }
}

export function requireJrCardState(card: JrCard, expected: JrCardStatus, action: string): void {
  if (card.status !== expected) {
    throw new Error(`卡片必须处于 ${expected} 才能${action}。`)
  }
}
