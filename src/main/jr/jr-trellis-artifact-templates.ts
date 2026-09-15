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
        '# JR controller contract\n\nTask harness agents use JR tools for workflow/spec/task data and cannot self-authorize execution or merge.\n'
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
        '# Implementation checklist\n\n1. Read JR-backed PRD and specs.\n2. Implement only the approved scope.\n3. Run appropriate checks.\n4. Request review; do not merge.\n'
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

Use the approved scope and acceptance criteria below. JR's SQLite database is canonical for Trellis data: this prompt is its launch-time projection. Do not treat .trellis files as a writable source of truth. Work only in this Orca worktree, run appropriate checks, and request review when ready. Do not merge.

## JR-backed Trellis artifacts
${artifactContext}
`
}
