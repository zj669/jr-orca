export const JR_TRELLIS_TOOL_NAMES = [
  'jr_workflow_get',
  'jr_specs_list',
  'jr_specs_get',
  'jr_task_get',
  'jr_artifacts_list',
  'jr_artifacts_get',
  'jr_artifact_upsert',
  'jr_journal_append',
  'jr_research_append',
  'jr_card_request_transition'
] as const

export type JrTrellisToolName = (typeof JR_TRELLIS_TOOL_NAMES)[number]

export type JrMcpToolDefinition = {
  name: JrTrellisToolName
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, { type: string; description: string }>
    required?: string[]
  }
}

const PATH_PROPERTY = { type: 'string', description: 'Logical Trellis path in JR SQLite.' }
const ENTRY_PROPERTY = { type: 'string', description: 'Markdown entry to append.' }

export const JR_TRELLIS_TOOL_DEFINITIONS: readonly JrMcpToolDefinition[] = [
  {
    name: 'jr_workflow_get',
    description: 'Read the JR card lifecycle and workflow.md artifact. SQLite is canonical.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'jr_specs_list',
    description: 'List spec/* artifacts for the current JR card.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'jr_specs_get',
    description: 'Read one spec artifact by logical path.',
    inputSchema: { type: 'object', properties: { path: PATH_PROPERTY }, required: ['path'] }
  },
  {
    name: 'jr_task_get',
    description: 'Read the current JR card, task artifacts, and recent audit events.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'jr_artifacts_list',
    description: 'List JR artifacts with versions. Does not read .trellis/ files.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'jr_artifacts_get',
    description: 'Read one JR artifact and its revision history metadata.',
    inputSchema: { type: 'object', properties: { path: PATH_PROPERTY }, required: ['path'] }
  },
  {
    name: 'jr_artifact_upsert',
    description: 'Write a sanctioned JR artifact. Versioned and audited. Never writes .trellis/.',
    inputSchema: {
      type: 'object',
      properties: {
        path: PATH_PROPERTY,
        content: { type: 'string', description: 'Full markdown content to store.' }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'jr_journal_append',
    description: 'Append a journal entry to tasks/<cardId>/journal.md.',
    inputSchema: { type: 'object', properties: { entry: ENTRY_PROPERTY }, required: ['entry'] }
  },
  {
    name: 'jr_research_append',
    description: 'Append research notes to tasks/<cardId>/research.md.',
    inputSchema: { type: 'object', properties: { entry: ENTRY_PROPERTY }, required: ['entry'] }
  },
  {
    name: 'jr_card_request_transition',
    description:
      'Request a worker-safe card transition. Cannot promote to pending_execution_approval, creating_worktree, shipping, or merged.',
    inputSchema: {
      type: 'object',
      properties: {
        transition: {
          type: 'string',
          description: 'begin-discussion | begin-planning | request-review'
        }
      },
      required: ['transition']
    }
  }
]
