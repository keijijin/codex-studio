import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { APP_USER_DATA_DIR, type AppSettings } from '@codex/shared'

/** Path to Electron `electron-store` file (same as the desktop app). */
export function desktopSettingsStorePath(): string {
  if (process.env.ELECTRON_USER_DATA) {
    return join(process.env.ELECTRON_USER_DATA, 'codex-studio.json')
  }
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', APP_USER_DATA_DIR, 'codex-studio.json')
  }
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || join(homedir(), 'AppData', 'Roaming')
    return join(appData, APP_USER_DATA_DIR, 'codex-studio.json')
  }
  const config = process.env.XDG_CONFIG_HOME || join(homedir(), '.config')
  return join(config, APP_USER_DATA_DIR, 'codex-studio.json')
}

/** Models section saved by Codex Studio Settings (may be missing). */
export function loadDesktopModelsSettings(): AppSettings['models'] | null {
  const path = desktopSettingsStorePath()
  if (!existsSync(path)) return null
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as {
      settings?: { models?: AppSettings['models'] }
    }
    return raw.settings?.models ?? null
  } catch {
    return null
  }
}
