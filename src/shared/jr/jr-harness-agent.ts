import type { TuiAgent } from '../tui-agent'
import type { JrHarness } from './jr-types'

export type JrHarnessTuiAgent = Extract<TuiAgent, 'cursor' | 'claude' | 'codex' | 'gemini'>

const JR_HARNESS_AGENTS: Record<JrHarness, JrHarnessTuiAgent> = {
  cursorcli: 'cursor',
  claude: 'claude',
  codex: 'codex',
  gemini: 'gemini'
}

export function jrHarnessAgent(harness: JrHarness): JrHarnessTuiAgent {
  return JR_HARNESS_AGENTS[harness]
}
