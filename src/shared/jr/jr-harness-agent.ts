import type { TuiAgent } from '../tui-agent'
import type { JrHarness } from './jr-types'

const JR_HARNESS_AGENTS: Record<
  JrHarness,
  Extract<TuiAgent, 'cursor' | 'claude' | 'codex' | 'gemini'>
> = {
  cursorcli: 'cursor',
  claude: 'claude',
  codex: 'codex',
  gemini: 'gemini'
}

export function jrHarnessAgent(harness: JrHarness): TuiAgent {
  return JR_HARNESS_AGENTS[harness]
}
