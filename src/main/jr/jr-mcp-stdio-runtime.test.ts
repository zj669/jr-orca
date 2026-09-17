import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { startJrMcpStdioFromEnv } from './jr-mcp-stdio-runtime'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe('JR MCP stdio runtime', () => {
  it('closes the database once when stdin emits end and close', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'orca-jr-mcp-runtime-'))
    temporaryDirectories.push(directory)
    const stdin = new PassThrough()
    const store = startJrMcpStdioFromEnv(
      {
        JR_DB_PATH: join(directory, 'jr.sqlite'),
        JR_CARD_ID: 'card-1'
      },
      stdin,
      new PassThrough()
    )
    const close = vi.spyOn(store, 'close')
    const closed = once(stdin, 'close')

    stdin.end()
    await closed

    expect(close).toHaveBeenCalledOnce()
  })
})
