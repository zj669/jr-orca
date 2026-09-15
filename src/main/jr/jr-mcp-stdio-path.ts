import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { getAppEnvironment, hasAppEnvironment } from '../../shared/app-environment'

export const JR_MCP_STDIO_FILENAME = 'jr-mcp-stdio.js'

export function resolveJrMcpStdioPath(
  appPath: string,
  isPackaged: boolean,
  pathExists: (candidate: string) => boolean = existsSync
): string {
  const usesAsarArchive = isPackaged && appPath.includes('app.asar')
  const basePath = usesAsarArchive ? appPath.replace('app.asar', 'app.asar.unpacked') : appPath
  const adjacentBuildEntry = join(basePath, JR_MCP_STDIO_FILENAME)
  if (!usesAsarArchive && pathExists(adjacentBuildEntry)) {
    return adjacentBuildEntry
  }
  return join(basePath, 'out', 'main', JR_MCP_STDIO_FILENAME)
}

export function resolveJrMcpStdioPathFromProcess(
  cwd: string,
  resourcesPath: string | undefined,
  pathExists: (candidate: string) => boolean = existsSync
): string {
  if (resourcesPath) {
    const packagedEntry = join(
      resourcesPath,
      'app.asar.unpacked',
      'out',
      'main',
      JR_MCP_STDIO_FILENAME
    )
    if (pathExists(packagedEntry)) {
      return packagedEntry
    }
  }
  return resolveJrMcpStdioPath(cwd, false, pathExists)
}

export function getJrMcpStdioPath(): string {
  if (hasAppEnvironment()) {
    const app = getAppEnvironment()
    return resolveJrMcpStdioPath(app.getAppPath(), app.isPackaged())
  }
  return resolveJrMcpStdioPathFromProcess(process.cwd(), process.resourcesPath)
}
