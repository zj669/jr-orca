import type { JrActor, JrCard } from '../../shared/jr/jr-types'
import { jrTaskArtifactPath } from './jr-trellis-artifact-templates'
import { assertJrArtifactPath } from './jr-artifact-path'
import {
  syncJrTrellisProjection,
  verifyJrTrellisProjection,
  type JrTrellisProjectionWriter
} from './jr-trellis-projection'

export type JrTrellisMutationStore = {
  readCard(cardId: string): JrCard
  writeArtifact(cardId: string, path: string, content: string, actor: JrActor): JrCard
  writeTaskRecord(
    cardId: string,
    input: { title?: string; summary?: string; acceptance?: string },
    actor: JrActor
  ): JrCard
}

export type JrTrellisMutationHost = {
  store: JrTrellisMutationStore
  session: { cardId: string; actor: JrActor }
  projection?: JrTrellisProjectionWriter
}

export function applyJrTrellisMutation(
  host: JrTrellisMutationHost,
  name: string,
  args: Record<string, unknown>
): unknown {
  const card = host.store.readCard(host.session.cardId)
  switch (name) {
    case 'jr_task_create':
      return createTask(host, card, args)
    case 'jr_task_update':
      return updateTask(host, args)
    case 'jr_context_get':
      return { context: findTaskFile(card, 'context.md') }
    case 'jr_context_set':
      return writeTaskFile(host, card, 'context.md', requireText(args.content, 'content'))
    case 'jr_spec_propose':
      return proposeSpec(host, card, args)
    case 'jr_projection_sync':
      return syncProjection(host, card)
    case 'jr_projection_verify':
      return verifyProjection(host, card)
    default:
      throw new Error(`Unknown JR Trellis mutation: ${name}`)
  }
}

async function syncProjection(host: JrTrellisMutationHost, card: JrCard): Promise<unknown> {
  const writer = requireProjection(host)
  const manifest = await syncJrTrellisProjection(card, writer)
  return { synced: true, canonicalStore: 'jr-sqlite', manifest }
}

async function verifyProjection(host: JrTrellisMutationHost, card: JrCard): Promise<unknown> {
  const writer = requireProjection(host)
  return verifyJrTrellisProjection(card, writer)
}

function requireProjection(host: JrTrellisMutationHost): JrTrellisProjectionWriter {
  if (!host.projection) {
    throw new Error('JR projection writer is unavailable for this MCP session.')
  }
  return host.projection
}

function createTask(
  host: JrTrellisMutationHost,
  card: JrCard,
  args: Record<string, unknown>
): unknown {
  const path = jrTaskArtifactPath(card.id, 'task.md')
  if (card.artifacts.some((artifact) => artifact.path === path)) {
    throw new Error('JR task.md already exists. Use jr_task_update.')
  }
  return updateTask(host, args)
}

function updateTask(host: JrTrellisMutationHost, args: Record<string, unknown>): unknown {
  const updated = host.store.writeTaskRecord(
    host.session.cardId,
    {
      ...(typeof args.title === 'string' ? { title: args.title } : {}),
      ...(typeof args.summary === 'string' ? { summary: args.summary } : {}),
      ...(typeof args.acceptance === 'string' ? { acceptance: args.acceptance } : {})
    },
    host.session.actor
  )
  return { task: findTaskFile(updated, 'task.md'), card: summarize(updated) }
}

function proposeSpec(
  host: JrTrellisMutationHost,
  card: JrCard,
  args: Record<string, unknown>
): unknown {
  const name = requireText(args.name, 'name').replace(/\.md$/i, '')
  const path = assertJrArtifactPath(card.id, `spec/${name}.md`)
  const updated = host.store.writeArtifact(
    card.id,
    path,
    requireText(args.content, 'content'),
    host.session.actor
  )
  return { spec: updated.artifacts.find((artifact) => artifact.path === path) }
}

function writeTaskFile(
  host: JrTrellisMutationHost,
  card: JrCard,
  file: 'context.md',
  content: string
): unknown {
  const path = jrTaskArtifactPath(card.id, file)
  const updated = host.store.writeArtifact(card.id, path, content, host.session.actor)
  return { artifact: findTaskFile(updated, file) }
}

function findTaskFile(card: JrCard, file: string): JrCard['artifacts'][number] | null {
  const path = jrTaskArtifactPath(card.id, file)
  return card.artifacts.find((artifact) => artifact.path === path) ?? null
}

function summarize(card: JrCard): unknown {
  return {
    id: card.id,
    title: card.title,
    description: card.description,
    acceptance: card.acceptance,
    priority: card.priority,
    status: card.status
  }
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`JR ${field} is required.`)
  }
  return value
}
