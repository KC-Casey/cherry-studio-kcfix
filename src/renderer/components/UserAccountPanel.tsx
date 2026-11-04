import { Settings } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Avatar, AvatarImage, Button, ColFlex, EmojiAvatar } from '@cherrystudio/ui'
import { usePreference } from '@data/hooks/usePreference'
import { CommandShortcut } from '@renderer/components/command'
import useAvatar from '@renderer/hooks/useAvatar'
import { openSettingsTab } from '@renderer/services/mainWindowNavigation'
import { isEmoji } from '@renderer/utils/naming'

import { AppearanceMenu } from './layout/AppearanceMenu'

export function UserAccountPanel({ onRequestClose, children }: { onRequestClose?: () => void; children?: ReactNode }) {
  const [userName] = usePreference('app.user.name')
  const { t } = useTranslation()
  const avatar = useAvatar()
  const openSettings = (path?: '/settings/profile') => {
    onRequestClose?.()
    openSettingsTab(path)
  }

  return (
    <ColFlex className="w-56 p-1.5">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label={t('settings.general.user_name.label')}
        className="h-auto min-h-9 w-full justify-start gap-2 px-2 py-1"
        onClick={() => openSettings('/settings/profile')}>
        {isEmoji(avatar) ? (
          <EmojiAvatar size={20} fontSize={12}>
            {avatar}
          </EmojiAvatar>
        ) : (
          <Avatar className="size-5 rounded-full">
            <AvatarImage src={avatar} className="object-cover" />
          </Avatar>
        )}
        <span className="truncate">{userName || t('settings.profile.title')}</span>
      </Button>
      <ColFlex className="border-border-subtle gap-0.5 border-t py-1">
        <AppearanceMenu onRequestClose={onRequestClose} />
        {children}
      </ColFlex>
      <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={() => openSettings()}>
        <Settings className="size-4 text-muted-foreground" aria-hidden />
        <span className="flex-1 text-left">{t('common.settings')}</span>
        <CommandShortcut command="app.settings.open" />
      </Button>
    </ColFlex>
  )
}
