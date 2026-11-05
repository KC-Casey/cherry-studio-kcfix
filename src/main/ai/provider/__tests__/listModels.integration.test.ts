import { createServer, type Server } from 'node:http'

import { mockMainLoggerService } from '@test-mocks/MainLoggerService'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type * as CustomFetchModule from '@main/ai/utils/customFetch'
import { ENDPOINT_TYPE, MODALITY, MODEL_CAPABILITY } from '@shared/data/types/model'
import { SystemProviderIds } from '@shared/utils/systemProviderId'

import { makeProvider } from '../../__tests__/fixtures/provider'
import { GeminiModelsResponseSchema } from '../listModelsSchemas'

const { getRotatedApiKeyMock } = vi.hoisted(() => ({
  getRotatedApiKeyMock: vi.fn<() => string>()
}))

vi.mock('@main/data/services/ProviderService', () => ({
  providerService: {
    getRotatedApiKey: getRotatedApiKeyMock
  }
}))

vi.mock('@main/data/services/ProviderRegistryService', () => ({
  providerRegistryService: {
    isRegistryProvider: vi.fn(() => false)
  }
}))

vi.mock('@main/services/VertexAiService', () => ({
  vertexAiService: {
    getAuthHeaders: vi.fn()
  }
}))

vi.mock('@main/services/CopilotService', () => ({
  copilotService: {
    getToken: vi.fn()
  }
}))

// Listing issues its HTTP through `customFetch` (Electron `net.fetch`, the Chromium stack),
// which has no Chromium behind it under Vitest. Delegate to Node's fetch so the real
// loopback server below stays reachable; the transport is not what this suite exercises.
vi.mock('@main/ai/utils/customFetch', async () => {
  const actual = await vi.importActual<typeof CustomFetchModule>('@main/ai/utils/customFetch')
  return {
    ...actual,
    customFetch: (input: string | URL | Request, init?: RequestInit) => globalThis.fetch(input, init)
  }
})

const { listModels } = await import('../listModels')

const servers: Server[] = []

async function listen(server: Server): Promise<number> {
  servers.push(server)
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('test server did not expose a TCP port')
  return address.port
}

beforeEach(() => {
  vi.clearAllMocks()
  getRotatedApiKeyMock.mockReturnValue('')
})

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()))
        })
    )
  )
})

describe('listModels - Gemini pagination token compatibility', () => {
  const models = [
    { name: 'models/gemini-test', displayName: 'Gemini Test', supportedGenerationMethods: ['generateContent'] }
  ]

  it.each([
    { token: null, expected: undefined },
    { token: undefined, expected: undefined },
    { token: '', expected: '' },
    { token: 'next-page', expected: 'next-page' }
  ])('lists models with nextPageToken=$token', async ({ token, expected }) => {
    const body = { models, nextPageToken: token }
    const port = await listen(
      createServer((_request, response) => {
        response.setHeader('content-type', 'application/json')
        response.end(JSON.stringify(body))
      })
    )
    const provider = makeProvider({
      id: 'custom-gemini',
      presetProviderId: SystemProviderIds.gemini,
      defaultChatEndpoint: ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT,
      endpointConfigs: {
        [ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT]: { baseUrl: `http://127.0.0.1:${port}` }
      }
    })

    const result = await listModels(provider, undefined, { throwOnError: true })

    expect(result.models).toEqual([
      expect.objectContaining({
        id: 'custom-gemini::gemini-test',
        apiModelId: 'gemini-test',
        name: 'Gemini Test'
      })
    ])
    expect(GeminiModelsResponseSchema.parse(body).nextPageToken).toBe(expected)
  })

  it.each([123, {}, [], false])('rejects an invalid pagination token: %j', (nextPageToken) => {
    const result = GeminiModelsResponseSchema.safeParse({ models, nextPageToken })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues.map((issue) => issue.path)).toContainEqual(['nextPageToken'])
  })

  it('still rejects model entries without a name when the pagination token is null', () => {
    const result = GeminiModelsResponseSchema.safeParse({
      models: [{ displayName: 'Missing ID' }],
      nextPageToken: null
    })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues.map((issue) => issue.path)).toContainEqual(['models', 0, 'name'])
  })
})

