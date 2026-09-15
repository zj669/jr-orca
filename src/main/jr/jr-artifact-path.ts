const TASK_FILE_PATTERN =
  /^(prd|design|implement|discussion|idea|journal|research|review|context|task|acceptance)\.md$/
const SPEC_FILE_PATTERN = /^spec\/[A-Za-z0-9._-]+\.md$/

export function normalizeJrArtifactPath(path: string): string {
  return path.trim().replace(/\\/g, '/')
}

export function assertJrArtifactPath(cardId: string, path: string): string {
  const normalized = normalizeJrArtifactPath(path)
  if (
    normalized.length === 0 ||
    normalized.includes('..') ||
    normalized.startsWith('/') ||
    normalized.startsWith('.trellis/') ||
    normalized === '.trellis'
  ) {
    throw new Error('JR artifact path is not writable. Use DB-backed Trellis paths, not .trellis/.')
  }
  if (normalized === 'workflow.md' || SPEC_FILE_PATTERN.test(normalized)) {
    return normalized
  }
  const taskPrefix = `tasks/${cardId}/`
  if (
    normalized.startsWith(taskPrefix) &&
    TASK_FILE_PATTERN.test(normalized.slice(taskPrefix.length))
  ) {
    return normalized
  }
  throw new Error('JR artifact path is outside the sanctioned Trellis set.')
}
