# JR Delivery Board

A local kanban panel for task-driven AI delivery. JR keeps Trellis-shaped task artifacts in SQLite, creates a real Git worktree when a card begins, and reserves the final merge for Walker.

## What it does

- **JR board** — Chinese kanban UI: 待执行 → 开发中 → 待审批 → 已合并.
- **Database-first artifacts** — PRD, design, implementation checklist, workflow, spec, and context manifests are stored in local SQLite (`.jr/jr.sqlite`). A worktree’s `.trellis/` directory is a generated projection, never the source of truth.
- **Worktree execution** — clicking a 待执行 card creates a unique branch and native `git worktree`, then writes its database artifacts into `.trellis/`.
- **Trellis-compatible flow** — generated artifacts encode Plan → Execute → Finish, with the normal Trellis-style `workflow.md`, `spec/`, `tasks/<task>/task.json`, `prd.md`, `design.md`, `implement.md`, and JSONL manifests.
- **Approval gate** — developers move a card to 待审批; the **批准并合并到基线** action validates the projected artifacts, commits the worktree, merges it into the recorded base branch, and moves the card to 已合并.

## Run locally

Requires Node.js 22+ (for the built-in SQLite module) and Git.

```bash
npm install
npm run dev -- --hostname 127.0.0.1 --port 43123
```

Open <http://127.0.0.1:43123>.

Run checks with:

```bash
npm run lint
npm run build
```

The first visit creates a demo card and `.jr/jr.sqlite`. Both are local, ignored state. Delete `.jr/` to reset the demo.

## Execution guardrails

- JR only creates a worktree if the base checkout is clean. Commit or stash pending work first.
- The browser process runs Git against the repository where the server was started. Set `JR_REPOSITORY_ROOT` if the board should manage another local repository.
- Worktrees default to `~/.jr-worktrees/<repository-name>`. Override that location with `JR_WORKTREE_ROOT`.
- Approval requires the server checkout to still be on the card’s recorded base branch. A merge conflict leaves the card in 待审批 for manual resolution.
- Directly editing a generated `.trellis/` file blocks approval. Update the database artifact through JR in a production extension; this first slice deliberately exposes the records read-only.

## Orca and Trellis

This is a stable local sidecar for [Orca](https://github.com/stablyai/orca), rather than a wholesale fork of Orca’s Electron desktop app. Orca is MIT-licensed and worktree-native: every task is a real Git worktree with its own branch, directory, terminals, and review lifecycle. Orca can detect/import external Git worktrees, so it can manage the same worktrees that JR creates. Its documented plugin panel/worker system is currently experimental; the next integration can package this panel as an Orca plugin when that API stabilizes.

The generated task shape follows [Trellis](https://github.com/mindfold-ai/Trellis) and its [workflow](https://docs.trytrellis.app/start/how-it-works): shared specs, task PRD/design/implementation artifacts, context manifests, and Plan → Execute → Finish. This project does not bundle Trellis source or invoke its installer. Trellis declares AGPL-3.0; review its license and Mindfold’s commercial guidance before distributing a product that incorporates Trellis itself.

## Architecture

```text
Browser board
    │
Next.js API routes
    ├── SQLite: cards, Trellis artifacts, lifecycle audit (canonical)
    ├── Git: create/commit/merge isolated worktrees
    └── Projection: SQLite artifacts → worktree/.trellis/
                                      │
                                      └── Orca can import/manage it
```

For production, add an Orca CLI/worker adapter to start an AI agent in the created worktree, GitHub/Origin PR and CI callbacks, and authenticated approval permissions. The SQLite service boundary is intentionally kept separate so this can become a native Orca panel later.
