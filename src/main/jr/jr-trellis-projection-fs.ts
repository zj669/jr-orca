import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { JrTrellisProjectionWriter } from './jr-trellis-projection'

export function createLocalJrProjectionWriter(worktreePath: string): JrTrellisProjectionWriter {
  return {
    writeFile(relativePath, content) {
      const target = join(worktreePath, relativePath)
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, content)
    },
    readFile(relativePath) {
      const target = join(worktreePath, relativePath)
      if (!existsSync(target)) {
        return null
      }
      return readFileSync(target, 'utf8')
    }
  }
}
