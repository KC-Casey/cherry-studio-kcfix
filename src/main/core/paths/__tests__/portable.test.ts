import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const electronState = vi.hoisted(() => ({ appAvailable: true, isPackaged: true, exePath: '' }))

vi.mock('electron', () => ({
  get app() {
    if (!electronState.appAvailable) return undefined
    return {
      get isPackaged() {
        return electronState.isPackaged
      },
      getPath: () => electronState.exePath
    }
  }
}))

import { isDirectoryPortable } from '../portable'

const hostPlatform = process.platform
let root: string
let markerPath: string

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'kcfix-portable-'))
  const appDir = path.join(root, '便携程序 with spaces')
  fs.mkdirSync(appDir)
  electronState.appAvailable = true
  electronState.isPackaged = true
  electronState.exePath = path.join(appDir, 'cherry-studio-kcfix.exe')
  markerPath = path.join(appDir, 'cherry-portable.json')
  vi.stubEnv('PORTABLE_EXECUTABLE_DIR', undefined)
})

afterEach(() => {
  Object.defineProperty(process, 'platform', { value: hostPlatform, configurable: true })
  vi.unstubAllEnvs()
  fs.rmSync(root, { recursive: true, force: true })
})

describe('directory portable marker', () => {
  it('recognizes the shipped marker before a data directory exists', () => {
    fs.writeFileSync(markerPath, '{"format":1}')
    expect(isDirectoryPortable()).toBe(true)
    expect(fs.existsSync(path.join(path.dirname(markerPath), 'data'))).toBe(false)
  })

  it('does not turn an installed application into portable mode just because data exists', () => {
    fs.mkdirSync(path.join(path.dirname(markerPath), 'data'))
    expect(isDirectoryPortable()).toBe(false)
  })

  it('ignores markers in development', () => {
    electronState.isPackaged = false
    fs.writeFileSync(markerPath, '{"format":1}')
    expect(isDirectoryPortable()).toBe(false)
  })

  it('is safe in utility processes without the Electron app API', async () => {
    electronState.appAvailable = false
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
    vi.resetModules()
    expect((await import('../../platform')).isPortable).toBe(false)
  })

  it.each(['{', '{}', '{"format":2}', 'null', '1'])(
    'refuses invalid marker %s instead of selecting another profile',
    (value) => {
      fs.writeFileSync(markerPath, value)
      expect(() => isDirectoryPortable()).toThrow('Cannot read portable marker:')
    }
  )

  it('does not silently ignore an unreadable marker', () => {
    fs.mkdirSync(markerPath)
    expect(() => isDirectoryPortable()).toThrow('Cannot read portable marker:')
  })

  it('enables Windows portable mode without an NSIS launcher', async () => {
    fs.writeFileSync(markerPath, '{"format":1}')
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
    vi.resetModules()
    expect((await import('../../platform')).isPortable).toBe(true)
  })

  it('does not enable portable mode on other platforms', async () => {
    fs.writeFileSync(markerPath, '{"format":1}')
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true })
    vi.resetModules()
    expect((await import('../../platform')).isPortable).toBe(false)
  })

  it('keeps legacy NSIS portable recognition without a directory marker', async () => {
    vi.stubEnv('PORTABLE_EXECUTABLE_DIR', path.dirname(markerPath))
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
    vi.resetModules()
    expect((await import('../../platform')).isPortable).toBe(true)
  })
})
