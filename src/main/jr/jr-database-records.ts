import { JR_CARD_STATUSES, type JrCardStatus } from '../../shared/jr/jr-types'

export type JrDatabaseRow = Record<string, unknown>

function isRecord(value: unknown): value is JrDatabaseRow {
  return value !== null && typeof value === 'object'
}

export function requireJrDatabaseRow(value: unknown, message: string): JrDatabaseRow {
  if (!isRecord(value)) {
    throw new Error(message)
  }
  return value
}

export function requireJrDatabaseString(row: JrDatabaseRow, key: string): string {
  const value = row[key]
  if (typeof value !== 'string') {
    throw new Error(`JR database field ${key} is invalid.`)
  }
  return value
}

export function optionalJrDatabaseString(row: JrDatabaseRow, key: string): string | null {
  const value = row[key]
  return typeof value === 'string' ? value : null
}

function isJrCardStatus(value: string): value is JrCardStatus {
  return JR_CARD_STATUSES.some((candidate) => candidate === value)
}

export function requireJrDatabaseCardStatus(row: JrDatabaseRow): JrCardStatus {
  const status = requireJrDatabaseString(row, 'status')
  if (!isJrCardStatus(status)) {
    throw new Error(`JR database has an unknown status: ${status}.`)
  }
  return status
}
