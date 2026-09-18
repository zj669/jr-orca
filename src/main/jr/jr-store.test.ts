import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { JrCard, JrControllerActor, JrReviewSnapshot } from '../../shared/jr/jr-types'
import { JrStore } from './jr-store'

const temporaryDirectories: string[] = []
const stores: JrStore[] = []
const controller: JrControllerActor = { kind: 'human-controller', id: 'test-walker' }

async function createStore(): Promise<JrStore> {
  const directory = await mkdtemp(join(tmpdir(), 'orca-jr-'))
  temporaryDirectories.push(directory)
  const store = new JrStore(join(directory, 'jr.sqlite'))
  stores.push(store)
  return store
}

afterEach(async () => {
  for (const store of stores.splice(0)) {
    store.close()
  }
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe('JrStore', () => {
  it('keeps Trellis planning artifacts in its database and requires a controller approval handoff', async () => {
    const store = await createStore()
    const card = store.createCard(
      {
        title: 'Make invite recovery actionable',
        description: 'Define the recovery path when an invitation is no longer valid.'
      },
      controller
    )

    const configured = store.updateCardConfiguration(
      card.id,
      { harness: 'codex', modelId: 'gpt-5.6-sol' },
      controller
    )
    expect(configured.harness).toBe('codex')
    expect(configured.model?.id).toBe('gpt-5.6-sol')
    const targeted = store.updateCardExecutionTarget(
      card.id,
      { repositoryId: 'repo-1', baseRef: 'main', setupDecision: 'run' },
      controller
    )
    expect(targeted.execution).toMatchObject({
      repositoryId: 'repo-1',
      baseRef: 'main',
      setupDecision: 'run'
    })

    const discussing = store.transition(card.id, 'begin-discussion', controller)
    expect(discussing.status).toBe('discussion')
    expect(discussing.artifacts.map((artifact) => artifact.path)).toContain(
      `tasks/${card.id}/discussion.md`
    )

    const planning = store.transition(card.id, 'begin-planning', controller)
    expect(planning.status).toBe('planning')
    expect(planning.artifacts.map((artifact) => artifact.path)).toEqual(
      expect.arrayContaining(['workflow.md', 'spec/jr-controller.md', `tasks/${card.id}/prd.md`])
    )

    store.updateCardDetails(
      card.id,
      {
        acceptance: 'Recovery is specific, testable, and stays in the approved boundary.',
        priority: 'p1'
      },
      controller
    )
    const awaitingApproval = store.transition(card.id, 'request-execution-approval', controller)
    expect(awaitingApproval.status).toBe('pending_execution_approval')
    expect(awaitingApproval.events[0]).toMatchObject({
      kind: '等待执行审批',
      actor: 'human-controller:test-walker'
    })
  })

  it('does not start a discussion before a card is configured', async () => {
    const store = await createStore()
    const card = store.createCard({ title: 'Unconfigured idea' }, controller)

    expect(() => store.transition(card.id, 'begin-discussion', controller)).toThrow(
      '请先为卡片选择 Phase 1 harness 和模型。'
    )
  })

  it('retains card configuration and Trellis artifacts after reopening SQLite', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'orca-jr-reopen-'))
    temporaryDirectories.push(directory)
    const databasePath = join(directory, 'jr.sqlite')
    const store = new JrStore(databasePath)
    stores.push(store)
    const card = store.createCard({ title: 'Persist artifacts' }, controller)
    store.updateCardConfiguration(
      card.id,
      { harness: 'gemini', modelId: 'gemini-3-pro-preview' },
      controller
    )
    store.updateCardReviewConfiguration(
      card.id,
      { harness: 'claude', modelId: 'sonnet' },
      controller
    )
    store.updateCardExecutionTarget(
      card.id,
      { repositoryId: 'repo-1', baseRef: 'main', setupDecision: 'inherit' },
      controller
    )
    store.transition(card.id, 'begin-discussion', controller)
    store.transition(card.id, 'begin-planning', controller)
    store.close()
    stores.splice(stores.indexOf(store), 1)

    const reopened = new JrStore(databasePath)
    stores.push(reopened)
    const restored = reopened.listBoard().cards.find((item) => item.id === card.id)

    expect(restored).toMatchObject({
      harness: 'gemini',
      model: { id: 'gemini-3-pro-preview' },
      reviewHarness: 'claude',
      reviewModel: { id: 'sonnet' },
      status: 'planning'
    })
    expect(restored?.artifacts.map((artifact) => artifact.path)).toEqual(
      expect.arrayContaining([
        `tasks/${card.id}/discussion.md`,
        `tasks/${card.id}/prd.md`,
        'spec/jr-controller.md',
        'workflow.md'
      ])
    )
  })

  it('persists the approved execution handoff and blocks only after Orca reports a failure', async () => {
    const store = await createStore()
    const card = await reachPlanning(store, 'Create a real worktree')
    store.transition(card.id, 'request-execution-approval', controller)

    const launch = store.prepareExecution(card.id, controller)
    expect(launch).toMatchObject({
      harness: 'cursorcli',
      execution: {
        repositoryId: 'repo-orca',
        baseRef: 'main',
        setupDecision: 'skip'
      }
    })
    expect(launch.prompt).toContain(`tasks/${card.id}/prd.md`)
    expect(launch.prompt).toContain('jr_artifact_upsert')
    expect(launch.prompt).toContain('jr-trellis-implement')
    expect(store.listBoard().cards.find((item) => item.id === card.id)?.status).toBe(
      'creating_worktree'
    )

    store.recordWorktreeProgress(card.id, 'fetching', controller)
    store.recordWorktreeCreated(
      card.id,
      { id: 'repo-orca::/tmp/jr-worktree', path: '/tmp/jr-worktree', branch: 'jr/worktree' },
      controller
    )
    const executing = store.recordAgentStarted(
      card.id,
      {
        agent: 'cursor',
        tabId: 'tab-jr',
        paneKey: 'tab-jr:pane-jr',
        ptyId: 'pty-jr'
      },
      controller
    )

    expect(executing).toMatchObject({
      status: 'executing',
      execution: {
        worktree: {
          id: 'repo-orca::/tmp/jr-worktree',
          path: '/tmp/jr-worktree',
          branch: 'jr/worktree'
        },
        agentSession: {
          agent: 'cursor',
          tabId: 'tab-jr',
          paneKey: 'tab-jr:pane-jr',
          ptyId: 'pty-jr',
          status: 'working'
        }
      }
    })

    const blocked = store.recordAgentStatus(card.id, 'blocked', controller)
    expect(blocked.status).toBe('blocked')
    expect(blocked.blocked).toEqual({
      owner: 'human-controller:test-walker',
      reason: 'Agent lifecycle 报告 blocked。',
      fromStatus: 'executing'
    })
    expect(blocked.events[0]).toMatchObject({
      kind: 'Harness 报告受阻',
      actor: 'human-controller:test-walker'
    })
  })

  it('captures an Orca review snapshot and only ships after controller merge approval', async () => {
    const store = await createStore()
    const card = await reachExecuting(store, 'Review the worktree')
    const snapshot = jrReviewSnapshot(card, { changedFiles: 3, commitsAhead: 2 })

    const verifying = store.requestReview(card.id, snapshot, controller)
    expect(verifying.status).toBe('verifying')
    expect(verifying.review).toMatchObject({ changedFiles: 3, commitsAhead: 2 })
    expect(verifying.artifacts.map((artifact) => artifact.path)).toContain(
      `tasks/${card.id}/review.md`
    )

    expect(() =>
      store.passVerification(card.id, { kind: 'human-controller', id: 'walker' })
    ).not.toThrow()
    expect(store.listBoard().cards.find((item) => item.id === card.id)?.status).toBe(
      'pending_merge_approval'
    )

    const ship = store.prepareShip(card.id, controller)
    expect(ship).toMatchObject({
      cardId: card.id,
      worktree: { branch: 'jr/worktree' },
      baseRef: 'main'
    })
    const merged = store.recordMerged(
      card.id,
      { method: 'hosted-pr', prNumber: 18, mergedInto: 'main', headOid: 'abc' },
      controller
    )
    expect(merged.status).toBe('merged')
    expect(merged.delivery).toMatchObject({ method: 'hosted-pr', prNumber: 18 })
    expect(merged.artifacts.map((artifact) => artifact.path)).toContain(
      `tasks/${card.id}/journal.md`
    )
  })

  it('requires an explicit review AI and relaunches execution in the original worktree', async () => {
    const store = await createStore()
    const card = await reachExecuting(store, 'Review findings return to execution')

    expect(() => store.prepareReviewLaunch(card.id, controller)).toThrow(
      '请先选择审查 AI，或明确使用与执行相同的配置。'
    )

    const incompleteReview = store.updateCardReviewConfiguration(
      card.id,
      { harness: 'claude' },
      controller
    )
    expect(incompleteReview).toMatchObject({ reviewHarness: 'claude', reviewModel: null })
    expect(() => store.prepareReviewLaunch(card.id, controller)).toThrow(
      '请先选择审查 AI，或明确使用与执行相同的配置。'
    )

    const configured = store.updateCardReviewConfiguration(
      card.id,
      { harness: 'claude', modelId: 'sonnet' },
      controller
    )
    expect(configured).toMatchObject({
      harness: 'cursorcli',
      model: { id: 'auto' },
      reviewHarness: 'claude',
      reviewModel: { id: 'sonnet' }
    })

    const reviewLaunch = store.prepareReviewLaunch(card.id, controller)
    expect(reviewLaunch).toMatchObject({
      harness: 'claude',
      model: { id: 'sonnet' },
      worktree: card.execution.worktree
    })
    expect(reviewLaunch.prompt).toContain('jr-trellis-check')

    store.requestReview(card.id, jrReviewSnapshot(card), controller)
    store.writeArtifact(
      card.id,
      `tasks/${card.id}/review.md`,
      '# Review findings\n\n- Add input validation before delivery.\n',
      { kind: 'task-agent', id: 'reviewer' }
    )
    const changedReview = store.updateCardReviewConfiguration(
      card.id,
      { harness: 'codex', modelId: 'gpt-5.6-sol' },
      controller
    )
    expect(changedReview.reviewHarness).toBe('codex')

    const executing = store.returnToExecution(card.id, controller)
    const relaunch = store.prepareExecutionRelaunch(card.id, controller)
    expect(executing.status).toBe('executing')
    expect(relaunch).toMatchObject({
      harness: 'cursorcli',
      model: { id: 'auto' },
      worktree: card.execution.worktree
    })
    expect(relaunch.prompt).toContain('Add input validation before delivery.')
    expect(() =>
      store.updateCardConfiguration(card.id, { harness: 'claude', modelId: 'sonnet' }, controller)
    ).toThrow('执行批准后不能修改 harness 或模型')
  })

  it('retries prepareShip after a blocked shipping merge and can return to execution', async () => {
    const store = await createStore()
    const card = await reachExecuting(store, 'Retry local merge')
    store.requestReview(
      card.id,
      jrReviewSnapshot(card, { changedFiles: 2, commitsAhead: 1 }),
      controller
    )
    store.passVerification(card.id, controller)
    const firstShip = store.prepareShip(card.id, controller)
    expect(firstShip.baseRef).toBe('main')

    const blocked = store.blockExecution(
      card.id,
      'untracked files would be overwritten',
      controller
    )
    expect(blocked.status).toBe('blocked')
    expect(blocked.blocked?.fromStatus).toBe('shipping')

    const resumed = store.resumeBlocked(card.id, controller)
    expect(resumed.status).toBe('shipping')
    expect(resumed.delivery).toBeNull()

    const retry = store.prepareShip(card.id, controller)
    expect(retry).toMatchObject({
      cardId: card.id,
      worktree: { branch: 'jr/worktree' },
      baseRef: 'main'
    })
    expect(store.readCard(card.id).status).toBe('shipping')

    const executing = store.returnToExecution(card.id, controller)
    expect(executing.status).toBe('executing')
  })

  it('enters verifying after a successful harness exit plus review snapshot', async () => {
    const store = await createStore()
    const card = await reachExecuting(store, 'Auto verify after exit')
    store.recordAgentExit(card.id, 0, controller)
    expect(store.listBoard().cards.find((item) => item.id === card.id)?.status).toBe('executing')

    const verifying = store.requestReview(card.id, jrReviewSnapshot(card), controller)
    expect(verifying.status).toBe('verifying')
    expect(verifying.artifacts.map((artifact) => artifact.path)).toContain(
      `tasks/${card.id}/review.md`
    )
  })

  it('rejects verification while the worktree is dirty and can return to execution', async () => {
    const store = await createStore()
    const card = await reachExecuting(store, 'Dirty review')
    store.requestReview(card.id, jrReviewSnapshot(card, { uncommittedFiles: 4 }), controller)

    expect(() => store.passVerification(card.id, controller)).toThrow('还有未提交变更')
    const executing = store.returnToExecution(card.id, controller)
    expect(executing.status).toBe('executing')
  })

  it('requires a persisted execution target before controller approval', async () => {
    const store = await createStore()
    const card = store.createCard(
      {
        title: 'Missing execution target',
        description: 'Define the recovery path when an invitation is no longer valid.'
      },
      controller
    )
    store.updateCardConfiguration(card.id, { harness: 'claude', modelId: 'sonnet' }, controller)
    store.updateCardDetails(
      card.id,
      {
        acceptance: 'Recovery is specific, testable, and stays in the approved boundary.',
        priority: 'p1'
      },
      controller
    )
    store.transition(card.id, 'begin-discussion', controller)
    store.transition(card.id, 'begin-planning', controller)

    expect(() => store.transition(card.id, 'request-execution-approval', controller)).toThrow(
      '请先为卡片设置仓库或文件夹工作区。'
    )
  })

  it('invalidates planning artifacts when harness or model changes', async () => {
    const store = await createStore()
    const card = await reachPlanning(store, 'Invalidate after model change')
    const before = store.readCard(card.id).artifacts.find((item) => item.path === 'workflow.md')
    store.updateCardConfiguration(card.id, { harness: 'claude', modelId: 'sonnet' }, controller)
    const after = store.readCard(card.id)
    expect(after.events.some((event) => event.kind === '计划已作废')).toBe(true)
    expect(after.artifacts.find((item) => item.path === 'workflow.md')?.version).toBeGreaterThan(
      before?.version ?? 0
    )
  })

  it('rejects execution approval back to planning and freezes the contract after approval', async () => {
    const store = await createStore()
    const card = await reachPlanning(store, 'Reject execution')
    store.updateCardDetails(
      card.id,
      {
        acceptance: 'Recovery is specific, testable, and stays in the approved boundary.',
        priority: 'p1'
      },
      controller
    )
    store.transition(card.id, 'request-execution-approval', controller)
    expect(() => store.updateCardDetails(card.id, { priority: 'p0' }, controller)).toThrow(
      '执行批准后不能修改问题、验收标准或优先级。'
    )
    const planning = store.rejectExecutionApproval(card.id, controller)
    expect(planning.status).toBe('planning')
  })

  it('resumes a blocked card to its prior resumable status', async () => {
    const store = await createStore()
    const card = await reachExecuting(store, 'Resume blocked')
    store.recordAgentStatus(card.id, 'blocked', controller)
    const resumed = store.resumeBlocked(card.id, controller)
    expect(resumed.status).toBe('executing')
    expect(resumed.blocked).toBeNull()
  })
})