describe('listModels - LM Studio response isolation', () => {
  it('keeps valid models in order when one response row is malformed', async () => {
    const server = createServer((request, response) => {
      response.setHeader('content-type', 'application/json')
      if (request.url === '/api/v0/models') {
        response.statusCode = 404
        response.end(JSON.stringify({ error: { message: 'not supported by this test server' } }))
        return
      }

      response.end(
        JSON.stringify({
          data: [
            { id: 'first-model', name: 'First Model' },
            'malformed-row-payload',
            { id: 'second-model', owned_by: 'lmstudio' },
            { id: 'first-model', name: 'Duplicate Model' }
          ]
        })
      )
    })
    const port = await listen(server)
    const provider = makeProvider({
      id: SystemProviderIds.lmstudio,
      presetProviderId: SystemProviderIds.lmstudio,
      defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
      endpointConfigs: {
        [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: { baseUrl: `http://127.0.0.1:${port}/v1` }
      }
    })

    const { models } = await listModels(provider)

    expect(models.map((model) => model.apiModelId)).toEqual(['first-model', 'second-model'])
    expect(models[0]?.name).toBe('First Model')
    expect(
      mockMainLoggerService.warn.mock.calls.filter(
        ([message]) => message === 'Skipped malformed OpenAI-compatible model entries'
      )
    ).toEqual([
      [
        'Skipped malformed OpenAI-compatible model entries',
        { providerId: SystemProviderIds.lmstudio, skippedModelCount: 1 }
      ]
    ])
    const logs = JSON.stringify([
      ...mockMainLoggerService.error.mock.calls,
      ...mockMainLoggerService.warn.mock.calls,
      ...mockMainLoggerService.info.mock.calls
    ])
    for (const payloadValue of [
      'malformed-row-payload',
      'first-model',
      'second-model',
      'First Model',
      'Duplicate Model'
    ]) {
      expect(logs).not.toContain(payloadValue)
    }
  })
})

describe('listModels - structured provider metadata', () => {
  it('preserves distinct Gemini input/output limits and ignores invalid optional limits', async () => {
    const port = await listen(
      createServer((_request, response) => {
        response.setHeader('content-type', 'application/json')
        response.end(
          JSON.stringify({
            models: [
              { name: 'models/custom-gemini', inputTokenLimit: 1048576, outputTokenLimit: 65536 },
              ...[null, -1, 0, 1.5, '4096'].map((limit, index) => ({
                name: `models/invalid-${index}`,
                inputTokenLimit: limit,
                outputTokenLimit: limit
              }))
            ]
          })
        )
      })
    )
    const provider = makeProvider({
      id: 'gemini',
      defaultChatEndpoint: ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT,
      endpointConfigs: { [ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT]: { baseUrl: `http://127.0.0.1:${port}` } }
    })
    const { models } = await listModels(provider, undefined, { throwOnError: true })
    expect(models).toHaveLength(6)
    expect(models[0]).toMatchObject({ apiModelId: 'custom-gemini', maxInputTokens: 1048576, maxOutputTokens: 65536 })
    expect(models[0].contextWindow).toBeUndefined()
    for (const model of models.slice(1)) {
      expect(model.maxInputTokens).toBeUndefined()
      expect(model.maxOutputTokens).toBeUndefined()
    }
  })

  it('keeps richer image metadata for duplicate OpenRouter IDs without discarding primary-only fields', async () => {
    const port = await listen(
      createServer((request, response) => {
        response.setHeader('content-type', 'application/json')
        const data =
          request.url === '/models'
            ? [
                {
                  id: 'vendor/image',
                  context_length: 100000,
                  top_provider: { max_completion_tokens: 16000 },
                  supported_parameters: ['tools']
                }
              ]
            : request.url === '/image'
              ? [
                  {
                    id: 'vendor/image',
                    context_length: 200000,
                    architecture: { input_modalities: ['text', 'image'], output_modalities: ['image'] },
                    supported_parameters: ['structured_outputs']
                  }
                ]
              : []
        response.end(JSON.stringify({ data }))
      })
    )
    const root = `http://127.0.0.1:${port}`
    const provider = makeProvider({
      id: 'openrouter',
      endpointConfigs: {
        [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: {
          baseUrl: 'https://openrouter.ai/api/v1/',
          modelsApiUrls: {
            default: `${root}/models`,
            embedding: `${root}/embedding`,
            image: `${root}/image`,
            reranker: `${root}/rerank`
          }
        }
      }
    })
    const { models } = await listModels(provider, undefined, { throwOnError: true })
    expect(models).toHaveLength(1)
    expect(models[0]).toMatchObject({
      apiModelId: 'vendor/image',
      contextWindow: 200000,
      maxOutputTokens: 16000,
      inputModalities: [MODALITY.TEXT, MODALITY.IMAGE],
      outputModalities: [MODALITY.IMAGE],
      endpointTypes: [ENDPOINT_TYPE.OPENAI_IMAGE_GENERATION],
      capabilities: [
        MODEL_CAPABILITY.FUNCTION_CALL,
        MODEL_CAPABILITY.IMAGE_RECOGNITION,
        MODEL_CAPABILITY.IMAGE_GENERATION,
        MODEL_CAPABILITY.STRUCTURED_OUTPUT
      ]
    })
  })

  it('uses only structured OpenRouter declarations and preserves raw IDs on provider copies', async () => {
    const port = await listen(
      createServer((request, response) => {
        response.setHeader('content-type', 'application/json')
        response.end(
          JSON.stringify({
            data:
              request.url === '/models'
                ? [
                    {
                      id: 'vendor/custom:free',
                      architecture: {
                        input_modalities: ['text', 'image', 'file', 'future'],
                        output_modalities: ['text']
                      },
                      context_length: 200000,
                      top_provider: { max_completion_tokens: 32000 },
                      supported_parameters: ['tools', 'reasoning', 'structured_outputs']
                    },
                    {
                      id: 'vendor/vision-reasoning-tools',
                      architecture: null,
                      context_length: -1,
                      top_provider: { max_completion_tokens: 'bad' }
                    },
                    {
                      id: 'vendor/unknown',
                      architecture: { input_modalities: ['future'], output_modalities: null },
                      supported_parameters: 42
                    }
                  ]
                : []
          })
        )
      })
    )
    const root = `http://127.0.0.1:${port}`
    const provider = makeProvider({
      id: 'my-router',
      presetProviderId: 'openrouter',
      endpointConfigs: {
        [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: {
          baseUrl: 'https://openrouter.ai/api/v1/',
          modelsApiUrls: {
            default: `${root}/models`,
            embedding: `${root}/embedding`,
            image: `${root}/image`,
            reranker: `${root}/rerank`
          }
        }
      }
    })
    const { models } = await listModels(provider, undefined, { throwOnError: true })
    expect(models).toHaveLength(3)
    expect(models[0]).toMatchObject({
      apiModelId: 'vendor/custom:free',
      inputModalities: [MODALITY.TEXT, MODALITY.IMAGE],
      outputModalities: [MODALITY.TEXT],
      contextWindow: 200000,
      maxOutputTokens: 32000,
      capabilities: [
        MODEL_CAPABILITY.IMAGE_RECOGNITION,
        MODEL_CAPABILITY.FILE_INPUT,
        MODEL_CAPABILITY.FUNCTION_CALL,
        MODEL_CAPABILITY.REASONING,
        MODEL_CAPABILITY.STRUCTURED_OUTPUT
      ]
    })
    for (const model of models.slice(1)) {
      expect(model.capabilities).toEqual([])
      expect(model.inputModalities).toBeUndefined()
      expect(model.outputModalities).toBeUndefined()
      expect(model.contextWindow).toBeUndefined()
      expect(model.maxOutputTokens).toBeUndefined()
    }
  })

  it.each(['openrouter', 'copied-openrouter'])(
    'keeps %s discovery and its key on the configured destination',
    async (id) => {
      const received: Array<{ path: string | undefined; authorization: string | undefined }> = []
      const port = await listen(
        createServer((request, response) => {
          received.push({ path: request.url, authorization: request.headers.authorization })
          response.setHeader('content-type', 'application/json')
          response.end(JSON.stringify({ data: [{ id: 'gateway/model', name: 'Gateway model' }] }))
        })
      )
      const baseUrl = `http://127.0.0.1:${port}/gateway/v2`
      const originalFetch = globalThis.fetch
      const requestedUrls: string[] = []
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
        const url = input instanceof Request ? input.url : String(input)
        requestedUrls.push(url)
        if (url !== `${baseUrl}/models`) throw new Error('Discovery attempted an unrelated destination')
        return originalFetch(input, init)
      })
      getRotatedApiKeyMock.mockReturnValue('copied-provider-test-key')
      const provider = makeProvider({
        id,
        presetProviderId: 'openrouter',
        defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
        endpointConfigs: {
          [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: {
            baseUrl,
            modelsApiUrls: {
              default: 'https://openrouter.ai/api/v1/models',
              embedding: 'https://openrouter.ai/api/v1/embeddings/models',
              image: 'https://openrouter.ai/api/v1/images/models',
              reranker: 'https://openrouter.ai/api/v1/models?output_modalities=rerank'
            }
          }
        }
      })

      try {
        const { models } = await listModels(provider, undefined, { throwOnError: true })
        expect(models).toMatchObject([
          { id: `${id}::gateway/model`, apiModelId: 'gateway/model', name: 'Gateway model' }
        ])
        expect(requestedUrls).toEqual([`${baseUrl}/models`])
        expect(received).toEqual([{ path: '/gateway/v2/models', authorization: 'Bearer copied-provider-test-key' }])
      } finally {
        fetchSpy.mockRestore()
      }
    }
  )
})
