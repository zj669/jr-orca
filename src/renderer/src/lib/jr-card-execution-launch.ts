import { getWorkspaceSeedName } from '@/lib/new-workspace'
import { launchAgentBackgroundSession } from '@/lib/launch-agent-background-session'
import { useAppStore } from '@/store'
import { jrHarnessAgent } from '../../../shared/jr/jr-harness-agent'
import type {
  JrAgentLifecycleState,
  JrControllerActor,
  JrExecutionLaunchRequest,
  JrRecordAgentSessionInput,
  JrRecordWorktreeInput
} from '../../../shared/jr/jr-types'
import type { TuiAgent } from '../../../shared/tui-agent'

type JrWorktreeProgress = {
  creationId?: string
  phase: 'fetching' | 'creating'
}

type JrNativeWorktreeRequest = {
  repositoryId: string
  baseRef: string
  setupDecision: JrExecutionLaunchRequest['execution']['setupDecision']
  title: string
  agent: TuiAgent
  creationId: string
}

type JrExecutionLaunchDependencies = {
  prepareExecution: (cardId: string, actor: JrControllerActor) => Promise<JrExecutionLaunchRequest>
  createWorktree: (request: JrNativeWorktreeRequest) => Promise<JrRecordWorktreeInput>
  launchAgent: (request: {
    agent: JrRecordAgentSessionInput['agent']
    worktreeId: string
    prompt: string
    title: string
    onAgentStatus: (status: JrAgentLifecycleState) => void
    onExit: (code: number) => void
  }) => Promise<JrRecordAgentSessionInput | null>
  subscribeWorktreeProgress: (callback: (progress: JrWorktreeProgress) => void) => () => void
  recordWorktreeProgress: (
    cardId: string,
    phase: JrWorktreeProgress['phase'],
    actor: JrControllerActor
  ) => Promise<unknown>
  recordWorktreeCreated: (
    cardId: string,
    worktree: JrRecordWorktreeInput,
    actor: JrControllerActor
  ) => Promise<unknown>
  recordAgentStarted: (
    cardId: string,
    session: JrRecordAgentSessionInput,
    actor: JrControllerActor
  ) => Promise<unknown>
  recordAgentStatus: (
    cardId: string,
    status: JrAgentLifecycleState,
    actor: JrControllerActor
  ) => Promise<unknown>
  recordAgentExit: (cardId: string, code: number, actor: JrControllerActor) => Promise<unknown>
  blockExecution: (cardId: string, reason: string, actor: JrControllerActor) => Promise<unknown>
  createId: () => string
}

export function createJrCardExecutionLauncher(dependencies: JrExecutionLaunchDependencies): {
  launch: (cardId: string, actor: JrControllerActor) => Promise<void>
} {
  return {
    launch: async (cardId, actor) => {
      const request = await dependencies.prepareExecution(cardId, actor)
      const creationId = dependencies.createId()
      const unsubscribe = dependencies.subscribeWorktreeProgress((progress) => {
        if (progress.creationId !== creationId) {
          return
        }
        reportJrLifecycle(
          dependencies.recordWorktreeProgress(request.cardId, progress.phase, actor),
          'worktree progress'
        )
      })
      try {
        const worktree = await dependencies.createWorktree({
          repositoryId: request.execution.repositoryId,
          baseRef: request.execution.baseRef,
          setupDecision: request.execution.setupDecision,
          title: request.title,
          agent: jrHarnessAgent(request.harness),
          creationId
        })
        await dependencies.recordWorktreeCreated(request.cardId, worktree, actor)
        const agent = jrHarnessAgent(request.harness)
        const session = await dependencies.launchAgent({
          agent,
          worktreeId: worktree.id,
          prompt: request.prompt,
          title: `JR · ${request.title}`,
          onAgentStatus: (status) =>
            reportJrLifecycle(
              dependencies.recordAgentStatus(request.cardId, status, actor),
              'agent status'
            ),
          onExit: (code) =>
            reportJrLifecycle(
              code === 0
                ? dependencies.recordAgentExit(request.cardId, code, actor)
                : dependencies.blockExecution(
                    request.cardId,
                    `Orca harness exited with code ${code}.`,
                    actor
                  ),
              'agent exit'
            )
        })
        if (!session) {
          throw new Error('Orca could not start the selected harness.')
        }
        await dependencies.recordAgentStarted(request.cardId, session, actor)
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'JR execution launch failed.'
        try {
          await dependencies.blockExecution(request.cardId, reason, actor)
        } catch (blockError) {
          console.error('JR failed to persist execution failure', blockError)
        }
        throw error
      } finally {
        unsubscribe()
      }
    }
  }
}

export async function launchJrCardExecution(
  cardId: string,
  actor: JrControllerActor
): Promise<void> {
  const launcher = createJrCardExecutionLauncher({
    prepareExecution: (id, controller) => window.api.jr.prepareExecution(id, controller),
    createWorktree: async (request) => {
      const name = getWorkspaceSeedName({
        explicitName: request.title,
        prompt: '',
        linkedIssueNumber: null,
        linkedPR: null
      })
      const result = await useAppStore
        .getState()
        .createWorktree(
          request.repositoryId,
          name,
          request.baseRef,
          request.setupDecision,
          undefined,
          'unknown',
          request.title,
          undefined,
          undefined,
          undefined,
          request.agent,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          request.creationId
        )
      return {
        id: result.worktree.id,
        path: result.worktree.path,
        branch: result.worktree.branch
      }
    },
    launchAgent: async ({ onAgentStatus, onExit, ...request }) => {
      const session = await launchAgentBackgroundSession({
        ...request,
        launchSource: 'unknown',
        onAgentStatus: (status) => onAgentStatus(status.state),
        onExit: (_ptyId, code) => onExit(code)
      })
      return session
        ? {
            agent: request.agent,
            tabId: session.tabId,
            paneKey: session.paneKey,
            ptyId: session.ptyId
          }
        : null
    },
    subscribeWorktreeProgress: (callback) => window.api.worktrees.onCreateProgress(callback),
    recordWorktreeProgress: (id, phase, controller) =>
      window.api.jr.recordWorktreeProgress(id, phase, controller),
    recordWorktreeCreated: (id, worktree, controller) =>
      window.api.jr.recordWorktreeCreated(id, worktree, controller),
    recordAgentStarted: (id, session, controller) =>
      window.api.jr.recordAgentStarted(id, session, controller),
    recordAgentStatus: (id, status, controller) =>
      window.api.jr.recordAgentStatus(id, status, controller),
    recordAgentExit: (id, code, controller) => window.api.jr.recordAgentExit(id, code, controller),
    blockExecution: (id, reason, controller) =>
      window.api.jr.blockExecution(id, reason, controller),
    createId: () => crypto.randomUUID()
  })
  await launcher.launch(cardId, actor)
}

function reportJrLifecycle(promise: Promise<unknown>, event: string): void {
  void promise.catch((error: unknown) => console.error(`JR failed to record ${event}`, error))
}
