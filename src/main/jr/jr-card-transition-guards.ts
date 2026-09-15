import type { JrCard, JrCardStatus, JrControllerActor } from '../../shared/jr/jr-types'

export function requireJrController(actor: JrControllerActor): void {
  if (
    (actor.kind !== 'human-controller' && actor.kind !== 'master-controller') ||
    actor.id.trim().length === 0
  ) {
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
