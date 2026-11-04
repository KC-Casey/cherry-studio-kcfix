import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { openSettingsTab } from '@renderer/services/mainWindowNavigation'

import { UserAccountPanel } from '../UserAccountPanel'

vi.mock('@renderer/services/mainWindowNavigation', () => ({ openSettingsTab: vi.fn() }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('../layout/AppearanceMenu', () => ({ AppearanceMenu: () => <div>Appearance</div> }))

describe('local profile panel', () => {
  it('keeps local profile and settings navigation without cloud login or billing requests', async () => {
    const request = vi.mocked(window.api.ipcApi.request)
    request.mockClear()
    const close = vi.fn()
    render(<UserAccountPanel onRequestClose={close} />)
    await userEvent.click(screen.getByRole('button', { name: 'settings.general.user_name.label' }))
    expect(openSettingsTab).toHaveBeenCalledWith('/settings/profile')
    expect(close).toHaveBeenCalled()
    expect(screen.getByText('Appearance')).toBeInTheDocument()
    expect(screen.queryByText('settings.provider.cherry_cloud.login')).not.toBeInTheDocument()
    expect(screen.queryByText('settings.subscription.card_label')).not.toBeInTheDocument()
    expect(request.mock.calls.filter(([name]) => name.startsWith('cherry_cloud.'))).toEqual([])
  })
})
