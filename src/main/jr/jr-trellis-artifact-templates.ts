import type { JrCard } from '../../shared/jr/jr-types'

export function jrTaskArtifactPath(cardId: string, artifact: string): string {
  return `tasks/${cardId}/${artifact}`
}

export function buildJrPlanningArtifacts(
  card: JrCard
): readonly { path: string; content: string }[] {
  const selectedModel = card.model?.label ?? '未选择'
  const selectedHarness = card.harness ?? '未选择'
  return [
    {
      path: 'workflow.md',
      content:
        '# JR Trellis workflow\n\nPlan → Execute → Finish is controlled by JR card state and controller approvals.\n'
    },
    {
      path: 'spec/jr-controller.md',
      content:
        '# JR controller contract\n\nTask harness agents use JR MCP tools for workflow/spec/task data and cannot self-authorize execution or merge.\n'
    },
    {
      path: jrTaskArtifactPath(card.id, 'prd.md'),
      content: `# ${card.title}\n\n## Outcome\n${card.description}\n\n## Acceptance criteria\n- Define the user-visible outcome.\n- Keep work inside the approved task boundary.\n- Request review only after validation.\n`
    },
    {
      path: jrTaskArtifactPath(card.id, 'design.md'),
      content: `# ${card.title} — design\n\nHarness: ${selectedHarness}\nModel: ${selectedModel}\n\nRecord contracts, risks, and rollback before execution approval.\n`
    },
    {
      path: jrTaskArtifactPath(card.id, 'implement.md'),
      content:
        '# Implementation checklist\n\n1. Read JR-backed PRD and specs through jr-trellis MCP tools.\n2. Implement only the approved scope.\n3. Run appropriate checks.\n4. Call jr_card_request_transition with request-review; do not merge.\n'
    },
    {
      path: jrTaskArtifactPath(card.id, 'research.md'),
      content: `# ${card.title} — research\n\nCapture sources and decisions with jr_research_append. Do not treat .trellis/ as writable.\n`
    },
    {
      path: jrTaskArtifactPath(card.id, 'context.md'),
      content: `# ${card.title} — context\n\nRepository: ${card.execution.repositoryId ?? 'unconfigured'}\nBase ref: ${card.execution.baseRef ?? 'unconfigured'}\nPriority: ${card.priority ?? 'unset'}\n`
    },
    {
      path: jrTaskArtifactPath(card.id, 'task.md'),
      content: `# ${card.title}\n\n## Summary\n${card.description}\n\n## Acceptance\n${card.acceptance || 'Define measurable acceptance before execution approval.'}\n`
    }
  ]
}

export function buildJrExecutionPrompt(card: JrCard): string {
  const artifactContext = card.artifacts
    .map((artifact) => `### ${artifact.path}\n${artifact.content.trim()}`)
    .join('\n\n')
  return `You are executing JR card ${card.id}.

## Approved task
Title: ${card.title}
Harness: ${card.harness ?? 'unconfigured'}
Model: ${card.model?.label ?? 'unconfigured'}

${card.description}

Use the approved scope and acceptance criteria below. JR's SQLite database is canonical for Trellis data: this prompt is a launch-time projection. Read and write workflow/spec/task artifacts through the jr-trellis MCP tools (\`jr_artifact_upsert\`, \`jr_task_update\`, \`jr_journal_append\`). Follow skills \`jr-trellis-plan\`, \`jr-trellis-implement\`, \`jr-trellis-check\`, and \`jr-trellis-finish\`. Do not treat .trellis files as a writable source of truth. Work only in this Orca worktree, run appropriate checks, and request review with \`jr_card_request_transition\` / \`request-review\` when ready. You cannot promote this card to 待批准执行, 创建工作树, 交付中, or 已合并. Do not merge. Call \`jr_projection_verify\` before finish; mismatched hashes mean stop.

## JR-backed Trellis artifacts
${artifactContext}
`
}
