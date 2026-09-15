import { ipcMain } from 'electron'
import type { JrStore } from '../jr/jr-store-access'
import {
  parseJrCardDetailsInput,
  parseJrControllerActor,
  requireJrIpcString
} from './jr-ipc-payloads'

type JrLifecycleHandlerStore = Pick<
  JrStore,
  'updateCardDetails' | 'rejectExecutionApproval' | 'resumeBlocked'
>

export function registerJrLifecycleHandlers(store: JrLifecycleHandlerStore): void {
  ipcMain.handle(
    'jr:updateCardDetails',
    (_event, cardId: unknown, rawInput: unknown, rawActor: unknown) =>
      store.updateCardDetails(
        requireJrIpcString(cardId, 'card id'),
        parseJrCardDetailsInput(rawInput),
        parseJrControllerActor(rawActor)
      )
  )
  ipcMain.handle('jr:rejectExecutionApproval', (_event, cardId: unknown, rawActor: unknown) =>
    store.rejectExecutionApproval(
      requireJrIpcString(cardId, 'card id'),
      parseJrControllerActor(rawActor)
    )
  )
  ipcMain.handle('jr:resumeBlocked', (_event, cardId: unknown, rawActor: unknown) =>
    store.resumeBlocked(requireJrIpcString(cardId, 'card id'), parseJrControllerActor(rawActor))
  )
}
