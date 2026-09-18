import {
  isJrHarness,
  JR_HARNESS_CATALOG,
  type JrUpdateCardInput,
  type JrUpdateReviewConfigurationInput
} from '../../shared/jr/jr-types'

export function resolveJrExecutionHarnessModel(input: JrUpdateCardInput): {
  harness: (typeof JR_HARNESS_CATALOG)[number]
  model: (typeof JR_HARNESS_CATALOG)[number]['models'][number]
} {
  const harness = resolveJrHarness(input.harness)
  const model = harness.models.find((item) => item.id === input.modelId)
  if (!model) {
    throw new Error('该模型不受当前 harness 支持。')
  }
  return { harness, model }
}

export function resolveJrReviewHarnessModel(input: JrUpdateReviewConfigurationInput): {
  harness: (typeof JR_HARNESS_CATALOG)[number]
  model: (typeof JR_HARNESS_CATALOG)[number]['models'][number] | null
} {
  const harness = resolveJrHarness(input.harness)
  const model =
    input.modelId === undefined
      ? null
      : (harness.models.find((item) => item.id === input.modelId) ?? null)
  if (input.modelId !== undefined && !model) {
    throw new Error('该模型不受当前 harness 支持。')
  }
  return { harness, model }
}

function resolveJrHarness(harnessId: string): (typeof JR_HARNESS_CATALOG)[number] {
  if (!isJrHarness(harnessId)) {
    throw new Error('选择的 harness 不在 Phase 1 范围内。')
  }
  const harness = JR_HARNESS_CATALOG.find((item) => item.id === harnessId)
  if (!harness) {
    throw new Error('选择的 harness 不在 Phase 1 范围内。')
  }
  return harness
}
