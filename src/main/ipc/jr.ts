import { ipcMain } from 'electron'
import {
  isJrCardTransition,
  isJrHarness,
  type JrCardTransition,
  type JrControllerActor,
  type JrCreateCardInput,
  type JrUpdateCardInput
} from '../../shared/jr/jr-types'
import { getJrStore } from '../jr/jr-store'

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

export function registerJrHandlers(): void {
  ipcMain.handle('jr:listBoard', () => getJrStore().listBoard())
  ipcMain.handle('jr:createCard', (_event, rawInput: unknown, rawActor: unknown) =>
    getJrStore().createCard(parseCreateCardInput(rawInput), parseActor(rawActor))
  )
  ipcMain.handle(
    'jr:updateCardConfiguration',
    (_event, cardId: unknown, rawInput: unknown, rawActor: unknown) =>
      getJrStore().updateCardConfiguration(
        requireString(cardId, 'card id'),
        parseConfigurationInput(rawInput),
        parseActor(rawActor)
      )
  )
  ipcMain.handle(
    'jr:transitionCard',
    (_event, cardId: unknown, rawTransition: unknown, rawActor: unknown) =>
      getJrStore().transition(
        requireString(cardId, 'card id'),
        parseTransition(rawTransition),
        parseActor(rawActor)
      )
  )
}
