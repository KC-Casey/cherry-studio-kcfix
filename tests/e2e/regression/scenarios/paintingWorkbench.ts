import type { Page, TestInfo } from '@playwright/test'
import { expect } from '@playwright/test'

import enUS from '@renderer/i18n/locales/en-us.json'
import { PaintingSchema, type Painting } from '@shared/data/types/painting'

import { startWorkbenchImageServer } from '../fixtures/workbenchImageServer'
import { selectVisibleModel } from '../helpers/models'
import { selectSidebarApp } from '../helpers/navigation'
import type { RegressionApp } from '../RegressionApp'

// Catches the real Composer send gate dropping an auto-selected output, wrong branch
// inputs, and lineage that survives a renderer refresh but is lost on process restart.
export async function paintingWorkbench(app: RegressionApp, mainWindow: Page, testInfo: TestInfo) {
  const server = await startWorkbenchImageServer()
  const providerId = `workbench-${Date.now()}`
  const modelId = 'gpt-image-1'
  const original = 'A red square on a white background'
  const outputLabel = (id: string) => enUS['paintings.workbench.output_label'].replace('{{id}}', id)
  let page = mainWindow
  const saved: Painting[] = []
  testInfo.annotations.push({
    type: 'data-source',
    description:
      'Loopback image HTTP fixture; real Composer, Electron IPC, file storage and restart. No external image quality claim.'
  })
  const view = () => page.locator('[data-ui~="paintings.view"]:visible')
  const readPaintings = async () => {
    const response = await page.evaluate(
      (providerId) =>
        window.api.dataApi.request({
          id: 'workbench-read',
          method: 'GET',
          path: '/paintings',
          params: { providerId }
        }),
      providerId
    )
    expect(response.status).toBe(200)
    return (response.data as { items: unknown[] }).items.map((item) => PaintingSchema.parse(item))
  }
  const selectModel = async (id: string) => {
    await view().locator('[data-selector-shell-root="true"] > button').first().click()
    await selectVisibleModel(page, id, providerId)
  }
  const submit = async (prompt: string, index: number) => {
    await view().locator('[contenteditable="true"]').fill(prompt)
    const send = view().getByRole('button', { name: 'Send', exact: true })
    await expect(send, 'A typed instruction and selected source must enable the real Composer').toBeEnabled()
    const outputImage = view().getByTestId('artboard-image-transform')
    const previousUrl = (await outputImage.count()) ? await outputImage.getAttribute('src') : null
    await send.click()
    await expect.poll(() => server.requests.length).toBe(index + 1)
    expect(server.errors).toEqual([])
    await expect
      .poll(
        async () =>
          (await readPaintings()).filter((item) => item.prompt === prompt && item.files.output.length === 1).length
      )
      .toBe(1)
    const painting = (await readPaintings()).find((item) => item.prompt === prompt)!
    saved.push(painting)
    await expect(view().getByTestId('artboard-image-transform')).toBeVisible()
    if (previousUrl)
      await expect(view().getByTestId('artboard-image-transform')).not.toHaveAttribute('src', previousUrl)
    await expect(
      view().locator('[contenteditable="true"]'),
      'Completed output becomes a new empty edit draft'
    ).toHaveText('')
    const references = view().getByRole('region', { name: 'Source image and references', exact: true })
    await expect(references).toBeVisible()
    await expect(references.getByRole('img')).toHaveAttribute(
      'src',
      (await view().getByTestId('artboard-image-transform').getAttribute('src'))!
    )
    await expect(view().getByRole('button', { name: 'Add image', exact: true })).toBeVisible()
    return painting
  }
  try {
    const statuses = await page.evaluate(
      async ({ providerId, modelId, baseUrl }) => {
        const provider = await window.api.dataApi.request({
          id: 'workbench-provider',
          method: 'POST',
          path: '/providers',
          body: {
            providerId,
            presetProviderId: 'openai',
            name: 'Workbench loopback',
            endpointConfigs: { 'openai-image-generation': { baseUrl } },
            apiKeys: [{ id: 'local-only', key: 'not-a-real-api-key', isEnabled: true }]
          }
        })
        const enabled = await window.api.dataApi.request({
          id: 'workbench-enable',
          method: 'PATCH',
          path: `/providers/${providerId}`,
          body: { isEnabled: true }
        })
        const models = await window.api.dataApi.request({
          id: 'workbench-model',
          method: 'POST',
          path: '/models',
          body: [
            {
              providerId,
              modelId,
              presetModelId: 'gpt-image-1',
              endpointTypes: ['openai-image-generation'],
              capabilities: ['image-generation'],
              inputModalities: ['text', 'image'],
              outputModalities: ['image']
            },
            {
              providerId,
              modelId: 'gpt-image-2.6-flare',
              endpointTypes: ['openai-image-generation'],
              capabilities: ['image-generation'],
              inputModalities: ['text'],
              outputModalities: ['image']
            }
          ]
        })
        return [provider, enabled, models].map(({ status }) => status)
      },
      { providerId, modelId, baseUrl: server.baseUrl }
    )
    expect(statuses).toEqual([201, 200, 201])
    await page.reload()
    await selectSidebarApp(page, 'Paintings')
    await view().getByRole('button', { name: 'New Image', exact: true }).click()
    await selectModel(modelId)
    const first = await submit(original, 0)
    expect(server.requests[0]).toMatchObject({
      path: '/v1/images/generations',
      prompt: original,
      model: modelId,
      images: []
    })
    const firstUrl = await view().getByTestId('artboard-image-transform').getAttribute('src')
    expect(firstUrl).toBeTruthy()

    const instruction = 'Change the square to green'
    await selectModel('gpt-image-2.6-flare')
    await view().locator('[contenteditable="true"]').fill(instruction)
    await expect(view().getByRole('status')).toContainText('The selected model is not configured for image editing.')
    await expect(view().getByRole('button', { name: 'Send', exact: true })).toBeDisabled()
    await expect(
      view().getByRole('region', { name: 'Source image and references', exact: true }).getByRole('img')
    ).toHaveAttribute('src', firstUrl!)
    expect(server.requests).toHaveLength(1)
    await selectModel(modelId)
    await expect(
      view().getByRole('region', { name: 'Source image and references', exact: true }).getByRole('img')
    ).toHaveAttribute('src', firstUrl!)
    const second = await submit(instruction, 1)
    expect(second.files.input).toEqual([first.files.output[0]])
    expect(second.editReceipt).toMatchObject({
      parentPaintingId: first.id,
      parentFileId: first.files.output[0],
      originalPrompt: original,
      instruction
    })
    expect(server.requests[1]).toMatchObject({ path: '/v1/images/edits', prompt: instruction, model: modelId })
    expect(server.requests[1].images).toEqual([server.images[0]])
    await expect(view().getByRole('img', { name: 'Before', exact: true })).toHaveAttribute('src', firstUrl!)
    await expect(view().getByText('After', { exact: true })).toBeVisible()
    await expect(view().getByRole('button', { name: 'Compare before / after', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true'
    )

    const secondUrl = await view().getByTestId('artboard-image-transform').getAttribute('src')
    const continuousInstruction = 'Add a yellow border'
    const third = await submit(continuousInstruction, 2)
    expect(third.files.input).toEqual([second.files.output[0]])
    expect(third.editReceipt).toMatchObject({
      parentPaintingId: second.id,
      parentFileId: second.files.output[0],
      originalPrompt: original,
      instruction: continuousInstruction
    })
    expect(server.requests[2]).toMatchObject({ path: '/v1/images/edits', prompt: continuousInstruction })
    expect(server.requests[2].images).toEqual([server.images[1]])
    await expect(view().getByRole('img', { name: 'Before', exact: true })).toHaveAttribute('src', secondUrl!)
    await expect(view().getByRole('list', { name: enUS['paintings.workbench.lineage'], exact: true })).toBeVisible()
    await view()
      .getByRole('button', { name: outputLabel(first.files.output[0]), exact: true })
      .click()
    await expect(view().getByTestId('artboard-image-transform')).toHaveAttribute('src', firstUrl!)
    const branchInstruction = 'Change the square to blue'
    const branch = await submit(branchInstruction, 3)
    expect(branch.files.input).toEqual([first.files.output[0]])
    expect(branch.editReceipt).toMatchObject({
      parentPaintingId: first.id,
      parentFileId: first.files.output[0],
      originalPrompt: original,
      instruction: branchInstruction
    })
    expect(server.requests[3]).toMatchObject({ path: '/v1/images/edits', prompt: branchInstruction })
    expect(server.requests[3].images).toEqual([server.images[0]])
    const branchUrl = await view().getByTestId('artboard-image-transform').getAttribute('src')
    expect(branchUrl).not.toBe(firstUrl)
    await testInfo.attach('Workbench branch and comparison', {
      body: await page.screenshot(),
      contentType: 'image/png'
    })

    await selectSidebarApp(page, 'Chat')
    await selectSidebarApp(page, 'Paintings')
    await expect(view().getByTestId('artboard-image-transform')).toHaveAttribute('src', branchUrl!)
    await expect(
      view().getByRole('region', { name: 'Source image and references', exact: true }).getByRole('img')
    ).toHaveAttribute('src', branchUrl!)
    await expect(
      view().getByRole('button', { name: outputLabel(branch.files.output[0]), exact: true })
    ).toHaveAttribute('aria-pressed', 'true')
    page = await app.restart('authenticated')
    await selectSidebarApp(page, 'Paintings')
    const persisted = await readPaintings()
    for (const painting of saved) {
      expect(persisted.find(({ id }) => id === painting.id)).toMatchObject({
        id: painting.id,
        files: painting.files,
        editReceipt: painting.editReceipt
      })
    }
    await view()
      .getByRole('button', { name: outputLabel(branch.files.output[0]), exact: true })
      .click()
    await expect(view().getByRole('img', { name: 'Before', exact: true })).toHaveAttribute('src', firstUrl!)
    await expect(view().getByTestId('artboard-image-transform')).toHaveAttribute('src', branchUrl!)
    await view().locator('[contenteditable="true"]').fill('Continue editing after restart')
    await expect(view().getByRole('button', { name: 'Send', exact: true })).toBeEnabled()
    await testInfo.attach('Workbench persisted lineage after restart', {
      body: await page.screenshot(),
      contentType: 'image/png'
    })
    expect(server.requests).toHaveLength(4)
  } catch (error) {
    await page
      .screenshot()
      .then((body) => testInfo.attach('Workbench failure before cleanup', { body, contentType: 'image/png' }))
      .catch(() => undefined)
    await testInfo
      .attach('Workbench loopback request journal', {
        body: JSON.stringify(
          {
            requests: server.requests.map(({ path, prompt, model, images }) => ({
              path,
              prompt,
              model,
              imageCount: images.length,
              imageByteLengths: images.map((image) => image.length)
            })),
            errors: server.errors
          },
          null,
          2
        ),
        contentType: 'application/json'
      })
      .catch(() => undefined)
    throw error
  } finally {
    await server.close()
    page = await app.mainWindow()
    await page.evaluate(async (providerId) => {
      const response = await window.api.dataApi.request({
        id: 'workbench-cleanup-list',
        method: 'GET',
        path: '/paintings',
        params: { providerId }
      })
      for (const { id } of (response.data as { items: { id: string }[] }).items) {
        await window.api.dataApi.request({ id: 'workbench-cleanup-image', method: 'DELETE', path: `/paintings/${id}` })
      }
      await window.api.dataApi.request({
        id: 'workbench-cleanup-provider',
        method: 'DELETE',
        path: `/providers/${providerId}`
      })
    }, providerId)
  }
}
