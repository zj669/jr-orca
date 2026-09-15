import { isJrTaskAgentTransition } from '../../shared/jr/jr-actors'
import type { JrActor, JrArtifact, JrCard } from '../../shared/jr/jr-types'
import { jrTaskArtifactPath } from './jr-trellis-artifact-templates'
import { assertJrArtifactPath, normalizeJrArtifactPath } from './jr-artifact-path'
import { JR_TRELLIS_TOOL_NAMES, type JrTrellisToolName } from './jr-trellis-tool-catalog'
import { jrNow } from './jr-card-records'

export type JrTrellisToolStore = {
  readCard(cardId: string): JrCard
  transition(
    cardId: string,
    transition: 'begin-discussion' | 'begin-planning',
    actor: JrActor
  ): JrCard
  writeArtifact(cardId: string, path: string, content: string, actor: JrActor): JrCard
  recordEvent(cardId: string, kind: string, detail: string, actor: JrActor): JrCard
}

export type JrTrellisToolSession = {
  cardId: string
  actor: JrActor
}

const FORBIDDEN_PROMOTION =
  'Task agents cannot promote a JR card to 待批准执行 / 创建工作树 / 交付中 / 已合并.'

export class JrTrellisToolHost {
  constructor(
    private readonly store: JrTrellisToolStore,
    private readonly session: JrTrellisToolSession
  ) {}

  call(name: string, args: Record<string, unknown>): unknown {
    if (!isJrTrellisToolName(name)) {
      throw new Error(`Unknown JR Trellis tool: ${name}`)
    }
    const card = this.store.readCard(this.session.cardId)
    switch (name) {
      case 'jr_workflow_get':
        return readWorkflow(card)
      case 'jr_specs_list':
        return { specs: artifactsWithPrefix(card, 'spec/') }
      case 'jr_specs_get':
        return { spec: requireArtifact(card, requirePath(args), 'spec/') }
      case 'jr_task_get':
        return readTask(card)
      case 'jr_artifacts_list':
        return {
          artifacts: card.artifacts.map((artifact) => ({
            path: artifact.path,
            version: artifact.version,
            updatedAt: artifact.updatedAt
          }))
        }
      case 'jr_artifacts_get':
        return { artifact: requireArtifact(card, requirePath(args)) }
      case 'jr_artifact_upsert':
        return this.write(card, requirePath(args), requireText(args.content, 'content'))
      case 'jr_journal_append':
        return this.append(card, 'journal.md', requireText(args.entry, 'entry'))
      case 'jr_research_append':
        return this.append(card, 'research.md', requireText(args.entry, 'entry'))
      case 'jr_card_request_transition':
        return this.requestTransition(card, args.transition)
    }
  }

  private write(card: JrCard, path: string, content: string): unknown {
    const normalized = assertJrArtifactPath(card.id, path)
    const updated = this.store.writeArtifact(card.id, normalized, content, this.session.actor)
    return { artifact: requireArtifact(updated, normalized) }
  }

  private append(card: JrCard, file: 'journal.md' | 'research.md', entry: string): unknown {
    const path = jrTaskArtifactPath(card.id, file)
    const previous = card.artifacts.find((artifact) => artifact.path === path)?.content
    const heading = file === 'journal.md' ? 'journal' : 'research'
    const content = appendJrMarkdown(previous, card.title, heading, entry)
    return this.write(card, path, content)
  }

  private requestTransition(card: JrCard, rawTransition: unknown): unknown {
    if (rawTransition === 'request-execution-approval' || !isJrTaskAgentTransition(rawTransition)) {
      throw new Error(FORBIDDEN_PROMOTION)
    }
    if (rawTransition === 'request-review') {
      if (card.status !== 'executing') {
        throw new Error('卡片必须处于 executing 才能请求验证。')
      }
      const updated = this.store.recordEvent(
        card.id,
        'Harness 请求验证',
        'Task agent requested review. Controller/Orca snapshot still owns 验证中.',
        this.session.actor
      )
      return { card: summarizeCard(updated), requested: 'request-review' }
    }
    const updated = this.store.transition(card.id, rawTransition, this.session.actor)
    return { card: summarizeCard(updated), requested: rawTransition }
  }
}

export function isJrTrellisToolName(value: string): value is JrTrellisToolName {
  return JR_TRELLIS_TOOL_NAMES.some((name) => name === value)
}

export function appendJrMarkdown(
  previous: string | undefined,
  title: string,
  heading: string,
  entry: string
): string {
  const body = entry.trim()
  if (body.length === 0) {
    throw new Error('JR journal/research entry is required.')
  }
  const header = previous?.trim() || `# ${title} — ${heading}`
  return `${header}\n\n## ${jrNow()}\n\n${body}\n`
}

function readWorkflow(card: JrCard): unknown {
  return {
    card: summarizeCard(card),
    workflow: card.artifacts.find((artifact) => artifact.path === 'workflow.md') ?? null,
    canonicalStore: 'jr-sqlite',
    trellisProjection: 'optional-read-only'
  }
}

function readTask(card: JrCard): unknown {
  const prefix = `tasks/${card.id}/`
  return {
    card: summarizeCard(card),
    artifacts: artifactsWithPrefix(card, prefix),
    events: card.events.slice(0, 10)
  }
}

function summarizeCard(card: JrCard): unknown {
  return {
    id: card.id,
    title: card.title,
    description: card.description,
    status: card.status,
    harness: card.harness,
    model: card.model,
    execution: card.execution
  }
}

function artifactsWithPrefix(card: JrCard, prefix: string): JrArtifact[] {
  return card.artifacts.filter((artifact) => artifact.path.startsWith(prefix))
}

function requireArtifact(card: JrCard, path: string, prefix?: string): JrArtifact {
  const normalized = normalizeJrArtifactPath(path)
  if (prefix && !normalized.startsWith(prefix)) {
    throw new Error(`JR artifact ${normalized} is not a ${prefix} spec.`)
  }
  const artifact = card.artifacts.find((candidate) => candidate.path === normalized)
  if (!artifact) {
    throw new Error(`JR artifact not found: ${normalized}`)
  }
  return artifact
}

function requirePath(args: Record<string, unknown>): string {
  return requireText(args.path, 'path')
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`JR ${field} is required.`)
  }
  return value
}
