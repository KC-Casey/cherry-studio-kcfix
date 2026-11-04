import { isCherryOwnedProviderId } from '@shared/data/presets/cherryai'
import type { Model } from '@shared/data/types/model'

const availability: {
  isModelHidden: (model: Model, includeAgentOnlyModels: boolean) => boolean
  isModelUnavailable: (model: Model) => boolean
  getModelDescription: (model: Model) => string | undefined
} = {
  isModelHidden: (model) => isCherryOwnedProviderId(model.providerId),
  isModelUnavailable: (model) => isCherryOwnedProviderId(model.providerId),
  getModelDescription: () => undefined
}

/** Keep historical hosted models hidden without fetching Cherry account state. */
export function useCherryCloudModelAvailability(enabled = true) {
  void enabled
  return availability
}
