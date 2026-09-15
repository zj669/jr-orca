import { createHash } from 'node:crypto'
import type { JrArtifact, JrCard } from '../../shared/jr/jr-types'

export const JR_TRELLIS_MANIFEST_PATH = '.trellis/MANIFEST.json'

export type JrTrellisProjectionFile = {
  path: string
  sha256: string
}

export type JrTrellisProjectionManifest = {
  version: 1
  canonicalStore: 'jr-sqlite'
  cardId: string
  files: JrTrellisProjectionFile[]
}

export type JrTrellisProjectionWriter = {
  writeFile(relativePath: string, content: string): void | Promise<void>
  readFile(relativePath: string): string | null | Promise<string | null>
}

export function hashJrTrellisContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

export function buildJrTrellisProjection(card: JrCard): {
  files: { relativePath: string; content: string }[]
  manifest: JrTrellisProjectionManifest
} {
  const files = card.artifacts.map((artifact) => ({
    relativePath: projectionRelativePath(artifact),
    content: artifact.content
  }))
  const manifest: JrTrellisProjectionManifest = {
    version: 1,
    canonicalStore: 'jr-sqlite',
    cardId: card.id,
    files: files.map((file) => ({
      path: file.relativePath,
      sha256: hashJrTrellisContent(file.content)
    }))
  }
  files.push({
    relativePath: JR_TRELLIS_MANIFEST_PATH,
    content: `${JSON.stringify(manifest, null, 2)}\n`
  })
  return { files, manifest }
}

export async function syncJrTrellisProjection(
  card: JrCard,
  writer: JrTrellisProjectionWriter
): Promise<JrTrellisProjectionManifest> {
  const projection = buildJrTrellisProjection(card)
  for (const file of projection.files) {
    await writer.writeFile(file.relativePath, file.content)
  }
  return projection.manifest
}

export async function verifyJrTrellisProjection(
  card: JrCard,
  writer: JrTrellisProjectionWriter
): Promise<{ ok: true; present: boolean; manifest: JrTrellisProjectionManifest | null }> {
  const raw = await writer.readFile(JR_TRELLIS_MANIFEST_PATH)
  if (raw === null) {
    return { ok: true, present: false, manifest: null }
  }
  const expected = buildJrTrellisProjection(card)
  const actual = parseManifest(raw)
  const mismatches = new Set(diffProjectionHashes(expected.manifest, actual))
  for (const file of expected.files) {
    if (file.relativePath === JR_TRELLIS_MANIFEST_PATH) {
      continue
    }
    const onDisk = await writer.readFile(file.relativePath)
    if (onDisk === null || hashJrTrellisContent(onDisk) !== hashJrTrellisContent(file.content)) {
      mismatches.add(file.relativePath)
    }
  }
  if (mismatches.size > 0) {
    throw new Error(`JR .trellis projection hashes differ: ${[...mismatches].join(', ')}`)
  }
  return { ok: true, present: true, manifest: expected.manifest }
}

function projectionRelativePath(artifact: JrArtifact): string {
  return `.trellis/${artifact.path}`
}

function parseManifest(raw: string): JrTrellisProjectionManifest {
  const parsed: unknown = JSON.parse(raw)
  if (!isManifest(parsed)) {
    throw new Error('JR .trellis MANIFEST.json is invalid.')
  }
  return parsed
}

function isManifest(value: unknown): value is JrTrellisProjectionManifest {
  if (value === null || typeof value !== 'object') {
    return false
  }
  const record = value
  return (
    'version' in record &&
    record.version === 1 &&
    'canonicalStore' in record &&
    record.canonicalStore === 'jr-sqlite' &&
    'cardId' in record &&
    typeof record.cardId === 'string' &&
    'files' in record &&
    Array.isArray(record.files)
  )
}

function diffProjectionHashes(
  expected: JrTrellisProjectionManifest,
  actual: JrTrellisProjectionManifest
): string[] {
  const expectedByPath = new Map(expected.files.map((file) => [file.path, file.sha256]))
  const actualByPath = new Map(
    actual.files
      .filter((file) => typeof file.path === 'string' && typeof file.sha256 === 'string')
      .map((file) => [file.path, file.sha256])
  )
  const mismatches: string[] = []
  for (const [path, hash] of expectedByPath) {
    if (actualByPath.get(path) !== hash) {
      mismatches.push(path)
    }
  }
  for (const path of actualByPath.keys()) {
    if (path !== JR_TRELLIS_MANIFEST_PATH && !expectedByPath.has(path)) {
      mismatches.push(path)
    }
  }
  return mismatches
}
