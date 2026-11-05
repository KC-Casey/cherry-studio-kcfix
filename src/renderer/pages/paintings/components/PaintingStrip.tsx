import { Loader2, Plus, Trash2 } from 'lucide-react'
import type { FC, UIEventHandler } from 'react'
import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { Button, Tooltip } from '@cherrystudio/ui'
import { cn } from '@cherrystudio/ui/lib/utils'

import type { PaintingStripEntry } from '../hooks/usePaintingHistory'
import type { PaintingData } from '../model/types/paintingData'
import { paintingClasses } from '../paintingPrimitives'
import { getPaintingFileUrl } from '../utils/paintingFileUrl'
import { buildPaintingLineage } from '../utils/paintingLineage'
import PaintingSkeletonSurface from './PaintingSkeletonSurface'

interface PaintingStripProps {
  selectedPaintingId?: string
  selectedFileId?: string
  /** Id of the painting with an in-flight generation, or undefined when idle. */
  runningPaintingId?: string
  items: PaintingStripEntry[]
  hasMore: boolean
  loadMore: () => void
  onDeletePainting: (painting: PaintingData) => void | Promise<void>
  onSelectPainting: (painting: PaintingData, fileId?: string) => void
  onAddPainting: () => void
  adding?: boolean
}

const PaintingStripItem: FC<{
  painting: PaintingStripEntry
  selected: boolean
  loading: boolean
  onDelete: (painting: PaintingStripEntry) => void
  onSelect: (painting: PaintingStripEntry) => void
  selectLabel: string
  deleteLabel: string
}> = ({ painting, selected, loading, onDelete, onSelect, selectLabel, deleteLabel }) => {
  const previewFile = painting.files?.[0]
  const previewUrl = previewFile ? getPaintingFileUrl(previewFile) : undefined

  return (
    <div className={cn(paintingClasses.historyItem, selected && paintingClasses.historyItemActive)}>
      <button
        type="button"
        className="absolute inset-0 z-0"
        aria-label={selectLabel}
        aria-pressed={selected}
        onClick={() => onSelect(painting)}>
        <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-[12px]">
          {previewUrl ? (
            <img src={previewUrl} alt="" className="h-full w-full object-cover" />
          ) : loading ? (
            <div className="size-full bg-background">
              <PaintingSkeletonSurface />
            </div>
          ) : (
            <span className="block size-full bg-muted/60" aria-hidden />
          )}
        </span>
      </button>

      {selected && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10 rounded-[12px] ring-1 ring-muted-foreground/55 ring-inset"
        />
      )}

      {loading && previewFile && (
        <span className="pointer-events-none absolute inset-x-1 bottom-1 z-10 h-1 overflow-hidden rounded-full bg-black/10">
          <span className="block h-full w-5 animate-[painting-history-loading_1.2s_ease-in-out_infinite] rounded-full bg-foreground/70" />
        </span>
      )}

      <button
        type="button"
        aria-label={deleteLabel}
        className={paintingClasses.historyDelete}
        onClick={(event) => {
          event.stopPropagation()
          onDelete(painting)
        }}>
        <Trash2 className="size-3" />
      </button>
    </div>
  )
}

const PaintingStrip: FC<PaintingStripProps> = ({
  selectedPaintingId,
  selectedFileId,
  runningPaintingId,
  items,
  hasMore,
  loadMore,
  onDeletePainting,
  onSelectPainting,
  onAddPainting,
  adding = false
}) => {
  const { t } = useTranslation()
  const stripRef = useRef<HTMLDivElement>(null)
  const lineage = useMemo(() => buildPaintingLineage(items), [items])
  const handleScroll: UIEventHandler<HTMLDivElement> = (event) => {
    const target = event.currentTarget
    if (target.scrollTop + target.clientHeight >= target.scrollHeight - 120) {
      loadMore()
    }
  }

  useEffect(() => {
    const strip = stripRef.current
    if (hasMore && strip && strip.scrollHeight <= strip.clientHeight) {
      loadMore()
    }
  }, [hasMore, items.length, loadMore])

  return (
    <>
      <div ref={stripRef} className={paintingClasses.historyStrip} onScroll={handleScroll}>
        <h2 className="text-xs font-medium">{t('paintings.workbench.lineage')}</h2>
        <Tooltip content={t('paintings.button.new.image')} placement="right" delay={500}>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={paintingClasses.historyAddButton}
            aria-label={t('paintings.button.new.image')}
            onClick={onAddPainting}
            disabled={adding}
            loading={adding}>
            <Plus className="size-4" />
          </Button>
        </Tooltip>
        <ol aria-label={t('paintings.workbench.lineage')} className="flex flex-col gap-3">
          {lineage.map(({ painting, file, parent, depth }) => {
            const outputId = file?.id ?? painting.id
            const label = t('paintings.workbench.output_label', { id: outputId })
            const parentId = painting.editReceipt?.parentFileId
            return (
              <li
                key={`${painting.id}:${outputId}`}
                aria-label={label}
                className="border-l border-border-subtle pl-2"
                style={{ marginLeft: Math.min(depth, 3) * 12 }}>
                <PaintingStripItem
                  painting={file ? { ...painting, files: [file] } : painting}
                  selected={painting.id === selectedPaintingId && (!selectedFileId || file?.id === selectedFileId)}
                  loading={painting.id === runningPaintingId}
                  onDelete={() => void onDeletePainting(painting)}
                  onSelect={() => onSelectPainting(painting, file?.id)}
                  selectLabel={label}
                  deleteLabel={t('paintings.button.delete.image.label')}
                />
                <p className="mt-1 truncate text-xs" title={outputId}>
                  {label}
                </p>
                {parentId ? (
                  parent ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-auto max-w-full justify-start px-0 text-xs text-link"
                      title={parentId}
                      onClick={() => onSelectPainting(parent.painting, parent.file?.id)}>
                      <span className="truncate">{t('paintings.workbench.parent_label', { id: parentId })}</span>
                    </Button>
                  ) : (
                    <p className="break-all text-xs text-muted-foreground" title={parentId}>
                      {t('paintings.workbench.parent_label', { id: parentId })}
                      <br />
                      <span>{t('paintings.workbench.parent_not_loaded')}</span>
                    </p>
                  )
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {t(painting.editReceipt ? 'paintings.workbench.root_image' : 'paintings.workbench.legacy_lineage')}
                  </p>
                )}
              </li>
            )
          })}
        </ol>
        {hasMore && <Loader2 className="mx-auto size-4 shrink-0 animate-spin text-foreground-tertiary" aria-hidden />}
      </div>

      <style>{`
        @keyframes painting-history-loading {
          0% { transform: translateX(-150%); }
          100% { transform: translateX(260%); }
        }
      `}</style>
    </>
  )
}

export default PaintingStrip
