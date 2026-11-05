import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@cherrystudio/ui'

import type { PaintingData } from '../model/types/paintingData'

/** Frozen source metadata, separate from the settings for the next request. */
export default function PaintingRecord({ painting, fileId }: { painting: PaintingData; fileId: string }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const receipt = painting.editReceipt
  const execution = receipt?.execution
  const unknown = t('paintings.workbench.unknown')
  const rows: [string, string | undefined][] = [
    ['paintings.workbench.parent_image', receipt?.parentFileId],
    ['paintings.workbench.provider', painting.providerId],
    ['paintings.workbench.model', painting.model],
    ['paintings.workbench.original_prompt', receipt?.originalPrompt ?? painting.prompt],
    ['paintings.workbench.instruction', receipt?.instruction],
    ['paintings.workbench.requested_size', execution?.requestedSize],
    ['paintings.workbench.effective_size', execution?.effectiveSize],
    ['paintings.workbench.requested_quality', execution?.requestedQuality],
    ['paintings.workbench.effective_quality', execution?.effectiveQuality],
    ['paintings.workbench.execution_interface', execution?.interface],
    ['paintings.workbench.adapter', execution?.adapter]
  ]

  return (
    <section aria-label={t('paintings.workbench.generation_record')} className="border-b border-border pb-3">
      <Button
        variant="ghost"
        size="sm"
        className="h-auto w-full justify-start whitespace-normal px-0"
        aria-expanded={open}
        onClick={() => setOpen(!open)}>
        {t('paintings.workbench.generation_record')}
      </Button>
      <p className="text-xs text-muted-foreground">{t('paintings.workbench.read_only_record')}</p>
      {open && (
        <div>
          <p className="mt-2 break-all text-xs">{t('paintings.workbench.output_label', { id: fileId })}</p>
          {!receipt && <p className="text-xs text-muted-foreground">{t('paintings.workbench.legacy_lineage')}</p>}
          <dl className="mt-2 space-y-2 text-xs">
            {rows.map(([key, value]) => (
              <div key={key}>
                <dt className="font-medium">{t(key)}</dt>
                <dd className="break-words whitespace-pre-wrap text-muted-foreground">
                  {key === 'paintings.workbench.parent_image' && receipt && !receipt.parentFileId
                    ? t('paintings.workbench.root_image')
                    : value === undefined
                      ? unknown
                      : value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </section>
  )
}
