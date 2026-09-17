import { ipcMain } from 'electron'
import { getJrStore, type JrStore } from '../jr/jr-store-access'
import { mergeJrBranchIntoBase } from '../jr/jr-local-base-merge'
import { seedJrTrellisHarnessSession } from '../jr/jr-trellis-session-seed'
import { registerJrLifecycleHandlers } from './jr-lifecycle-ipc'
import {
  parseJrAgentLifecycleState,
  parseJrAgentSessionInput,
  parseJrCardTransition,
  parseJrConfigurationInput,
  parseJrControllerActor,
  parseJrCreateCardInput,
  parseJrDeliveryRecord,
  parseJrExecutionTargetInput,
  parseJrExitCode,
  parseJrMergeIntoBaseInput,
  parseJrReviewSnapshot,
  parseJrWorktreeInput,
  requireJrIpcString
} from './jr-ipc-payloads'

type JrHandlerStore = Pick<
  JrStore,
  | 'listBoard'
  | 'createCard'
  | 'updateCardConfiguration'
  | 'updateCardReviewConfiguration'
  | 'updateCardExecutionTarget'
  | 'transition'
  | 'prepareExecution'
  | 'prepareExecutionRelaunch'
  | 'prepareReviewLaunch'
  | 'recordWorktreeCreated'
  | 'recordWorktreeProgress'
  | 'readCard'
  | 'recordAgentStarted'
  | 'recordAgentStatus'
  | 'recordAgentExit'
  | 'blockExecution'
  | 'requestReview'
  | 'passVerification'
  | 'returnToExecution'
  | 'prepareShip'
  | 'recordMerged'
  | 'updateCardDetails'
  | 'rejectExecutionApproval'
  | 'resumeBlocked'
>

