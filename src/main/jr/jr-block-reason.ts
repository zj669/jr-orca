export function sanitizeJrBlockReason(reason: string): string {
  return reason
    .replace(/^Error invoking remote method '[^']+':\s*/i, '')
    .replace(/^Error:\s*/i, '')
    .replace(/^Command failed:\s*[^\n]+\n?/i, '')
    .trim()
}
