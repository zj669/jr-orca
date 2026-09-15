import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const JR_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['jr', 'mcp'],
    summary: 'Run the JR Trellis MCP server on stdio against desktop SQLite',
    usage: 'orca jr mcp [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Reads JR_DB_PATH, JR_CARD_ID, and JR_WORKTREE_PATH from the environment.',
      'Always binds as a task-agent. Does not write .trellis/ as source of truth.'
    ],
    examples: ['orca jr mcp']
  },
  {
    path: ['jr', 'call'],
    summary: 'Call one JR Trellis tool against desktop SQLite',
    usage: 'orca jr call --tool <name> [--args <json>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'tool', 'args'],
    notes: ['One-shot JSON-RPC tool call used by remote MCP bridges. SQLite remains canonical.'],
    examples: ['orca jr call --tool jr_task_get --json']
  },
  {
    path: ['jr', 'tools'],
    summary: 'List JR Trellis MCP tool names',
    usage: 'orca jr tools [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    examples: ['orca jr tools --json']
  }
]
