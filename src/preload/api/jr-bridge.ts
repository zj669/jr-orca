import { ipcRenderer } from 'electron'
import type { PreloadApi } from '../api-types'

export const jrApi = {
  listBoard: () => ipcRenderer.invoke('jr:listBoard'),
  createCard: (input, actor) => ipcRenderer.invoke('jr:createCard', input, actor),
  updateCardConfiguration: (cardId, input, actor) =>
    ipcRenderer.invoke('jr:updateCardConfiguration', cardId, input, actor),
  transitionCard: (cardId, transition, actor) =>
    ipcRenderer.invoke('jr:transitionCard', cardId, transition, actor)
} satisfies PreloadApi['jr']
