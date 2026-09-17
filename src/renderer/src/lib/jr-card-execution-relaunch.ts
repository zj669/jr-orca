import { launchAgentBackgroundSession } from '@/lib/launch-agent-background-session'
import { jrHarnessAgent } from '../../../shared/jr/jr-harness-agent'
import type {
  JrAgentLifecycleState,
  JrControllerActor,
  JrExecutionRelaunchRequest,
  JrRecordAgentSessionInput
} from '../../../shared/jr/jr-types'
import { createJrHarnessPtyFailureScanner } from './jr-harness-pty-failure'

export type JrExecutionRelaunchDependencies = {
  prepareExecutionRelaunch: (
    cardId: string,
    actor: JrControllerActor
  ) => Promise<JrExecutionRelaunchRequest>
  seedTrellisSession: (
    cardId: string,
    worktreePath: string,
    connectionId?: string | null
  ) => Promise<unknown>
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
}

export function createJrCardExecutionRelauncher(dependencies: JrExecutionRelaunchDependencies): {
  launch: (cardId: string, actor: JrControllerActor) => Promise<void>
} {
  return {
    launch: async (cardId, actor) => {
      const request = await dependencies.prepareExecutionRelaunch(cardId, actor)
      try {
        await dependencies.seedTrellisSession(request.cardId, request.worktree.path)
        const agent = jrHarnessAgent(request.harness)
        const scanFailure = createJrHarnessPtyFailureScanner()
        const session = await dependencies.launchAgent({
          agent,
          worktreeId: request.worktree.id,
          prompt: request.prompt,
          sessionOptions: { model: request.model.id },
          sessionOptionsOverrideAgentArgs: true,
          title: `JR · ${request.title}`,
          extraAgentArgs: agent === 'cursor' ? '--trust' : undefined,
          onAgentStatus: (status) =>
            reportJrExecutionRelaunch(
              dependencies.recordAgentStatus(request.cardId, status, actor),
              'agent status'
            ),
          onData: (chunk) => {
            const reason = scanFailure(chunk)
            if (reason) {
              reportJrExecutionRelaunch(
                dependencies.blockExecution(request.cardId, reason, actor),
                'harness PTY failure'
              )
            }
          },
          onExit: (code) =>
            reportJrExecutionRelaunch(
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
          throw new Error('Orca could not restart the selected execution harness.')
        }
        await dependencies.recordAgentStarted(request.cardId, session, actor)
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'JR execution relaunch failed.'
        try {
          await dependencies.blockExecution(request.cardId, reason, actor)
        } catch (blockError) {
          console.error('JR failed to persist execution relaunch failure', blockError)
        }
        throw error
      }
    }
  }
}

export async function relaunchJrCardExecution(
  cardId: string,
  actor: JrControllerActor
): Promise<void> {
  await window.api.jr.returnToExecution(cardId, actor)
  const launcher = createJrCardExecutionRelauncher({
    prepareExecutionRelaunch: (id, controller) =>
      window.api.jr.prepareExecutionRelaunch(id, controller),
    seedTrellisSession: (id, worktreePath, connectionId) =>
      window.api.jr.seedTrellisSession(id, worktreePath, connectionId),
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
    recordAgentStarted: (id, session, controller) =>
      window.api.jr.recordAgentStarted(id, session, controller),
    recordAgentStatus: (id, status, controller) =>
      window.api.jr.recordAgentStatus(id, status, controller),
    recordAgentExit: (id, code, controller) => window.api.jr.recordAgentExit(id, code, controller),
    requestReviewOnSuccess: async (id, controller) => {
      const { launchJrCardReview } = await import('./jr-card-review-desktop')
      await launchJrCardReview(id, controller)
    },
    blockExecution: (id, reason, controller) => window.api.jr.blockExecution(id, reason, controller)
  })
  await launcher.launch(cardId, actor)
}

function reportJrExecutionRelaunch(promise: Promise<unknown>, event: string): void {
  void promise.catch((error: unknown) => console.error(`JR failed to record ${event}`, error))
}

async function completeSuccessfulHarnessExit(
  dependencies: Pick<
    JrExecutionRelaunchDependencies,
    'recordAgentExit' | 'requestReviewOnSuccess' | 'blockExecution'
  >,
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
