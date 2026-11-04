import { app, net } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AppUpdaterService } from '../AppUpdaterService'

vi.mock('electron', () => ({
  app: { getVersion: vi.fn(() => '2.1.10'), quit: vi.fn() },
  net: { fetch: vi.fn() }
}))
vi.mock('@application', async () => {
  const { mockApplicationFactory } = await import('@test-mocks/main/application')
  return mockApplicationFactory()
})
vi.mock('@main/core/lifecycle', () => ({
  BaseService: class {},
  Injectable: () => (target: unknown) => target,
  ServicePhase: () => (target: unknown) => target,
  Phase: { WhenReady: 'whenReady' }
}))

describe('private fork update protection', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reports updates unsupported and never contacts the upstream feed', async () => {
    const service = new AppUpdaterService()
    expect(await service.queryUpdateAvailability()).toEqual({ status: 'unsupported' })
    expect(await service.checkForUpdates()).toEqual({ currentVersion: '2.1.10', updateInfo: null })
    expect(await service.getReleaseHistory()).toBeNull()
    expect(await service.getLatestReleaseNotes()).toBeNull()
    expect(await service.getUpgradeReleaseNotes('9.0.0')).toEqual({
      fromVersion: '2.1.10',
      toVersion: '9.0.0',
      historyStatus: 'unavailable',
      releases: []
    })
    expect(net.fetch).not.toHaveBeenCalled()
  })

  it('refuses installation even if a stale renderer requests it', () => {
    expect(() => new AppUpdaterService().quitAndInstall()).toThrow('Updates are disabled')
    expect(app.quit).not.toHaveBeenCalled()
  })
})
