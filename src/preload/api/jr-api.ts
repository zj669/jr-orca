import type {
  JrAgentLifecycleState,
  JrBoardSnapshot,
  JrCard,
  JrCardTransition,
  JrControllerActor,
  JrCreateCardInput,
  JrDeliveryRecord,
  JrExecutionLaunchRequest,
  JrExecutionRelaunchRequest,
  JrMergeIntoBaseInput,
  JrRecordAgentSessionInput,
  JrRecordWorktreeInput,
  JrReviewLaunchRequest,
  JrReviewSnapshot,
  JrShipRequest,
  JrUpdateCardDetailsInput,
  JrUpdateCardInput,
  JrUpdateExecutionTargetInput,
  JrUpdateReviewConfigurationInput
} from '../../shared/jr/jr-types'

export type JrApi = {
  listBoard: () => Promise<JrBoardSnapshot>
  createCard: (input: JrCreateCardInput, actor: JrControllerActor) => Promise<JrCard>
  updateCardConfiguration: (
    cardId: string,
    input: JrUpdateCardInput,
    actor: JrControllerActor
  ) => Promise<JrCard>
  updateCardReviewConfiguration: (
    cardId: string,
    input: JrUpdateReviewConfigurationInput,
    actor: JrControllerActor
  ) => Promise<JrCard>
  updateCardExecutionTarget: (
    cardId: string,
    input: JrUpdateExecutionTargetInput,
    actor: JrControllerActor
  ) => Promise<JrCard>
  updateCardDetails: (
    cardId: string,
    input: JrUpdateCardDetailsInput,
    actor: JrControllerActor
  ) => Promise<JrCard>
  rejectExecutionApproval: (cardId: string, actor: JrControllerActor) => Promise<JrCard>
  resumeBlocked: (cardId: string, actor: JrControllerActor) => Promise<JrCard>
  transitionCard: (
    cardId: string,
    transition: JrCardTransition,
    actor: JrControllerActor
  ) => Promise<JrCard>
  prepareExecution: (cardId: string, actor: JrControllerActor) => Promise<JrExecutionLaunchRequest>
  prepareExecutionRelaunch: (
    cardId: string,
    actor: JrControllerActor
  ) => Promise<JrExecutionRelaunchRequest>
  prepareReviewLaunch: (cardId: string, actor: JrControllerActor) => Promise<JrReviewLaunchRequest>
  recordWorktreeCreated: (
    cardId: string,
    input: JrRecordWorktreeInput,
    actor: JrControllerActor
  ) => Promise<JrCard>
  seedTrellisSession: (
    cardId: string,
    worktreePath: string,
    connectionId?: string | null
  ) => Promise<string[]>
  recordWorktreeProgress: (
    cardId: string,
    phase: 'fetching' | 'creating',
    actor: JrControllerActor
  ) => Promise<JrCard>
  recordAgentStarted: (
    cardId: string,
    input: JrRecordAgentSessionInput,
    actor: JrControllerActor
  ) => Promise<JrCard>
  recordAgentStatus: (
    cardId: string,
    status: JrAgentLifecycleState,
    actor: JrControllerActor
  ) => Promise<JrCard>
  recordAgentExit: (cardId: string, code: number, actor: JrControllerActor) => Promise<JrCard>
  blockExecution: (cardId: string, reason: string, actor: JrControllerActor) => Promise<JrCard>
  requestReview: (
    cardId: string,
    snapshot: JrReviewSnapshot,
    actor: JrControllerActor
  ) => Promise<JrCard>
  passVerification: (cardId: string, actor: JrControllerActor) => Promise<JrCard>
  returnToExecution: (cardId: string, actor: JrControllerActor) => Promise<JrCard>
  prepareShip: (cardId: string, actor: JrControllerActor) => Promise<JrShipRequest>
  recordMerged: (
    cardId: string,
    delivery: JrDeliveryRecord,
    actor: JrControllerActor
  ) => Promise<JrCard>
  mergeIntoBase: (input: JrMergeIntoBaseInput) => Promise<void>
}
