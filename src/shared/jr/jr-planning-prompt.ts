import type { JrCard } from './jr-types'

export function buildJrPlanningPrompt(card: JrCard, mode: 'discussion' | 'planning'): string {
  const phase = mode === 'discussion' ? '讨论中' : '规划中'
  return `You are in a JR ${phase} session for card ${card.id}.

## Card
Title: ${card.title}
Harness: ${card.harness ?? 'unconfigured'}
Model: ${card.model?.label ?? 'unconfigured'}
Priority: ${card.priority ?? 'unset'}

${card.description}

Acceptance:
${card.acceptance || 'Not yet written.'}

## Rules
This is a no-code-write planning session. Do not edit application source. Do not create a worktree. Do not merge.

JR SQLite is canonical. Use jr-trellis MCP tools (\`jr_task_get\`, \`jr_artifact_upsert\`, \`jr_journal_append\`, \`jr_research_append\`, \`jr_context_set\`, \`jr_spec_propose\`). Follow skill \`jr-trellis-plan\`. Never request execution approval. Never write .trellis/ files.

${mode === 'discussion' ? 'Capture decisions in discussion notes, then ask the controller to move to 规划中.' : 'Write PRD, research, context, design, and implementation plan. Ask the controller to submit 待批准执行.'}
`
}
