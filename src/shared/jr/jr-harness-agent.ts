import type { TuiAgent } from '../tui-agent'
import { findCatalogModel, getAgentSessionOptionCatalog } from '../agent-session-option-catalog'
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

export function jrHarnessModelArgs(harness: JrHarness, modelId: string): string | null {
  const catalog = getAgentSessionOptionCatalog(jrHarnessAgent(harness))
  if (!catalog || !findCatalogModel(catalog, modelId)) {
    return null
  }
  const args = catalog.modelApply.launchArgs?.(modelId)
  return args ? args.join(' ') : ''
}
