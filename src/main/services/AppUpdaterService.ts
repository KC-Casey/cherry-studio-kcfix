import { app } from 'electron'

import { application } from '@application'
import { BaseService, Injectable, Phase, ServicePhase } from '@main/core/lifecycle'
import { WindowType } from '@main/core/window/types'
import { IpcError, IpcErrorCode } from '@shared/ipc/errors/IpcError'
import type { OutputFor } from '@shared/ipc/types'
import type { ReleaseNotesEntry } from '@shared/utils/releaseNotes'

// Keep the IPC contract without allowing an upstream installer to replace this private fork.
@Injectable('AppUpdaterService')
@ServicePhase(Phase.WhenReady)
export class AppUpdaterService extends BaseService {
  public async queryUpdateAvailability(): Promise<
    | { status: 'unsupported' }
    | { status: 'current'; currentVersion: string }
    | { status: 'available'; currentVersion: string; version: string }
  > {
    return { status: 'unsupported' }
  }

  public async getLatestReleaseNotes(): Promise<ReleaseNotesEntry | null> {
    return null
  }

  public async getReleaseHistory(): Promise<ReleaseNotesEntry[] | null> {
    return null
  }

  public async getUpgradeReleaseNotes(targetVersion: string): Promise<OutputFor<'app.updater.upgrade_notes.get'>> {
    return { fromVersion: app.getVersion(), toVersion: targetVersion, historyStatus: 'unavailable', releases: [] }
  }

  public async checkForUpdates() {
    application.get('IpcApiService').broadcastToType(WindowType.Main, 'app.updater.not_available', { isCurrent: false })
    return { currentVersion: app.getVersion(), updateInfo: null }
  }

  public quitAndInstall(): never {
    throw new IpcError(IpcErrorCode.VALIDATION_FAILED, 'Updates are disabled for this private fork.')
  }
}
