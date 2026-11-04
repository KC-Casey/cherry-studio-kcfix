import { type FC, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@cherrystudio/ui'
import { useCache } from '@data/hooks/useCache'
import { QuickPanelProvider } from '@renderer/components/QuickPanel'
import { dataApiService } from '@renderer/data/DataApiService'
import type { FileMetadata } from '@renderer/types/file'

import Artboard from './components/Artboard'
import PaintingComposer from './components/PaintingComposer'
import PaintingStrip from './components/PaintingStrip'
import { presentPaintingGenerateError } from './errors/paintingGenerateError'
import { usePaintingDraftDefaults } from './hooks/usePaintingDraftDefaults'
import { usePaintingGenerationSubmit } from './hooks/usePaintingGenerationSubmit'
import { usePaintingHistory } from './hooks/usePaintingHistory'
import { usePaintingInitialDraft } from './hooks/usePaintingInitialDraft'
import { usePaintingList } from './hooks/usePaintingList'
import { usePaintingModelCatalog } from './hooks/usePaintingModelCatalog'
import { usePaintingModelSwitch } from './hooks/usePaintingModelSwitch'
import { usePaintingProviderOptions } from './hooks/usePaintingProviderOptions'
import { usePaintingResultSync } from './hooks/usePaintingResultSync'
import { createPaintingBranch } from './model/createPaintingBranch'
import { createDefaultPainting } from './model/paintingPipeline'
import type { PaintingData } from './model/types/paintingData'
import { cacheToPaintingGenerationState } from './model/utils/paintingGenerationParams'
import { paintingClasses } from './paintingPrimitives'
import { fileEntryToMetadata } from './utils/fileEntryAdapter'
import { getPaintingFileUrl } from './utils/paintingFileUrl'

const PaintingPage: FC = () => {
  const { t } = useTranslation()
  const providerOptions = usePaintingProviderOptions()
  const draftDefaults = usePaintingDraftDefaults(providerOptions)
  const [currentPainting, setCurrentPainting] = useState<PaintingData>(() => createDefaultPainting(draftDefaults))
  const [source, setSource] = useState<{ painting: PaintingData; fileId: string } | null>(null)
  const sourceRef = useRef(source)
  sourceRef.current = source
  const [selecting, setSelecting] = useState(false)
  const [compare, setCompare] = useState(true)
  const [parentFile, setParentFile] = useState<FileMetadata | null>(null)
  const [parentUnavailable, setParentUnavailable] = useState(false)
  const [settingsContainer, setSettingsContainer] = useState<HTMLDivElement | null>(null)
  const selectionEpoch = useRef(0)
  const branchedResult = useRef<string | null>(null)
  const patchPainting = useCallback((updates: Partial<PaintingData>) => {
    setCurrentPainting((current) => ({ ...current, ...updates }))
  }, [])
  const history = usePaintingHistory()
  usePaintingInitialDraft({ currentPainting, draftDefaults, setCurrentPainting })
  usePaintingResultSync({ currentPainting, historyItems: history.items, setCurrentPainting })
  const [cachedGeneration] = useCache(`painting.generation.${currentPainting.id}`)
  const liveGenerationState = useMemo(() => cacheToPaintingGenerationState(cachedGeneration), [cachedGeneration])
  const modelCatalog = usePaintingModelCatalog({ providerOptions, painting: currentPainting })
  const composerPainting = useMemo<PaintingData>(() => {
    if (currentPainting.model) return currentPainting
    const fallback = modelCatalog.currentModelOptions.find((option) => option.isEnabled !== false)?.value
    return fallback ? { ...currentPainting, model: String(fallback) } : currentPainting
  }, [currentPainting, modelCatalog.currentModelOptions])
  const {
    generating: liveGenerating,
    submitting,
    preparing,
    submit,
    cancel: cancelGeneration
  } = usePaintingGenerationSubmit({
    painting: composerPainting,
    onPaintingChange: setCurrentPainting,
    ensureCurrentCatalog: modelCatalog.ensureCurrentCatalog
  })
  const generating = liveGenerating || liveGenerationState.generationStatus === 'running'
  const switchModel = usePaintingModelSwitch({
    painting: currentPainting,
    onPaintingChange: patchPainting,
    ensureProviderCatalog: modelCatalog.ensureProviderCatalog
  })
  const list = usePaintingList({
    painting: currentPainting,
    setCurrentPainting,
    draftDefaults,
    historyItems: history.items,
    cancelGeneration
  })

  const selectOutput = useCallback(async (painting: PaintingData, fileId?: string) => {
    const id = fileId ?? painting.files[0]?.id
    if (!id) return
    const epoch = ++selectionEpoch.current
    setSelecting(true)
    try {
      const entry = await dataApiService.get(`/files/entries/${id}`)
      if (epoch !== selectionEpoch.current) return
      const draft = createPaintingBranch(painting, entry)
      setSource({ painting, fileId: id })
      setCurrentPainting(draft)
    } catch (error) {
      if (epoch === selectionEpoch.current) presentPaintingGenerateError(error)
    } finally {
      if (epoch === selectionEpoch.current) setSelecting(false)
    }
  }, [])

  useEffect(() => {
    if (
      generating ||
      submitting ||
      selecting ||
      !currentPainting.files.length ||
      branchedResult.current === currentPainting.id
    )
      return
    branchedResult.current = currentPainting.id
    void selectOutput(currentPainting)
  }, [currentPainting, generating, selectOutput, selecting, submitting])
  useEffect(
    () => () => {
      selectionEpoch.current += 1
    },
    []
  )

  const add = () => {
    selectionEpoch.current += 1
    setSelecting(false)
    setSource(null)
    void list.add()
  }
  const preview = source
    ? { ...source.painting, files: source.painting.files.filter((file) => file.id === source.fileId) }
    : composerPainting
  const parentFileId = source?.painting.editReceipt?.parentFileId
  useEffect(() => {
    let current = true
    setParentFile(null)
    setParentUnavailable(false)
    if (!parentFileId) return
    void dataApiService
      .get(`/files/entries/${parentFileId}`)
      .then((entry) => fileEntryToMetadata(entry))
      .then((file) => {
        if (current) setParentFile(file)
      })
      .catch(() => {
        if (current) setParentUnavailable(true)
      })
    return () => {
      current = false
    }
  }, [parentFileId])

  const remove = async (painting: PaintingData) => {
    const removed = await list.remove(painting)
    if (removed && sourceRef.current?.painting.id === painting.id) add()
  }
  const busy = list.saving || preparing || selecting

  return (
    <div data-ui="paintings.view" className={paintingClasses.page}>
      <div className={paintingClasses.content} aria-busy={busy}>
        <div className={paintingClasses.frame}>
          <div className={paintingClasses.surface}>
            <div inert={preparing || selecting || submitting || generating}>
              <PaintingStrip
                selectedPaintingId={source?.painting.id ?? currentPainting.id}
                selectedFileId={source?.fileId}
                runningPaintingId={generating ? currentPainting.id : undefined}
                items={history.items}
                hasMore={history.hasMore}
                loadMore={history.loadMore}
                onDeletePainting={remove}
                onSelectPainting={selectOutput}
                onAddPainting={add}
                adding={busy}
              />
            </div>
            <div className={paintingClasses.centerPane} data-composer-stage="">
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {parentUnavailable && (
                  <p className="px-3 text-xs text-muted-foreground">{t('paintings.workbench.parent_unavailable')}</p>
                )}
                {parentFile && (
                  <div className="flex justify-end px-3 py-1">
                    <Button variant="ghost" size="sm" aria-pressed={compare} onClick={() => setCompare(!compare)}>
                      {t('paintings.workbench.compare')}
                    </Button>
                  </div>
                )}
                <div className="flex min-h-0 flex-1">
                  {compare && parentFile && (
                    <figure className="flex min-h-0 w-1/2 flex-col border-r border-border p-3">
                      <figcaption className="text-xs text-muted-foreground">
                        {t('paintings.workbench.before')}
                      </figcaption>
                      <img
                        className="min-h-0 flex-1 object-contain"
                        src={getPaintingFileUrl(parentFile)}
                        alt={t('paintings.workbench.before')}
                      />
                    </figure>
                  )}
                  <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                    {parentFile && (
                      <p className="px-3 text-xs text-muted-foreground">{t('paintings.workbench.after')}</p>
                    )}
                    <Artboard painting={preview} isLoading={generating} />
                  </div>
                </div>
              </div>
              <div className={paintingClasses.promptDock} data-testid="painting-prompt-dock" inert={busy}>
                <div className="mb-2 px-2">
                  <p className="text-xs font-medium">{t('paintings.workbench.original_prompt')}</p>
                  <p className="max-h-20 overflow-y-auto whitespace-pre-wrap text-sm text-muted-foreground">
                    {currentPainting.editReceipt?.originalPrompt ?? t('paintings.workbench.original_prompt_empty')}
                  </p>
                  <p className="mt-2 text-xs font-medium">{t('paintings.workbench.instruction')}</p>
                </div>
                <QuickPanelProvider>
                  <PaintingComposer
                    painting={composerPainting}
                    settingsContainer={settingsContainer}
                    generating={generating}
                    submitting={submitting}
                    onPromptChange={(prompt) => patchPainting({ prompt })}
                    onGenerate={submit}
                    onCancel={() => cancelGeneration(currentPainting.id)}
                    onModelSelect={switchModel}
                    onConfigChange={patchPainting}
                    onGenerateRandomSeed={(key) =>
                      patchPainting({
                        params: { ...currentPainting.params, [key]: String(Math.floor(Math.random() * 1_000_000)) }
                      })
                    }
                  />
                </QuickPanelProvider>
              </div>
            </div>
            <div
              ref={setSettingsContainer}
              className="w-64 shrink-0 overflow-y-auto border-l border-border p-3 max-lg:w-48"
              inert={busy || generating}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
export default PaintingPage
