import fs from 'node:fs'
import path from 'node:path'

import { app } from 'electron'

/** Recognize an explicitly marked, unpacked application before userData is resolved. */
export function isDirectoryPortable(): boolean {
  if (!app?.isPackaged) return false

  const markerPath = path.join(path.dirname(app.getPath('exe')), 'cherry-portable.json')
  try {
    const marker: unknown = JSON.parse(fs.readFileSync(markerPath, 'utf8'))
    if (typeof marker === 'object' && marker !== null && 'format' in marker && marker.format === 1) return true
    throw new Error('Unsupported portable marker format')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    // A broken marker must not silently select an unrelated installed profile.
    throw new Error(`Cannot read portable marker: ${markerPath}`, { cause: error })
  }
}
