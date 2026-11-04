import type { SettingsSearchEntry } from '../settingsSearch/types'

export const route = '/settings/about'

export const entries: SettingsSearchEntry[] = [
  {
    anchorId: 'debug-tools',
    titleKey: 'settings.about.debug.title',
    groupKey: 'settings.about.label'
  }
]
