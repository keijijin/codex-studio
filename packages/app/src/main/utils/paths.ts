import { existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

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

/** Resolve app icon for BrowserWindow / dock (dev: repo build/, prod: resources). */
export function resolveAppIconPath(): string | undefined {
  const candidates = [
    process.resourcesPath ? join(process.resourcesPath, 'icon.png') : '',
    join(process.cwd(), 'build', 'icon.png'),
    join(app.getAppPath(), 'build', 'icon.png'),
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return undefined
}
