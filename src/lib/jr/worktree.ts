import { execFile as execFileCallback } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

import type { JrCard } from "@/lib/jr/types";

const execFile = promisify(execFileCallback);

type WorktreeInfo = {
  branch: string;
  baseBranch: string;
  worktreePath: string;
  executionProvider: "git-worktree";
};

async function runGit(args: string[], cwd: string) {
  const { stdout } = await execFile("git", args, {
    cwd,
    maxBuffer: 1024 * 1024,
  });
  return stdout.trim();
}

export async function getRepositoryRoot() {
  const requestedRoot = process.env.JR_REPOSITORY_ROOT ?? process.cwd();
  return runGit(["rev-parse", "--show-toplevel"], requestedRoot);
}

async function assertBaseWorkspaceClean(repoRoot: string) {
  const output = await runGit(
    ["status", "--porcelain", "--untracked-files=normal"],
    repoRoot,
  );
  if (output) {
    throw new Error(
      "主工作区有未提交改动。请先提交或暂存，再从 JR 创建隔离 worktree。",
    );
  }
}

function safePathPart(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff-]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48);
}

export async function createNativeWorktree(card: JrCard): Promise<WorktreeInfo> {
  const repoRoot = await getRepositoryRoot();
  await assertBaseWorkspaceClean(repoRoot);

  const baseBranch = await runGit(["branch", "--show-current"], repoRoot);
  if (!baseBranch) {
    throw new Error("当前仓库处于 detached HEAD，JR 无法确定要合并回的基线分支。");
  }

  const suffix = randomUUID().slice(0, 6);
  const slug = safePathPart(card.title) || "jr-task";
  const branch = `jr/${slug}-${suffix}`;
  const root =
    process.env.JR_WORKTREE_ROOT ??
    join(homedir(), ".jr-worktrees", basename(repoRoot));
  const worktreePath = join(root, `${slug}-${suffix}`);

  await fs.mkdir(root, { recursive: true });
  await runGit(["worktree", "add", "-b", branch, worktreePath, baseBranch], repoRoot);

  return {
    branch,
    baseBranch,
    worktreePath,
    executionProvider: "git-worktree",
  };
}

export async function removeWorktree(
  worktreePath: string,
  branch: string,
  repoRoot?: string,
) {
  const root = repoRoot ?? (await getRepositoryRoot());
  await runGit(["worktree", "remove", "--force", worktreePath], root);
  await runGit(["branch", "-D", branch], root);
}

function projectionRoot(worktreePath: string) {
  return resolve(worktreePath, ".trellis");
}

function projectionPath(worktreePath: string, artifactPath: string) {
  const root = projectionRoot(worktreePath);
  const target = resolve(root, artifactPath);
  if (!target.startsWith(`${root}${sep}`)) {
    throw new Error(`不安全的 Trellis 工件路径：${artifactPath}`);
  }
  return target;
}

export async function materializeTrellisProjection(card: JrCard) {
  if (!card.worktreePath) {
    throw new Error("卡片没有可写入的 worktree。");
  }

  for (const artifact of card.artifacts) {
    const target = projectionPath(card.worktreePath, artifact.path);
    await fs.mkdir(dirname(target), { recursive: true });
    await fs.writeFile(target, artifact.content, "utf8");
  }
}

async function collectProjectionPaths(root: string, directory = root): Promise<string[]> {
  let entries: Awaited<ReturnType<typeof fs.readdir>>;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }

  const paths: string[] = [];
  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      paths.push(...(await collectProjectionPaths(root, fullPath)));
    } else if (entry.isFile()) {
      paths.push(relative(root, fullPath));
    }
  }
  return paths.sort();
}

export async function validateTrellisProjection(card: JrCard) {
  if (!card.worktreePath) {
    throw new Error("卡片没有 worktree，无法审批。");
  }

  const expected = new Set(card.artifacts.map((artifact) => artifact.path));
  const actual = await collectProjectionPaths(projectionRoot(card.worktreePath));
  const unexpected = actual.filter((path) => !expected.has(path));
  if (unexpected.length > 0) {
    throw new Error(
      `发现未登记的 Trellis 投影文件：${unexpected.join("、")}。请先将工件更新回 JR 数据库。`,
    );
  }

  for (const artifact of card.artifacts) {
    const target = projectionPath(card.worktreePath, artifact.path);
    const content = await fs.readFile(target, "utf8").catch(() => null);
    if (content !== artifact.content) {
      throw new Error(
        `Trellis 投影 ${artifact.path} 已被直接修改。请通过 JR 更新数据库工件后再审批。`,
      );
    }
  }
}

async function hasStagedChanges(worktreePath: string) {
  try {
    await runGit(["diff", "--cached", "--quiet"], worktreePath);
    return false;
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === 1) {
      return true;
    }
    throw error;
  }
}

export async function approveAndMerge(card: JrCard) {
  if (!card.worktreePath || !card.branch || !card.baseBranch) {
    throw new Error("卡片缺少 worktree 或分支信息，无法合并。");
  }

  const repoRoot = await getRepositoryRoot();
  const activeBranch = await runGit(["branch", "--show-current"], repoRoot);
  if (activeBranch !== card.baseBranch) {
    throw new Error(
      `当前分支是 ${activeBranch}，但此卡应合并到 ${card.baseBranch}。请切换到基线分支后重试。`,
    );
  }
  await assertBaseWorkspaceClean(repoRoot);
  await validateTrellisProjection(card);

  await runGit(["add", "--all"], card.worktreePath);
  if (await hasStagedChanges(card.worktreePath)) {
    await runGit(
      ["commit", "-m", `chore(jr): complete ${card.title.slice(0, 48)}`],
      card.worktreePath,
    );
  }

  await runGit(
    ["merge", "--no-ff", "--no-edit", card.branch],
    repoRoot,
  );
  return runGit(["rev-parse", "HEAD"], repoRoot);
}
