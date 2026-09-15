import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { gitExecFileAsync } from '../git/runner'
import { mergeJrBranchIntoBase } from './jr-local-base-merge'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe('mergeJrBranchIntoBase', () => {
  it('fast-forwards a feature branch into the current base worktree', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'jr-merge-'))
    directories.push(directory)
    await git(['init'], directory)
    await git(['symbolic-ref', 'HEAD', 'refs/heads/main'], directory)
    await git(['config', 'user.email', 'jr@example.com'], directory)
    await git(['config', 'user.name', 'JR'], directory)
    await writeFile(join(directory, 'README.md'), 'base\n')
    await git(['add', 'README.md'], directory)
    await git(['commit', '-m', 'base'], directory)
    await git(['checkout', '-b', 'jr/task'], directory)
    await writeFile(join(directory, 'feature.md'), 'shipped\n')
    await git(['add', 'feature.md'], directory)
    await git(['commit', '-m', 'feature'], directory)
    await git(['checkout', 'main'], directory)

    await mergeJrBranchIntoBase({
      baseWorktreePath: directory,
      branch: 'jr/task',
      expectedBaseRef: 'main'
    })

    const files = await git(['ls-tree', '-r', '--name-only', 'HEAD'], directory)
    expect(files.stdout.split('\n')).toEqual(expect.arrayContaining(['README.md', 'feature.md']))
  })

  it('checks out the expected base when HEAD is detached, then merges', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'jr-merge-detached-'))
    directories.push(directory)
    await git(['init'], directory)
    await git(['symbolic-ref', 'HEAD', 'refs/heads/main'], directory)
    await git(['config', 'user.email', 'jr@example.com'], directory)
    await git(['config', 'user.name', 'JR'], directory)
    await writeFile(join(directory, 'README.md'), 'base\n')
    await git(['add', 'README.md'], directory)
    await git(['commit', '-m', 'base'], directory)
    await git(['checkout', '-b', 'jr/task'], directory)
    await writeFile(join(directory, 'feature.md'), 'shipped\n')
    await git(['add', 'feature.md'], directory)
    await git(['commit', '-m', 'feature'], directory)
    await git(['checkout', 'main'], directory)
    await git(['checkout', '--detach'], directory)

    await mergeJrBranchIntoBase({
      baseWorktreePath: directory,
      branch: 'refs/heads/jr/task',
      expectedBaseRef: 'main'
    })

    const head = await git(['rev-parse', '--abbrev-ref', 'HEAD'], directory)
    expect(head.stdout.trim()).toBe('main')
    const files = await git(['ls-tree', '-r', '--name-only', 'HEAD'], directory)
    expect(files.stdout.split('\n')).toEqual(expect.arrayContaining(['README.md', 'feature.md']))
  })

  it('refuses to merge when the expected base cannot be checked out', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'jr-merge-wrong-'))
    directories.push(directory)
    await git(['init'], directory)
    await git(['symbolic-ref', 'HEAD', 'refs/heads/main'], directory)
    await git(['config', 'user.email', 'jr@example.com'], directory)
    await git(['config', 'user.name', 'JR'], directory)
    await writeFile(join(directory, 'README.md'), 'base\n')
    await git(['add', 'README.md'], directory)
    await git(['commit', '-m', 'base'], directory)

    await expect(
      mergeJrBranchIntoBase({
        baseWorktreePath: directory,
        branch: 'jr/task',
        expectedBaseRef: 'release'
      })
    ).rejects.toThrow('不是 release')
  })
})

function git(args: string[], cwd: string) {
  return gitExecFileAsync(args, { cwd })
}
