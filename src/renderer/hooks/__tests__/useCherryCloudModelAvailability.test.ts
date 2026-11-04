import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { Model } from '@shared/data/types/model'

import { useCherryCloudModelAvailability } from '../useCherryCloudModelAvailability'

function model(providerId: string): Model {
  return {
    id: `${providerId}::test`,
    providerId,
    name: 'test',
    capabilities: [],
    supportsStreaming: true,
    isEnabled: true,
    isHidden: false
  }
}

describe('private fork model availability', () => {
  it('hides Cherry-owned models without contacting account services, but keeps third-party models selectable', () => {
    const request = vi.mocked(window.api.ipcApi.request)
    request.mockClear()
    const { result } = renderHook(() => useCherryCloudModelAvailability())
    for (const id of ['cherryai', 'cherryai-subscription', 'cherryin']) {
      expect(result.current.isModelHidden(model(id), false)).toBe(true)
      expect(result.current.isModelHidden(model(id), true)).toBe(true)
      expect(result.current.isModelUnavailable(model(id))).toBe(true)
    }
    for (const id of ['openai', 'openai-codex', 'anthropic', 'ollama']) {
      expect(result.current.isModelHidden(model(id), false)).toBe(false)
      expect(result.current.isModelUnavailable(model(id))).toBe(false)
    }
    expect(request.mock.calls.filter(([name]) => name.startsWith('cherry_cloud.'))).toEqual([])
  })
})
