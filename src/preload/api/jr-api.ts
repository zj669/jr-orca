import type {
  JrBoardSnapshot,
  JrCard,
  JrCardTransition,
  JrControllerActor,
  JrCreateCardInput,
  JrUpdateCardInput
} from '../../shared/jr/jr-types'

export type JrApi = {
  listBoard: () => Promise<JrBoardSnapshot>
  createCard: (input: JrCreateCardInput, actor: JrControllerActor) => Promise<JrCard>
  updateCardConfiguration: (
    cardId: string,
    input: JrUpdateCardInput,
    actor: JrControllerActor
  ) => Promise<JrCard>
  transitionCard: (
    cardId: string,
    transition: JrCardTransition,
    actor: JrControllerActor
  ) => Promise<JrCard>
}
