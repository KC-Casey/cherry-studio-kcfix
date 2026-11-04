import { useLocation, useNavigate, useSearch } from '@tanstack/react-router'
import { BadgeQuestionMark, Bug, Github, Globe, MessageSquareText, Star } from 'lucide-react'
import type { FC, ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge, Button, Divider } from '@cherrystudio/ui'
import AppLogo from '@renderer/assets/images/logo.png'
import { DoctorPopup } from '@renderer/components/doctor'
import FeedbackDialog from '@renderer/components/feedback/FeedbackDialog'
import LogoAvatar from '@renderer/components/icons/LogoAvatar'
import {
  SettingGroup,
  SettingRow,
  SettingRowTitle,
  SettingsContentColumn
} from '@renderer/components/SettingsPrimitives'
import { useTheme } from '@renderer/hooks/useTheme'
import i18n from '@renderer/i18n/resolver'
import { ipcApi } from '@renderer/ipc'
import { openExternalWebsite } from '@renderer/services/website'
import { APP_NAME } from '@shared/utils/constants'
import { DOCTOR_OPEN_QUERY_PARAM, type DoctorPanel } from '@shared/utils/doctor'

const AboutSettings: FC = () => {
  const [version, setVersion] = useState('')
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const { t } = useTranslation()
  const { theme } = useTheme()
  const location = useLocation()
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as Partial<Record<typeof DOCTOR_OPEN_QUERY_PARAM, DoctorPanel>>
  const consumedDoctorPanelRef = useRef<DoctorPanel | undefined>(undefined)

  useEffect(() => {
    const initialPanel = search[DOCTOR_OPEN_QUERY_PARAM]
    if (!initialPanel) {
      consumedDoctorPanelRef.current = undefined
      return
    }
    if (consumedDoctorPanelRef.current === initialPanel) return
    consumedDoctorPanelRef.current = initialPanel

    void navigate({
      to: location.pathname,
      search: (previous: Record<string, unknown>) => {
        const remaining = { ...previous }
        delete remaining[DOCTOR_OPEN_QUERY_PARAM]
        return remaining
      },
      replace: true
    })
    void DoctorPopup.show({ initialPanel })
  }, [location.pathname, navigate, search])

  const onOpenWebsite = (url: string) => {
    void openExternalWebsite(url)
  }

  const debug = async () => {
    await ipcApi.request('system.toggle_dev_tools')
  }

  useEffect(() => {
    void (async () => {
      const appInfo = await ipcApi.request('app.get_info')
      setVersion(appInfo.version)
    })()
  }, [])

  const onOpenDocs = () => {
    const isChinese = i18n.language.startsWith('zh')
    void openExternalWebsite(isChinese ? 'https://docs.cherry-ai.com/' : 'https://docs.cherry-ai.com/docs/en-us')
  }

  return (
    <SettingsContentColumn theme={theme}>
      <SettingGroup theme={theme}>
        <div className="flex flex-wrap items-center justify-between gap-3 py-1">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button
              type="button"
              aria-label={t('settings.about.repository')}
              onClick={() => onOpenWebsite('https://github.com/KC-Casey/cherry-studio-kcfix')}
              className="relative cursor-pointer">
              <span aria-hidden="true">
                <LogoAvatar logo={AppLogo} size={72} className="rounded-full" alt="" />
              </span>
            </button>

            <div className="flex min-h-18 flex-col items-start justify-center">
              <div className="mb-1 text-lg font-bold text-foreground">{APP_NAME}</div>
              <div className="text-muted-foreground text-sm">{t('settings.about.description')}</div>
              <button
                type="button"
                aria-label={t('settings.about.releases.title')}
                onClick={() => onOpenWebsite('https://github.com/KC-Casey/cherry-studio-kcfix/releases')}
                className="mt-1.5">
                <Badge className="cursor-pointer rounded-md border-primary/20 bg-primary/10 px-1.5 py-0 text-[11px] leading-4 text-primary transition-colors hover:bg-primary/15">
                  v{version}
                </Badge>
              </button>
            </div>
          </div>
        </div>
      </SettingGroup>

      <SettingGroup theme={theme}>
        <AboutActionRow
          icon={<BadgeQuestionMark className="size-4.5" />}
          title={t('docs.title')}
          actionLabel={t('settings.about.website.button')}
          onAction={onOpenDocs}
        />
        <Divider className="my-3" />
        <AboutActionRow
          icon={<Globe className="size-4.5" />}
          title={t('settings.about.website.title')}
          actionLabel={t('settings.about.website.button')}
          onAction={() => onOpenWebsite('https://cherry-ai.com')}
        />
        <Divider className="my-3" />
        <AboutActionRow
          icon={<Github className="size-4.5" />}
          title={t('settings.about.repository.title')}
          actionLabel={
            <>
              <Star aria-hidden="true" className="lucide-custom size-3.5 text-foreground-tertiary" />
              {t('settings.about.repository.button')}
            </>
          }
          onAction={() => onOpenWebsite('https://github.com/KC-Casey/cherry-studio-kcfix')}
        />
        <Divider className="my-3" />
        <AboutActionRow
          icon={<MessageSquareText className="size-4.5" />}
          title={t('settings.about.feedback.title')}
          actionLabel={t('settings.about.feedback.button')}
          onAction={() => setFeedbackOpen(true)}
        />
        <Divider className="my-3" />
        <AboutActionRow
          id="setting-about-debug-tools"
          icon={<Bug className="size-4.5" />}
          title={t('settings.about.debug.title')}
          actionLabel={t('settings.about.debug.open')}
          onAction={debug}
        />
      </SettingGroup>
      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </SettingsContentColumn>
  )
}

function AboutActionRow({
  actionLabel,
  icon,
  id,
  onAction,
  title
}: {
  actionLabel: ReactNode
  icon: ReactNode
  id?: string
  onAction: () => void | Promise<void>
  title: string
}) {
  return (
    <SettingRow id={id} className={id ? 'scroll-mt-6 gap-3' : 'gap-3'}>
      <SettingRowTitle className="gap-2.5">
        {icon}
        {title}
      </SettingRowTitle>
      <Button size="sm" onClick={() => void onAction()} variant="outline">
        {actionLabel}
      </Button>
    </SettingRow>
  )
}

export default AboutSettings