async function reachPlanning(store: JrStore, title: string) {
  const card = store.createCard(
    {
      title,
      description: 'Define the recovery path when an invitation is no longer valid.'
    },
    controller
  )
  store.updateCardConfiguration(card.id, { harness: 'cursorcli', modelId: 'auto' }, controller)
  store.updateCardExecutionTarget(
    card.id,
    { repositoryId: 'repo-orca', baseRef: 'main', setupDecision: 'skip' },
    controller
  )
  store.updateCardDetails(
    card.id,
    {
      acceptance: 'Recovery is specific, testable, and stays in the approved boundary.',
      priority: 'p1'
    },
    controller
  )
  store.transition(card.id, 'begin-discussion', controller)
  return store.transition(card.id, 'begin-planning', controller)
}

async function reachExecuting(store: JrStore, title: string) {
  const card = await reachPlanning(store, title)
  store.transition(card.id, 'request-execution-approval', controller)
  store.prepareExecution(card.id, controller)
  store.recordWorktreeCreated(
    card.id,
    { id: 'repo-orca::/tmp/jr-worktree', path: '/tmp/jr-worktree', branch: 'jr/worktree' },
    controller
  )
  return store.recordAgentStarted(
    card.id,
    {
      agent: 'cursor',
      tabId: 'tab-jr',
      paneKey: 'tab-jr:pane-jr',
      ptyId: 'pty-jr'
    },
    controller
  )
}

function jrReviewSnapshot(
  card: JrCard,
  overrides: Partial<JrReviewSnapshot> = {}
): JrReviewSnapshot {
  return {
    worktreeId: card.execution.worktree?.id ?? '',
    branch: 'jr/worktree',
    baseRef: 'main',
    headOid: 'abc',
    mergeBase: 'def',
    changedFiles: 1,
    commitsAhead: 1,
    commitsBehind: 0,
    uncommittedFiles: 0,
    conflicted: false,
    compareStatus: 'ready',
    capturedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  }
}
