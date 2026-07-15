import { existsSync } from 'fs'
import { join } from 'path'

/** Resolve preload script path (electron-vite outputs .mjs in dev, .js in prod). */
export function resolvePreloadPath(mainDirname: string): string {
  const candidates = [
    join(mainDirname, '../preload/index.mjs'),
    join(mainDirname, '../preload/index.js'),
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return candidates[0]
}
