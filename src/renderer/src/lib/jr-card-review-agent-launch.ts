import { launchAgentBackgroundSession } from '@/lib/launch-agent-background-session'
import { jrHarnessAgent } from '../../../shared/jr/jr-harness-agent'
import type {
  JrControllerActor,
  JrRecordAgentSessionInput,
  JrReviewLaunchRequest
} from '../../../shared/jr/jr-types'
import { createJrHarnessPtyFailureScanner } from './jr-harness-pty-failure'

export type JrReviewAgentLaunchDependencies = {
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
    onData: (chunk: string) => void
    onExit: (code: number) => void
  }) => Promise<JrRecordAgentSessionInput | null>
  blockExecution: (cardId: string, reason: string, actor: JrControllerActor) => Promise<unknown>
}

export function createJrCardReviewAgentLauncher(dependencies: JrReviewAgentLaunchDependencies): {
  launch: (request: JrReviewLaunchRequest, actor: JrControllerActor) => Promise<void>
} {
  return {
    launch: async (request, actor) => {
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
          title: `JR 审查 · ${request.title}`,
          extraAgentArgs: agent === 'cursor' ? '--trust' : undefined,
          onData: (chunk) => {
            const reason = scanFailure(chunk)
            if (reason) {
              reportJrReviewLaunch(dependencies.blockExecution(request.cardId, reason, actor))
            }
          },
          onExit: (code) => {
            if (code !== 0) {
              reportJrReviewLaunch(
                dependencies.blockExecution(
                  request.cardId,
                  `Orca review harness exited with code ${code}.`,
                  actor
                )
              )
            }
          }
        })
        if (!session) {
          throw new Error('Orca could not start the selected review harness.')
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'JR review launch failed.'
        try {
          await dependencies.blockExecution(request.cardId, reason, actor)
        } catch (blockError) {
          console.error('JR failed to persist review launch failure', blockError)
        }
        throw error
      }
    }
  }
}

export async function launchJrCardReviewAgent(
  request: JrReviewLaunchRequest,
  actor: JrControllerActor
): Promise<void> {
  const launcher = createJrCardReviewAgentLauncher({
    seedTrellisSession: (id, worktreePath, connectionId) =>
      window.api.jr.seedTrellisSession(id, worktreePath, connectionId),
    launchAgent: async ({ onExit, ...request }) => {
      const session = await launchAgentBackgroundSession({
        ...request,
        launchSource: 'unknown',
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
    blockExecution: (id, reason, controller) => window.api.jr.blockExecution(id, reason, controller)
  })
  await launcher.launch(request, actor)
}

function reportJrReviewLaunch(promise: Promise<unknown>): void {
  void promise.catch((error: unknown) => console.error('JR failed to record review failure', error))
}
