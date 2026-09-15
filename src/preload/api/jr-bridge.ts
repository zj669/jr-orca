import { ipcRenderer } from 'electron'
import type { PreloadApi } from '../api-types'

export const jrApi = {
  listBoard: () => ipcRenderer.invoke('jr:listBoard'),
  createCard: (input, actor) => ipcRenderer.invoke('jr:createCard', input, actor),
  updateCardConfiguration: (cardId, input, actor) =>
    ipcRenderer.invoke('jr:updateCardConfiguration', cardId, input, actor),
  updateCardExecutionTarget: (cardId, input, actor) =>
    ipcRenderer.invoke('jr:updateCardExecutionTarget', cardId, input, actor),
  transitionCard: (cardId, transition, actor) =>
    ipcRenderer.invoke('jr:transitionCard', cardId, transition, actor),
  prepareExecution: (cardId, actor) => ipcRenderer.invoke('jr:prepareExecution', cardId, actor),
  recordWorktreeCreated: (cardId, input, actor) =>
    ipcRenderer.invoke('jr:recordWorktreeCreated', cardId, input, actor),
  recordWorktreeProgress: (cardId, phase, actor) =>
    ipcRenderer.invoke('jr:recordWorktreeProgress', cardId, phase, actor),
  recordAgentStarted: (cardId, input, actor) =>
    ipcRenderer.invoke('jr:recordAgentStarted', cardId, input, actor),
  recordAgentStatus: (cardId, status, actor) =>
    ipcRenderer.invoke('jr:recordAgentStatus', cardId, status, actor),
  recordAgentExit: (cardId, code, actor) =>
    ipcRenderer.invoke('jr:recordAgentExit', cardId, code, actor),
  blockExecution: (cardId, reason, actor) =>
    ipcRenderer.invoke('jr:blockExecution', cardId, reason, actor)
} satisfies PreloadApi['jr']
