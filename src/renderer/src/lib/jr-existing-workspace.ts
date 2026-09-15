import { folderWorkspaceKey } from '../../../shared/workspace-scope'
import { isFolderRepo } from '../../../shared/repo-kind'

export type JrExistingWorkspace = {
  id: string
  path: string
  branch: string
  connectionId?: string | null
  kind: 'git' | 'folder'
}

export type JrWorkspaceRepoRef = {
  id: string
  path: string
  kind?: 'git' | 'folder'
  worktreeBaseRef?: string
  connectionId?: string | null
}

export type JrWorkspaceWorktreeRef = {
  id: string
  path: string
  branch: string
  repoId: string
  isMainWorktree?: boolean
}

export type JrWorkspaceFolderRef = {
  id: string
  folderPath: string
  connectionId?: string | null
}

export function findJrExistingWorkspace(input: {
  repositoryId: string
  repos: readonly JrWorkspaceRepoRef[]
  worktrees: readonly JrWorkspaceWorktreeRef[]
  folderWorkspaces: readonly JrWorkspaceFolderRef[]
}): JrExistingWorkspace | null {
  const repo = input.repos.find((item) => item.id === input.repositoryId)
  if (!repo) {
    return null
  }
  const repoWorktrees = input.worktrees.filter((worktree) => worktree.repoId === repo.id)
  const preferred =
    repoWorktrees.find((worktree) => worktree.isMainWorktree) ??
    repoWorktrees.find((worktree) => worktree.path === repo.path) ??
    repoWorktrees[0]
  if (preferred) {
    return {
      id: preferred.id,
      path: preferred.path,
      branch: preferred.branch || repo.worktreeBaseRef || 'HEAD',
      connectionId: repo.connectionId,
      kind: isFolderRepo(repo) ? 'folder' : 'git'
    }
  }
  const folder = input.folderWorkspaces.find((workspace) => workspace.folderPath === repo.path)
  if (folder) {
    return {
      id: folderWorkspaceKey(folder.id),
      path: folder.folderPath,
      branch: repo.worktreeBaseRef || 'HEAD',
      connectionId: folder.connectionId ?? repo.connectionId,
      kind: 'folder'
    }
  }
  if (isFolderRepo(repo)) {
    return {
      id: `${repo.id}::${repo.path}`,
      path: repo.path,
      branch: repo.worktreeBaseRef || 'HEAD',
      connectionId: repo.connectionId,
      kind: 'folder'
    }
  }
  return null
}
