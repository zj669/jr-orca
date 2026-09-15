import { launchAgentBackgroundSession } from '@/lib/launch-agent-background-session'
import { useAppStore } from '@/store'
import { jrHarnessAgent } from '../../../shared/jr/jr-harness-agent'
import type { JrCard, JrControllerActor } from '../../../shared/jr/jr-types'
import { buildJrPlanningPrompt } from '../../../shared/jr/jr-planning-prompt'
import { findJrExistingWorkspace } from './jr-existing-workspace'

export async function launchJrPlanningSession(
  card: JrCard,
  mode: 'discussion' | 'planning',
  _actor: JrControllerActor
): Promise<void> {
  if (!card.harness || !card.model) {
    throw new Error('请先为卡片选择 Phase 1 harness 和模型。')
  }
  const repositoryId = card.execution.repositoryId
  if (!repositoryId) {
    throw new Error('请先选择仓库或文件夹工作区，才能启动讨论/规划会话。')
  }
  const state = useAppStore.getState()
  const workspace = findJrExistingWorkspace({
    repositoryId,
    repos: state.repos,
    worktrees: Object.values(state.worktreesByRepo).flat(),
    folderWorkspaces: state.folderWorkspaces
  })
  if (!workspace) {
    throw new Error('找不到可启动会话的 Orca 工作区。请先打开该仓库或文件夹。')
  }
  const known = state.getKnownWorktreeById(workspace.id)
  const worktreeId = known?.id ?? workspace.id
  await window.api.jr.seedTrellisSession(card.id, workspace.path, workspace.connectionId)
  const session = await launchAgentBackgroundSession({
    agent: jrHarnessAgent(card.harness),
    worktreeId,
    prompt: buildJrPlanningPrompt(card, mode),
    sessionOptions: { model: card.model.id },
    sessionOptionsOverrideAgentArgs: true,
    title: `JR ${mode === 'discussion' ? '讨论' : '规划'} · ${card.title}`,
    launchSource: 'unknown'
  })
  if (!session) {
    throw new Error('Orca 无法启动规划会话 harness。')
  }
}
