import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { JR_MCP_STDIO_FILENAME, resolveJrMcpStdioPath } from './jr-mcp-stdio-path'

describe('resolveJrMcpStdioPath', () => {
  it('uses an adjacent entry when electron-vite appPath is already out/main', () => {
    const builtMainPath = path.join(process.cwd(), 'out', 'main')
    const adjacentEntry = path.join(builtMainPath, JR_MCP_STDIO_FILENAME)
    expect(
      resolveJrMcpStdioPath(builtMainPath, false, (candidate) => candidate === adjacentEntry)
    ).toBe(adjacentEntry)
  })

  it('uses the unpacked nested entry for packaged apps', () => {
    const appPath = path.join('C:', 'Orca', 'resources', 'app.asar')
    expect(resolveJrMcpStdioPath(appPath, true, () => true)).toBe(
      path.join(
        'C:',
        'Orca',
        'resources',
        'app.asar.unpacked',
        'out',
        'main',
        JR_MCP_STDIO_FILENAME
      )
    )
  })
})
