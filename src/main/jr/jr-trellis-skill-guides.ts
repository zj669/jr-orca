export const JR_TRELLIS_PLAN_SKILL = `---
name: jr-trellis-plan
description: >-
  Plan a JR card using DB-backed Trellis tools. Use when executing JR planning,
  writing a PRD/design/implementation plan, or when the user mentions jr-trellis-plan.
---

# JR Trellis Plan

JR SQLite is canonical. Do not read or write \`.trellis/\` as source of truth.

## Tools

Call the \`jr-trellis\` MCP server:

1. \`jr_workflow_get\` then \`jr_task_get\` / \`jr_context_get\`
2. \`jr_specs_list\` / \`jr_specs_get\` / \`jr_spec_propose\`
3. \`jr_artifacts_get\` for PRD, design, and implementation plan
4. Write with \`jr_artifact_upsert\`, \`jr_task_update\`, \`jr_context_set\`
5. Log with \`jr_journal_append\` and \`jr_research_append\`

## Transitions

You may call \`jr_card_request_transition\` with \`begin-planning\` after discussion notes exist.
Never request \`request-execution-approval\`. Never promote to 待批准执行, 创建工作树, 交付中, or 已合并.
Ask the human controller to submit execution approval in the JR board.
`

export const JR_TRELLIS_IMPLEMENT_SKILL = `---
name: jr-trellis-implement
description: >-
  Implement an approved JR card using DB-backed Trellis tools. Use when executing
  JR implementation, or when the user mentions jr-trellis-implement.
---

# JR Trellis Implement

JR SQLite is canonical. Do not write \`.trellis/\` files. This prompt's artifacts are a launch snapshot; reread via tools before editing scope.

## Tools

Call the \`jr-trellis\` MCP server:

1. \`jr_task_get\` and \`jr_artifacts_get\` for PRD, design, and implementation plan
2. Implement only that scope in this Orca worktree
3. \`jr_journal_append\` for progress; \`jr_artifact_upsert\` only for sanctioned paths
4. When checks pass, \`jr_card_request_transition\` with \`request-review\`

## Forbidden

Do not merge, push as a ship action, create a worktree, or call \`request-execution-approval\`.
You cannot promote the card to 待批准执行 / 创建工作树 / 交付中 / 已合并.
`

export const JR_TRELLIS_CHECK_SKILL = `---
name: jr-trellis-check
description: >-
  Verify a JR card against DB-backed Trellis artifacts and the Orca diff. Use
  when reviewing JR work or when the user mentions jr-trellis-check.
---

# JR Trellis Check

SQLite is canonical. \`.trellis/\` is a read-only hashed projection.

1. \`jr_task_get\`, \`jr_context_get\`, \`jr_artifacts_get\` for acceptance criteria
2. Compare the Orca worktree diff to that scope
3. \`jr_journal_append\` with check notes
4. \`jr_projection_verify\` if a projection exists; stop on hash mismatch
5. Request review with \`jr_card_request_transition\` / \`request-review\` only from 执行中
`

export const JR_TRELLIS_FINISH_SKILL = `---
name: jr-trellis-finish
description: >-
  Finish a merged JR card: archive lessons and verify the Trellis projection.
  Use when a JR card reached 已合并 or the user mentions jr-trellis-finish.
---

# JR Trellis Finish

1. \`jr_task_get\` and \`jr_journal_append\` with lessons
2. \`jr_projection_sync\` then \`jr_projection_verify\`
3. If hashes differ, stop. Direct \`.trellis/\` mutations are not accepted.
4. Never merge, ship, or create a worktree from this skill
`

export const JR_TRELLIS_SKILL_FILES = {
  'jr-trellis-plan': JR_TRELLIS_PLAN_SKILL,
  'jr-trellis-implement': JR_TRELLIS_IMPLEMENT_SKILL,
  'jr-trellis-check': JR_TRELLIS_CHECK_SKILL,
  'jr-trellis-finish': JR_TRELLIS_FINISH_SKILL
} as const

export type JrTrellisSkillName = keyof typeof JR_TRELLIS_SKILL_FILES
