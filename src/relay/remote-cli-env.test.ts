import { describe, expect, it } from 'vitest'
import { pickRemoteCliEnv } from './remote-cli-env'

describe('pickRemoteCliEnv', () => {
  it('forwards SSH Orca terminal and worktree context for remote CLI calls', () => {
    expect(
      pickRemoteCliEnv({
        ORCA_TERMINAL_HANDLE: 'term_ssh',
        ORCA_WORKTREE_ID: 'repo::remote',
        ORCA_PANE_KEY: 'pane-1',
        ORCA_AGENT_LAUNCH_TOKEN: 'launch-secret',
        ORCA_WORKSPACE_ID: 'workspace-1',
        ORCA_USER_DATA_PATH: '/tmp/orca',
        JR_CARD_ID: 'card-1',
        JR_DB_PATH: '/tmp/jr.sqlite',
        JR_ACTOR_ID: 'codex:card-1',
        JR_ACTOR_KIND: 'task-agent',
        JR_WORKTREE_PATH: '/tmp/worktree',
        PATH: '/usr/bin',
        SECRET_TOKEN: 'nope'
      })
    ).toEqual({
      ORCA_TERMINAL_HANDLE: 'term_ssh',
      ORCA_WORKTREE_ID: 'repo::remote',
      ORCA_PANE_KEY: 'pane-1',
      ORCA_AGENT_LAUNCH_TOKEN: 'launch-secret',
      ORCA_WORKSPACE_ID: 'workspace-1',
      ORCA_USER_DATA_PATH: '/tmp/orca',
      JR_CARD_ID: 'card-1',
      JR_DB_PATH: '/tmp/jr.sqlite',
      JR_ACTOR_ID: 'codex:card-1',
      JR_ACTOR_KIND: 'task-agent',
      JR_WORKTREE_PATH: '/tmp/worktree',
      PATH: '/usr/bin'
    })
  })
})