export function registerJrHandlers(store: JrHandlerStore = getJrStore()): void {
  registerJrLifecycleHandlers(store)
  ipcMain.handle('jr:listBoard', () => store.listBoard())
  ipcMain.handle('jr:createCard', (_event, rawInput: unknown, rawActor: unknown) =>
    store.createCard(parseJrCreateCardInput(rawInput), parseJrControllerActor(rawActor))
  )
  ipcMain.handle(
    'jr:updateCardConfiguration',
    (_event, cardId: unknown, rawInput: unknown, rawActor: unknown) =>
      store.updateCardConfiguration(
        requireJrIpcString(cardId, 'card id'),
        parseJrConfigurationInput(rawInput),
        parseJrControllerActor(rawActor)
      )
  )
  ipcMain.handle(
    'jr:updateCardReviewConfiguration',
    (_event, cardId: unknown, rawInput: unknown, rawActor: unknown) =>
      store.updateCardReviewConfiguration(
        requireJrIpcString(cardId, 'card id'),
        parseJrConfigurationInput(rawInput),
        parseJrControllerActor(rawActor)
      )
  )
  ipcMain.handle(
    'jr:updateCardExecutionTarget',
    (_event, cardId: unknown, rawInput: unknown, rawActor: unknown) =>
      store.updateCardExecutionTarget(
        requireJrIpcString(cardId, 'card id'),
        parseJrExecutionTargetInput(rawInput),
        parseJrControllerActor(rawActor)
      )
  )
  ipcMain.handle(
    'jr:transitionCard',
    (_event, cardId: unknown, rawTransition: unknown, rawActor: unknown) =>
      store.transition(
        requireJrIpcString(cardId, 'card id'),
        parseJrCardTransition(rawTransition),
        parseJrControllerActor(rawActor)
      )
  )
  ipcMain.handle('jr:prepareExecution', (_event, cardId: unknown, rawActor: unknown) =>
    store.prepareExecution(requireJrIpcString(cardId, 'card id'), parseJrControllerActor(rawActor))
  )
  ipcMain.handle('jr:prepareExecutionRelaunch', (_event, cardId: unknown, rawActor: unknown) =>
    store.prepareExecutionRelaunch(
      requireJrIpcString(cardId, 'card id'),
      parseJrControllerActor(rawActor)
    )
  )
  ipcMain.handle('jr:prepareReviewLaunch', (_event, cardId: unknown, rawActor: unknown) =>
    store.prepareReviewLaunch(
      requireJrIpcString(cardId, 'card id'),
      parseJrControllerActor(rawActor)
    )
  )
  ipcMain.handle(
    'jr:recordWorktreeCreated',
    (_event, cardId: unknown, rawInput: unknown, rawActor: unknown) =>
      store.recordWorktreeCreated(
        requireJrIpcString(cardId, 'card id'),
        parseJrWorktreeInput(rawInput),
        parseJrControllerActor(rawActor)
      )
  )
  ipcMain.handle(
    'jr:seedTrellisSession',
    (_event, cardId: unknown, worktreePath: unknown, rawConnection: unknown) =>
      seedJrTrellisHarnessSession(
        store.readCard(requireJrIpcString(cardId, 'card id')),
        requireJrIpcString(worktreePath, 'worktree path'),
        typeof rawConnection === 'string' && rawConnection.trim().length > 0
          ? { connectionId: rawConnection.trim() }
          : {}
      )
  )
  ipcMain.handle(
    'jr:recordWorktreeProgress',
    (_event, cardId: unknown, rawPhase: unknown, rawActor: unknown) => {
      if (rawPhase !== 'fetching' && rawPhase !== 'creating') {
        throw new Error('JR worktree progress phase is invalid.')
      }
      return store.recordWorktreeProgress(
        requireJrIpcString(cardId, 'card id'),
        rawPhase,
        parseJrControllerActor(rawActor)
      )
    }
  )
  ipcMain.handle(
    'jr:recordAgentStarted',
    (_event, cardId: unknown, rawInput: unknown, rawActor: unknown) =>
      store.recordAgentStarted(
        requireJrIpcString(cardId, 'card id'),
        parseJrAgentSessionInput(rawInput),
        parseJrControllerActor(rawActor)
      )
  )
  ipcMain.handle(
    'jr:recordAgentStatus',
    (_event, cardId: unknown, rawStatus: unknown, rawActor: unknown) =>
      store.recordAgentStatus(
        requireJrIpcString(cardId, 'card id'),
        parseJrAgentLifecycleState(rawStatus),
        parseJrControllerActor(rawActor)
      )
  )
  ipcMain.handle(
    'jr:recordAgentExit',
    (_event, cardId: unknown, rawCode: unknown, rawActor: unknown) =>
      store.recordAgentExit(
        requireJrIpcString(cardId, 'card id'),
        parseJrExitCode(rawCode),
        parseJrControllerActor(rawActor)
      )
  )
  ipcMain.handle(
    'jr:blockExecution',
    (_event, cardId: unknown, rawReason: unknown, rawActor: unknown) =>
      store.blockExecution(
        requireJrIpcString(cardId, 'card id'),
        requireJrIpcString(rawReason, 'execution failure reason'),
        parseJrControllerActor(rawActor)
      )
  )
  ipcMain.handle(
    'jr:requestReview',
    (_event, cardId: unknown, rawSnapshot: unknown, rawActor: unknown) =>
      store.requestReview(
        requireJrIpcString(cardId, 'card id'),
        parseJrReviewSnapshot(rawSnapshot),
        parseJrControllerActor(rawActor)
      )
  )
  ipcMain.handle('jr:passVerification', (_event, cardId: unknown, rawActor: unknown) =>
    store.passVerification(requireJrIpcString(cardId, 'card id'), parseJrControllerActor(rawActor))
  )
  ipcMain.handle('jr:returnToExecution', (_event, cardId: unknown, rawActor: unknown) =>
    store.returnToExecution(requireJrIpcString(cardId, 'card id'), parseJrControllerActor(rawActor))
  )
  ipcMain.handle('jr:prepareShip', (_event, cardId: unknown, rawActor: unknown) =>
    store.prepareShip(requireJrIpcString(cardId, 'card id'), parseJrControllerActor(rawActor))
  )
  ipcMain.handle(
    'jr:recordMerged',
    (_event, cardId: unknown, rawDelivery: unknown, rawActor: unknown) =>
      store.recordMerged(
        requireJrIpcString(cardId, 'card id'),
        parseJrDeliveryRecord(rawDelivery),
        parseJrControllerActor(rawActor)
      )
  )
  ipcMain.handle('jr:mergeIntoBase', (_event, rawInput: unknown) =>
    mergeJrBranchIntoBase(parseJrMergeIntoBaseInput(rawInput))
  )
}
