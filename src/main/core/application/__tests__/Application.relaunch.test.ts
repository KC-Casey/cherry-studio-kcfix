import { resolve as resolvePath } from 'node:path'

import { app } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PathMap } from '@main/core/paths/pathRegistry'

const platform = vi.hoisted(() => ({ isDev: false, isLinux: false, isMac: false, isPortable: true, isWin: true }))
vi.mock('@main/core/platform', () => platform)
vi.unmock('@application')

import { Application } from '../Application'

const executable = resolvePath('/portable/便携程序 with spaces/cherry-studio-kcfix.exe')
const calls: unknown[] = []
const application = Application.getInstance()

beforeEach(() => {
  calls.length = 0
  Object.assign(platform, { isDev: false, isLinux: false, isMac: false, isPortable: true, isWin: true })
  Object.assign(app, {
    isPackaged: true,
    relaunch: (options?: Electron.RelaunchOptions) => calls.push(options),
    exit: (code: number) => calls.push(code)
  })
  application.__setPathMapForTesting({ 'app.exe_file': executable } as PathMap)
  vi.stubEnv('PORTABLE_EXECUTABLE_FILE', undefined)
})

afterEach(() => {
  Object.assign(app, { isPackaged: false })
  vi.unstubAllEnvs()
})

describe('Application.relaunch executable selection', () => {
  it('restarts the directory executable with its arguments before exiting', () => {
    application.relaunch({ args: ['--restore-session'] })
    expect(calls).toEqual([{ execPath: executable, args: ['--restore-session'] }, 0])
  })

  it('restarts the NSIS source launcher rather than its temporary payload', () => {
    const launcher = resolvePath('/portable/Cherry Studio Portable.exe')
    vi.stubEnv('PORTABLE_EXECUTABLE_FILE', launcher)
    application.relaunch()
    expect(calls).toEqual([{ execPath: launcher, args: [] }, 0])
  })

  it('preserves normal installed-build relaunch behavior', () => {
    platform.isPortable = false
    vi.stubEnv('PORTABLE_EXECUTABLE_FILE', resolvePath('/unrelated/stale.exe'))
    application.relaunch({ args: ['--restore-session'] })
    expect(calls).toEqual([{ args: ['--restore-session'] }, 0])
  })

  it('retains the stable AppImage relaunch contract', () => {
    platform.isPortable = false
    platform.isWin = false
    platform.isLinux = true
    const appImage = resolvePath('/portable/CherryStudio.AppImage')
    vi.stubEnv('APPIMAGE', appImage)
    application.relaunch({ args: ['--restore-session'] })
    expect(calls).toEqual([{ execPath: appImage, args: ['--appimage-extract-and-run', '--restore-session'] }, 0])
  })
})
