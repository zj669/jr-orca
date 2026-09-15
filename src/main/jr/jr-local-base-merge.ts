import { gitExecFileAsync } from '../git/runner'
import { gitOptionsForWorktree } from '../git/git-runtime-options'
import {
  getSshGitProvider,
  SSH_GIT_PROVIDER_UNAVAILABLE_MESSAGE
} from '../providers/ssh-git-dispatch'
import type { JrMergeIntoBaseInput } from '../../shared/jr/jr-types'

export async function mergeJrBranchIntoBase(input: JrMergeIntoBaseInput): Promise<void> {
  const baseWorktreePath = input.baseWorktreePath.trim()
  const branch = input.branch.trim()
  const expectedBaseRef = normalizeRef(input.expectedBaseRef)
  if (!baseWorktreePath || !branch || !expectedBaseRef) {
    throw new Error('JR 本地合并需要基础 worktree、功能分支和基础分支。')
  }
  const current = normalizeRef(await gitText(['rev-parse', '--abbrev-ref', 'HEAD'], input))
  if (current !== expectedBaseRef) {
    throw new Error(`基础 worktree 当前在 ${current}，不是 ${expectedBaseRef}。`)
  }
  await gitText(['merge', '--no-ff', '--no-edit', branch], input)
}

async function gitText(args: string[], input: JrMergeIntoBaseInput): Promise<string> {
  const result = input.connectionId
    ? await sshExec(input.connectionId, args, input.baseWorktreePath)
    : await gitExecFileAsync(args, gitOptionsForWorktree(input.baseWorktreePath))
  return result.stdout.trim()
}

async function sshExec(
  connectionId: string,
  args: string[],
  cwd: string
): Promise<{ stdout: string; stderr: string }> {
  const provider = getSshGitProvider(connectionId)
  if (!provider) {
    throw new Error(SSH_GIT_PROVIDER_UNAVAILABLE_MESSAGE)
  }
  return provider.exec(args, cwd)
}

function normalizeRef(value: string): string {
  return value
    .trim()
    .replace(/^refs\/heads\//, '')
    .replace(/^origin\//, '')
}
