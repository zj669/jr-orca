import { app } from 'electron'
import { join } from 'node:path'
import { JrStore } from './jr-store'

export { JrStore } from './jr-store'

let jrStore: JrStore | null = null

export function getJrDatabasePath(): string {
  return join(app.getPath('userData'), 'jr', 'jr.sqlite')
}

export function getJrStore(): JrStore {
  if (!jrStore) {
    jrStore = new JrStore(getJrDatabasePath())
  }
  return jrStore
}
