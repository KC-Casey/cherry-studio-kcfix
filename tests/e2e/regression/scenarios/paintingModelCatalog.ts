import type { Page, TestInfo } from '@playwright/test'
import { expect } from '@playwright/test'

import enUS from '@renderer/i18n/locales/en-us.json'
import { createUniqueModelId, ModelSchema, type Model } from '@shared/data/types/model'
import { PaintingSchema } from '@shared/data/types/painting'
import type { Provider } from '@shared/data/types/provider'

import { getSensitiveConfigValues } from '../../../../scripts/e2e/regression/config'
import { startWorkbenchImageServer } from '../fixtures/workbenchImageServer'
import { selectVisibleModel } from '../helpers/models'
import { selectSidebarApp } from '../helpers/navigation'
import { closeOpenSettingsDrawer, openSettingsSection } from '../helpers/settings'
import type { RegressionApp } from '../RegressionApp'

// Catches catalog defaults overwriting explicit settings, cancel losing an edit draft,
// and a later manual input override disappearing after a real process restart.
export async function paintingModelCatalog(app: RegressionApp, mainWindow: Page, testInfo: TestInfo) {
  const server = await startWorkbenchImageServer()
  const providerIds = [`catalog-auto-${Date.now()}`, `catalog-explicit-${Date.now()}`]
  const [automaticProvider, explicitProvider] = providerIds
  const modelId = 'gpt-image-2.6-flare'
  const presetModelId = 'gpt-image-2-6-flare'
  const pendingInstruction = 'Change the red square to green after restoring model defaults'
  const snapshots: Record<string, Model> = {}
  let page = mainWindow
  testInfo.annotations.push({
    type: 'data-source',
    description:
      'Loopback image HTTP fixture; real UI, Electron IPC and SQLite reads, catalog restore and restart. Existing explicit settings are seeded through DataApi, not an old-version database migration. No external provider compatibility or image quality claim.'
  })

  const view = () => page.locator('[data-ui~="paintings.view"]:visible')
  const drawer = () => page.getByRole('dialog', { name: enUS['models.edit'], exact: true })
  const vision = () =>
    drawer()
      .getByRole('group', { name: enUS['settings.models.add.input_modalities.label'], exact: true })
      .getByRole('button', { name: enUS['models.type.vision'], exact: true })
  const send = () => view().getByRole('button', { name: enUS['chat.input.send'], exact: true })
  const screenshot = (name: string) =>
    page
      .screenshot({
        animations: 'disabled',
        mask: [
          page.locator('input[type="password"]'),
          ...getSensitiveConfigValues()
            .filter(Boolean)
            .map((value) => page.getByText(value, { exact: false }))
        ]
      })
      .then((body) => testInfo.attach(`P-03 ${name} (loopback fixture)`, { body, contentType: 'image/png' }))
  const readModel = async (providerId: string) => {
    const response = await page.evaluate(
      (id) => window.api.dataApi.request({ id: 'catalog-read-model', method: 'GET', path: `/models/${id}` }),
      createUniqueModelId(providerId, modelId)
    )
    expect(response.status).toBe(200)
    return ModelSchema.parse(response.data)
  }
  const readProvider = async () => {
    const response = await page.evaluate(
      (id) => window.api.dataApi.request({ id: 'catalog-read-provider', method: 'GET', path: `/providers/${id}` }),
      explicitProvider
    )
    expect(response.status).toBe(200)
    const { id, name, presetProviderId, endpointConfigs, defaultChatEndpoint, isEnabled } = response.data as Provider
    return { id, name, presetProviderId, endpointConfigs, defaultChatEndpoint, isEnabled }
  }
  const readPaintings = async (providerId = explicitProvider) => {
    const response = await page.evaluate(
      (providerId) =>
        window.api.dataApi.request({
          id: 'catalog-read-paintings',
          method: 'GET',
          path: '/paintings',
          params: { providerId }
        }),
      providerId
    )
    expect(response.status).toBe(200)
    return (response.data as { items: unknown[] }).items.map((item) => PaintingSchema.parse(item))
  }
  const openProvider = async (providerId: string) => {
    await openSettingsSection(page, enUS['settings.provider.title'])
    await page.getByTestId(`provider-list-item-${providerId}`).click()
    await expect(page.getByTestId('provider-model-list')).toBeVisible()
  }
  const openEditor = async (providerId: string) => {
    await openProvider(providerId)
    // Each case-owned provider has exactly one model, so its Settings action is unambiguous.
    await page
      .getByTestId('provider-model-list')
      .getByRole('button', { name: enUS['common.settings'], exact: true })
      .click()
    await expect(
      drawer().getByRole('textbox', { name: enUS['settings.models.add.model_id.label'], exact: true })
    ).toHaveValue(modelId)
    await expect(
      drawer().getByRole('button', { name: enUS['settings.models.catalog.restore'], exact: true })
    ).toBeEnabled()
  }
  const restoreDialog = async () => {
    await drawer().getByRole('button', { name: enUS['settings.models.catalog.restore'], exact: true }).click()
    const dialog = page.getByRole('dialog', { name: enUS['settings.models.catalog.restore'], exact: true })
    await expect(dialog).toContainText(enUS['settings.models.catalog.confirm'])
    return dialog
  }
  const returnToPainting = async () => {
    await closeOpenSettingsDrawer(page)
    await selectSidebarApp(page, enUS['title.paintings'])
  }
  const assertDraft = async (url: string, instruction: string) => {
    await expect(view().getByTestId('artboard-image-transform')).toHaveAttribute('src', url)
    await expect(
      view().getByRole('region', { name: enUS['paintings.workbench.references'], exact: true }).getByRole('img')
    ).toHaveAttribute('src', url)
    await expect(view().locator('[contenteditable="true"]')).toHaveText(instruction)
  }

  try {
    const statuses = await page.evaluate(
      async ({ providerIds, modelId, baseUrl }) => {
        const statuses: number[] = []
        for (const [index, providerId] of providerIds.entries()) {
          const provider = await window.api.dataApi.request({
            id: 'catalog-create-provider',
            method: 'POST',
            path: '/providers',
            body: {
              providerId,
              presetProviderId: 'openai',
              name: `P-03 ${index === 0 ? 'Automatic' : 'Explicit'} catalog fixture`,
              endpointConfigs: {
                'openai-chat-completions': { baseUrl },
                'openai-responses': { baseUrl },
                'openai-image-generation': { baseUrl },
                'openai-image-edit': { baseUrl }
              },
              apiKeys: [{ id: 'catalog-local-only', key: 'not-a-real-api-key', isEnabled: true }]
            }
          })
          const enabled = await window.api.dataApi.request({
            id: 'catalog-enable-provider',
            method: 'PATCH',
            path: `/providers/${providerId}`,
            body: { isEnabled: true }
          })
          statuses.push(provider.status, enabled.status)
        }
        const model = await window.api.dataApi.request({
          id: 'catalog-create-explicit-model',
          method: 'POST',
          path: '/models',
          body: [
            {
              providerId: providerIds[1],
              modelId,
              name: 'P-03 explicit text-only model',
              description: 'Keep this custom description',
              group: 'P-03 custom group',
              endpointTypes: ['openai-image-generation'],
              capabilities: ['image-generation'],
              inputModalities: ['text'],
              outputModalities: ['image'],
              contextWindow: 100000,
              maxInputTokens: 90000,
              maxOutputTokens: 8192,
              supportsStreaming: true,
              pricing: {
                input: { perMillionTokens: 3, currency: 'USD' },
                output: { perMillionTokens: 4, currency: 'USD' }
              }
            }
          ]
        })
        const notes = await window.api.dataApi.request({
          id: 'catalog-model-notes',
          method: 'PATCH',
          path: `/models/${providerIds[1]}::${modelId}`,
          body: { notes: 'Keep these user notes', isEnabled: true, isHidden: false }
        })
        return [...statuses, model.status, notes.status]
      },
      { providerIds, modelId, baseUrl: server.baseUrl }
    )
    expect(statuses).toEqual([201, 200, 201, 200, 201, 200])
    await page.reload()
    snapshots.explicitBefore = await readModel(explicitProvider)
    const providerBefore = await readProvider()
    expect(providerBefore).toMatchObject({
      id: explicitProvider,
      presetProviderId: 'openai',
      isEnabled: true,
      endpointConfigs: { 'openai-image-generation': { baseUrl: server.baseUrl } }
    })
    expect(snapshots.explicitBefore).toMatchObject({
      id: createUniqueModelId(explicitProvider, modelId),
      name: 'P-03 explicit text-only model',
      description: 'Keep this custom description',
      group: 'P-03 custom group',
      endpointTypes: ['openai-image-generation'],
      notes: 'Keep these user notes',
      isEnabled: true,
      isHidden: false,
      inputModalities: ['text'],
      capabilities: ['image-generation'],
      contextWindow: 100000,
      maxInputTokens: 90000,
      maxOutputTokens: 8192,
      supportsStreaming: true
    })

    await openProvider(automaticProvider)
    await page
      .getByRole('button', { name: enUS['settings.provider.api_setup.add_model_manually'], exact: true })
      .click()
    const addDialog = page.getByRole('dialog', { name: enUS['settings.models.add.add_model'], exact: true })
    await addDialog
      .getByRole('textbox', { name: enUS['settings.models.add.model_id.label'], exact: true })
      .fill(modelId)
    await addDialog.getByRole('button', { name: enUS['settings.models.add.add_model'], exact: true }).click()
    await expect(addDialog).toBeHidden()
    snapshots.automatic = await readModel(automaticProvider)
    expect(snapshots.automatic).toMatchObject({
      id: createUniqueModelId(automaticProvider, modelId),
      presetModelId,
      capabilities: ['image-recognition', 'image-generation'],
      inputModalities: ['text', 'image'],
      outputModalities: ['image']
    })
    expect(snapshots.automatic.imageGeneration?.modes.edit).toBeDefined()
    await openEditor(automaticProvider)
    await expect(vision()).toHaveAttribute('aria-pressed', 'true')
    await expect(drawer()).toContainText(enUS['settings.models.catalog.source'].replace('{{modelId}}', presetModelId))
    await vision().scrollIntoViewIfNeeded()
    await screenshot('new known model automatically accepts image input')

    await returnToPainting()
    await view().getByRole('button', { name: enUS['paintings.button.new.image'], exact: true }).click()
    await view().locator('[data-selector-shell-root="true"] > button').first().click()
    await selectVisibleModel(page, modelId, automaticProvider)
    await view().locator('[contenteditable="true"]').fill('Generate an image using ID-only catalog defaults')
    await expect(send()).toBeEnabled()
    await send().click()
    await expect
      .poll(
        async () =>
          (await readPaintings(automaticProvider)).filter((painting) => painting.files.output.length === 1).length
      )
      .toBe(1)
    await expect(view().getByTestId('artboard-image-transform')).toBeVisible()
    await expect(view().locator('[contenteditable="true"]')).toHaveText('')
    expect(server.requests).toHaveLength(1)
    expect(server.requests[0]).toMatchObject({ path: '/v1/images/generations', model: modelId, images: [] })
    await screenshot('ID-only catalog model generates through loopback route')

    await view().getByRole('button', { name: enUS['paintings.button.new.image'], exact: true }).click()
    await view().locator('[data-selector-shell-root="true"] > button').first().click()
    await selectVisibleModel(page, modelId, explicitProvider)
    await view().locator('[contenteditable="true"]').fill('Generate a red square for catalog restore acceptance')
    await send().click()
    await expect
      .poll(async () => (await readPaintings()).filter((painting) => painting.files.output.length === 1).length)
      .toBe(1)
    const parent = (await readPaintings())[0]
    await expect(view().getByTestId('artboard-image-transform')).toBeVisible()
    const parentUrl = (await view().getByTestId('artboard-image-transform').getAttribute('src'))!
    await expect(view().locator('[contenteditable="true"]')).toHaveText('')
    await assertDraft(parentUrl, '')
    await view().locator('[contenteditable="true"]').fill(pendingInstruction)
    await expect(send()).toBeDisabled()
    await expect(view().getByRole('status')).toContainText(enUS['paintings.edit.model_not_configured'])
    await assertDraft(parentUrl, pendingInstruction)
    expect(server.requests).toHaveLength(2)
    expect(server.requests[1]).toMatchObject({ path: '/v1/images/generations', model: modelId, images: [] })

    await openEditor(explicitProvider)
    await expect(vision()).toHaveAttribute('aria-pressed', 'false')
    await expect(drawer().getByLabel(enUS['settings.models.add.context_window.label'], { exact: true })).toHaveValue(
      '100000'
    )
    const cancel = await restoreDialog()
    await screenshot('catalog restore confirmation preserves explicit settings until accepted')
    await cancel.getByRole('button', { name: enUS['common.cancel'], exact: true }).click()
    await expect(cancel).toBeHidden()
    await expect(vision()).toHaveAttribute('aria-pressed', 'false')
    snapshots.afterCancel = await readModel(explicitProvider)
    expect(snapshots.afterCancel).toEqual(snapshots.explicitBefore)
    expect(await readProvider()).toEqual(providerBefore)
    await returnToPainting()
    await assertDraft(parentUrl, pendingInstruction)
    await expect(send()).toBeDisabled()
    expect(server.requests).toHaveLength(2)
    await screenshot('cancel retains pending instruction and parent image')

    await openEditor(explicitProvider)
    const confirm = await restoreDialog()
    await confirm.getByRole('button', { name: enUS['common.confirm'], exact: true }).click()
    await expect(confirm).toBeHidden()
    await expect(vision()).toHaveAttribute('aria-pressed', 'true')
    snapshots.restored = await readModel(explicitProvider)
    expect(snapshots.restored).toMatchObject({
      presetModelId,
      capabilities: ['image-recognition', 'image-generation'],
      inputModalities: ['text', 'image'],
      outputModalities: ['image']
    })
    for (const key of [
      'id',
      'providerId',
      'apiModelId',
      'name',
      'description',
      'group',
      'endpointTypes',
      'isEnabled',
      'isHidden',
      'notes'
    ] as const) {
      expect(snapshots.restored[key], `Restore must preserve ${key}`).toEqual(snapshots.explicitBefore[key])
    }
    for (const key of ['contextWindow', 'maxInputTokens', 'maxOutputTokens', 'pricing'] as const) {
      expect(
        snapshots.restored[key],
        `Unknown catalog ${key} must not retain the old value or become zero`
      ).toBeUndefined()
    }
    for (const key of [
      'settings.models.add.context_window.label',
      'settings.models.add.max_input_tokens.label',
      'settings.models.add.max_output_tokens.label'
    ] as const) {
      await expect(drawer().getByLabel(enUS[key], { exact: true })).toHaveValue('')
    }
    expect(await readProvider()).toEqual(providerBefore)
    await vision().scrollIntoViewIfNeeded()
    await screenshot('confirmed defaults enable Vision')
    await drawer()
      .getByLabel(enUS['settings.models.add.max_output_tokens.label'], { exact: true })
      .scrollIntoViewIfNeeded()
    await screenshot('unpublished catalog limits remain empty')
    await returnToPainting()
    await assertDraft(parentUrl, pendingInstruction)
    await expect(send()).toBeEnabled()
    expect(server.requests).toHaveLength(2)
    await send().click()
    await expect
      .poll(
        async () =>
          (await readPaintings()).filter(
            (painting) => painting.prompt === pendingInstruction && painting.files.output.length === 1
          ).length
      )
      .toBe(1)
    const edited = (await readPaintings()).find((painting) => painting.prompt === pendingInstruction)!
    expect(edited.files.input).toEqual([parent.files.output[0]])
    expect(edited.editReceipt).toMatchObject({
      parentPaintingId: parent.id,
      parentFileId: parent.files.output[0],
      instruction: pendingInstruction
    })
    expect(server.requests).toHaveLength(3)
    expect(server.requests[2]).toMatchObject({ path: '/v1/images/edits', model: modelId, prompt: pendingInstruction })
    expect(server.requests[2].images).toEqual([server.images[1]])
    await expect(view().getByTestId('artboard-image-transform')).not.toHaveAttribute('src', parentUrl)
    await screenshot('restored model edits the original pending parent')

    await openEditor(explicitProvider)
    await vision().click()
    await expect(vision()).toHaveAttribute('aria-pressed', 'false')
    await expect.poll(async () => (await readModel(explicitProvider)).inputModalities).toEqual(['text'])
    snapshots.manualOverride = await readModel(explicitProvider)
    expect(snapshots.manualOverride.capabilities).toEqual(['image-generation'])
    page = await app.restart('authenticated')
    snapshots.afterRestart = await readModel(explicitProvider)
    expect(snapshots.afterRestart).toEqual(snapshots.manualOverride)
    expect(await readModel(automaticProvider)).toEqual(snapshots.automatic)
    expect(await readProvider()).toEqual(providerBefore)
    expect((await readPaintings()).find(({ id }) => id === edited.id)).toMatchObject({
      files: edited.files,
      editReceipt: edited.editReceipt
    })
    await openEditor(explicitProvider)
    await expect(vision()).toHaveAttribute('aria-pressed', 'false')
    await vision().scrollIntoViewIfNeeded()
    await screenshot('manual input override survives Electron restart')
    await returnToPainting()
    await view()
      .getByRole('button', {
        name: enUS['paintings.workbench.output_label'].replace('{{id}}', edited.files.output[0]),
        exact: true
      })
      .click()
    await view()
      .locator('[contenteditable="true"]')
      .fill('Manual text-only override must block this edit after restart')
    await expect(send()).toBeDisabled()
    await expect(view().getByRole('status')).toContainText(enUS['paintings.edit.model_not_configured'])
    await expect(
      view().getByRole('region', { name: enUS['paintings.workbench.references'], exact: true }).getByRole('img')
    ).toBeVisible()
    expect(server.requests).toHaveLength(3)
    expect(server.errors).toEqual([])
    await screenshot('persisted manual override blocks editing without dropping source')
  } catch (error) {
    await screenshot('failure before cleanup').catch(() => undefined)
    throw error
  } finally {
    await testInfo.attach('P-03 catalog IPC snapshots and loopback request journal', {
      body: JSON.stringify(
        {
          boundary: 'Loopback fixture, not a real provider or old-version migration',
          snapshots,
          requests: server.requests.map(({ path, model, prompt, images }) => ({
            path,
            model,
            prompt,
            imageCount: images.length
          })),
          errors: server.errors
        },
        null,
        2
      ),
      contentType: 'application/json'
    })
    await server.close()
    page = await app.mainWindow()
    await page.evaluate(async (providerIds) => {
      for (const providerId of providerIds) {
        const response = await window.api.dataApi.request({
          id: 'catalog-cleanup-read',
          method: 'GET',
          path: '/paintings',
          params: { providerId }
        })
        for (const { id } of (response.data as { items?: { id: string }[] })?.items ?? []) {
          await window.api.dataApi.request({
            id: 'catalog-cleanup-painting',
            method: 'DELETE',
            path: `/paintings/${id}`
          })
        }
        await window.api.dataApi.request({
          id: 'catalog-cleanup-provider',
          method: 'DELETE',
          path: `/providers/${providerId}`
        })
      }
    }, providerIds)
  }
}
