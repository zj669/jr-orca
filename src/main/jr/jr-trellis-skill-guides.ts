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

1. \`jr_workflow_get\` then \`jr_task_get\`
2. \`jr_specs_list\` / \`jr_specs_get\`
3. \`jr_artifacts_get\` for \`tasks/<cardId>/prd.md\`, \`design.md\`, and \`implement.md\`
4. Write with \`jr_artifact_upsert\` and log decisions with \`jr_journal_append\`
5. Capture research with \`jr_research_append\`

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
