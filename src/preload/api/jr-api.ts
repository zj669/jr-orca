import type {
  JrAgentLifecycleState,
  JrBoardSnapshot,
  JrCard,
  JrCardTransition,
  JrControllerActor,
  JrCreateCardInput,
  JrExecutionLaunchRequest,
  JrRecordAgentSessionInput,
  JrRecordWorktreeInput,
  JrUpdateCardInput,
  JrUpdateExecutionTargetInput
} from '../../shared/jr/jr-types'

export type JrApi = {
  listBoard: () => Promise<JrBoardSnapshot>
  createCard: (input: JrCreateCardInput, actor: JrControllerActor) => Promise<JrCard>
  updateCardConfiguration: (
    cardId: string,
    input: JrUpdateCardInput,
    actor: JrControllerActor
  ) => Promise<JrCard>
  updateCardExecutionTarget: (
    cardId: string,
    input: JrUpdateExecutionTargetInput,
    actor: JrControllerActor
  ) => Promise<JrCard>
  transitionCard: (
    cardId: string,
    transition: JrCardTransition,
    actor: JrControllerActor
  ) => Promise<JrCard>
  prepareExecution: (cardId: string, actor: JrControllerActor) => Promise<JrExecutionLaunchRequest>
  recordWorktreeCreated: (
    cardId: string,
    input: JrRecordWorktreeInput,
    actor: JrControllerActor
  ) => Promise<JrCard>
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
}
