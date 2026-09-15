import { describe, expect, it } from 'vitest'
import { findJrExistingWorkspace } from './jr-existing-workspace'

describe('findJrExistingWorkspace', () => {
  it('prefers the main git worktree', () => {
    expect(
      findJrExistingWorkspace({
        repositoryId: 'repo-git',
        repos: [
          {
            id: 'repo-git',
            path: '/repo',
            kind: 'git',
            worktreeBaseRef: 'main'
          }
        ],
        worktrees: [
          {
            id: 'repo-git::/feature',
            repoId: 'repo-git',
            path: '/feature',
            branch: 'jr/task',
            isMainWorktree: false
          },
          {
            id: 'repo-git::/repo',
            repoId: 'repo-git',
            path: '/repo',
            branch: 'main',
            isMainWorktree: true
          }
        ],
        folderWorkspaces: []
      })
    ).toMatchObject({ id: 'repo-git::/repo', kind: 'git', branch: 'main' })
  })

  it('uses a folder workspace when the repo has no git worktree', () => {
    expect(
      findJrExistingWorkspace({
        repositoryId: 'repo-folder',
        repos: [
          {
            id: 'repo-folder',
            path: '/project',
            kind: 'folder',
            worktreeBaseRef: 'HEAD'
          }
        ],
        worktrees: [],
        folderWorkspaces: [{ id: 'folder-1', folderPath: '/project', connectionId: null }]
      })
    ).toMatchObject({ path: '/project', kind: 'folder', id: 'folder:folder-1' })
  })
})
