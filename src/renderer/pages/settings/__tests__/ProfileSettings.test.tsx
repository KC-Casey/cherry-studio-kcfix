import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ProfileSettings } from '../ProfileSettings'

vi.mock('@renderer/components/UserProfileEditor', () => ({
  UserProfileEditor: () => <button type="button" aria-label="Avatar editor" />
}))
vi.mock('../SubscriptionSettings', () => ({
  SubscriptionSettings: () => <div>Subscription and quota</div>
}))
vi.mock('@renderer/components/AccountSignOutButton', () => ({
  AccountSignOutButton: () => <button type="button">Cloud sign out</button>
}))

describe('ProfileSettings', () => {
  it('preserves local profile editing without account or subscription controls', () => {
    render(<ProfileSettings />)
    expect(screen.getByRole('button', { name: 'Avatar editor' })).toBeInTheDocument()
    expect(screen.queryByText('Subscription and quota')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cloud sign out' })).not.toBeInTheDocument()
  })
})
