import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@cherrystudio/ui'
import { useDataChange, useQuery } from '@data/hooks/useDataApi'
import { popup } from '@renderer/services/popup'
import { toast } from '@renderer/services/toast'
import type { Model } from '@shared/data/types/model'

import { drawerClasses, ProviderHelpText } from '../../primitives/ProviderSettingsPrimitives'
import { getModelApiId } from './helpers'

interface ModelCatalogDefaultsProps {
  model: Model
  providerId: string
  enabled: boolean
  busy: boolean
  onRestore: () => Promise<void>
}

export function ModelCatalogDefaults({ model, providerId, enabled, busy, onRestore }: ModelCatalogDefaultsProps) {
  const { t } = useTranslation()
  const apiId = getModelApiId(model)
  const { data, isLoading, error, refetch } = useQuery('/providers/:providerId/models:resolve', {
    params: { providerId },
    query: { ids: [apiId] },
    enabled,
    swrOptions: { keepPreviousData: false }
  })
  useDataChange('/providers/:providerId/models:resolve', () => void refetch(), { routeParams: { providerId } })
  const catalog = data?.find(
    (entry) => entry.providerId === providerId && entry.apiModelId === apiId && entry.presetModelId
  )
  const [confirming, setConfirming] = useState(false)
  const generation = useRef(0)
  useEffect(() => {
    generation.current += 1
    return () => {
      generation.current += 1
    }
  }, [model.id, enabled])

  const restore = async () => {
    const current = generation.current
    setConfirming(true)
    try {
      const confirmed = await popup.confirm({
        title: t('settings.models.catalog.restore'),
        content: t('settings.models.catalog.confirm'),
        centered: true
      })
      if (!confirmed || !enabled || current !== generation.current) return
      await onRestore()
    } catch {
      toast.error(t('settings.models.catalog.restore_failed'))
    } finally {
      setConfirming(false)
    }
  }

  const unknown = catalog
    ? [
        catalog.contextWindow == null ? t('settings.models.add.context_window.label') : null,
        catalog.maxInputTokens == null ? t('settings.models.add.max_input_tokens.label') : null,
        catalog.maxOutputTokens == null ? t('settings.models.add.max_output_tokens.label') : null,
        catalog.pricing == null ? t('settings.models.catalog.pricing') : null
      ].filter(Boolean)
    : []

  return (
    <div className={drawerClasses.sectionCard}>
      <div className={drawerClasses.fieldTitle}>{t('settings.models.catalog.title')}</div>
      <ProviderHelpText>
        {error
          ? t('settings.models.catalog.load_failed')
          : isLoading
            ? t('common.loading')
            : catalog
              ? t('settings.models.catalog.source', { modelId: catalog.presetModelId })
              : t('settings.models.catalog.missing')}
      </ProviderHelpText>
      {catalog && !error && (
        <>
          <ProviderHelpText>{t('settings.models.catalog.hint')}</ProviderHelpText>
          {unknown.length > 0 && (
            <ProviderHelpText>{t('settings.models.catalog.unknown', { fields: unknown.join(', ') })}</ProviderHelpText>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || confirming || !enabled}
            onClick={() => void restore()}>
            {t('settings.models.catalog.restore')}
          </Button>
        </>
      )}
      {error && (
        <Button type="button" size="sm" variant="outline" onClick={() => void refetch()}>
          {t('common.retry')}
        </Button>
      )}
    </div>
  )
}
