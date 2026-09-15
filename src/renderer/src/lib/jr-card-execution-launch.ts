import { getWorkspaceSeedName } from '@/lib/new-workspace'
import { launchAgentBackgroundSession } from '@/lib/launch-agent-background-session'
import { useAppStore } from '@/store'
import { jrHarnessAgent, type JrHarnessTuiAgent } from '../../../shared/jr/jr-harness-agent'
import type {
  JrAgentLifecycleState,
  JrControllerActor,
  JrExecutionLaunchRequest,
  JrRecordAgentSessionInput,
  JrRecordWorktreeInput
} from '../../../shared/jr/jr-types'
import { findJrExistingWorkspace } from './jr-existing-workspace'
import { createJrHarnessPtyFailureScanner } from './jr-harness-pty-failure'

type JrWorktreeProgress = {
  creationId?: string
  phase: 'fetching' | 'creating'
}

type JrNativeWorktreeRequest = {
  repositoryId: string
  baseRef: string
  setupDecision: JrExecutionLaunchRequest['execution']['setupDecision']
  title: string
  agent: JrHarnessTuiAgent
  creationId: string
}

type JrExecutionLaunchDependencies = {
  prepareExecution: (cardId: string, actor: JrControllerActor) => Promise<JrExecutionLaunchRequest>
  createWorktree: (request: JrNativeWorktreeRequest) => Promise<JrRecordWorktreeInput>
  launchAgent: (request: {
    agent: JrRecordAgentSessionInput['agent']
    worktreeId: string
    prompt: string
    sessionOptions: { model: string }
    sessionOptionsOverrideAgentArgs: boolean
    title: string
    extraAgentArgs?: string
    onAgentStatus: (status: JrAgentLifecycleState) => void
    onData: (chunk: string) => void
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
  seedTrellisSession: (
    cardId: string,
    worktreePath: string,
    connectionId?: string | null
  ) => Promise<unknown>
  resolveExistingWorkspace: (repositoryId: string) => {
    id: string
    path: string
    branch: string
    connectionId?: string | null
    kind: 'git' | 'folder'
  } | null
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
  requestReviewOnSuccess: (cardId: string, actor: JrControllerActor) => Promise<unknown>
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
        const { worktree, connectionId } = await createJrExecutionWorktree(
          dependencies,
          request,
          creationId
        )
        await dependencies.recordWorktreeCreated(request.cardId, worktree, actor)
        await dependencies.seedTrellisSession(request.cardId, worktree.path, connectionId)
        const agent = jrHarnessAgent(request.harness)
        const scanFailure = createJrHarnessPtyFailureScanner()
        const session = await dependencies.launchAgent({
          agent,
          worktreeId: worktree.id,
          prompt: request.prompt,
          sessionOptions: { model: request.model.id },
          sessionOptionsOverrideAgentArgs: true,
          title: `JR · ${request.title}`,
          extraAgentArgs: agent === 'cursor' ? '--trust' : undefined,
          onAgentStatus: (status) =>
            reportJrLifecycle(
              dependencies.recordAgentStatus(request.cardId, status, actor),
              'agent status'
            ),
          onData: (chunk) => {
            const reason = scanFailure(chunk)
            if (!reason) {
              return
            }
            reportJrLifecycle(
              dependencies.blockExecution(request.cardId, reason, actor),
              'harness PTY failure'
            )
          },
          onExit: (code) =>
            reportJrLifecycle(
              code === 0
                ? completeSuccessfulHarnessExit(dependencies, request.cardId, code, actor)
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
    launchAgent: async ({ onAgentStatus, onExit, onData, extraAgentArgs, ...request }) => {
      const session = await launchAgentBackgroundSession({
        ...request,
        extraAgentArgs,
        launchSource: 'unknown',
        onAgentStatus: (status) => onAgentStatus(status.state),
        onData,
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
    seedTrellisSession: (id, worktreePath, connectionId) =>
      window.api.jr.seedTrellisSession(id, worktreePath, connectionId),
    recordAgentStarted: (id, session, controller) =>
      window.api.jr.recordAgentStarted(id, session, controller),
    recordAgentStatus: (id, status, controller) =>
      window.api.jr.recordAgentStatus(id, status, controller),
    recordAgentExit: (id, code, controller) => window.api.jr.recordAgentExit(id, code, controller),
    requestReviewOnSuccess: async (id, controller) => {
      const { launchJrCardReview } = await import('./jr-card-review-desktop')
      await launchJrCardReview(id, controller)
    },
    blockExecution: (id, reason, controller) =>
      window.api.jr.blockExecution(id, reason, controller),
    resolveExistingWorkspace: (repositoryId) => {
      const state = useAppStore.getState()
      return findJrExistingWorkspace({
        repositoryId,
        repos: state.repos,
        worktrees: Object.values(state.worktreesByRepo).flat(),
        folderWorkspaces: state.folderWorkspaces
      })
    },
    createId: () => crypto.randomUUID()
  })
  await launcher.launch(cardId, actor)
}

function reportJrLifecycle(promise: Promise<unknown>, event: string): void {
  void promise.catch((error: unknown) => console.error(`JR failed to record ${event}`, error))
}

async function createJrExecutionWorktree(
  dependencies: JrExecutionLaunchDependencies,
  request: JrExecutionLaunchRequest,
  creationId: string
): Promise<{
  worktree: JrRecordWorktreeInput
  connectionId?: string | null
}> {
  const existing = dependencies.resolveExistingWorkspace(request.execution.repositoryId)
  try {
    return {
      worktree: await dependencies.createWorktree({
        repositoryId: request.execution.repositoryId,
        baseRef: request.execution.baseRef,
        setupDecision: request.execution.setupDecision,
        title: request.title,
        agent: jrHarnessAgent(request.harness),
        creationId
      }),
      connectionId: existing?.connectionId
    }
  } catch (error) {
    if (!existing) {
      throw error
    }
    return {
      worktree: {
        id: existing.id,
        path: existing.path,
        branch: existing.branch
      },
      connectionId: existing.connectionId
    }
  }
}

async function completeSuccessfulHarnessExit(
  dependencies: JrExecutionLaunchDependencies,
  cardId: string,
  code: number,
  actor: JrControllerActor
): Promise<void> {
  await dependencies.recordAgentExit(cardId, code, actor)
  try {
    await dependencies.requestReviewOnSuccess(cardId, actor)
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'JR 自动验证失败。'
    try {
      await dependencies.blockExecution(cardId, reason, actor)
    } catch (blockError) {
      console.error('JR failed to persist verification failure', blockError)
    }
    throw error
  }
}
