#!/usr/bin/env node
/**
 * In `pnpm dev`, macOS menu bar / Dock use Electron.app's Info.plist name.
 * Patch it so development shows "Codex Studio" instead of "Electron".
 */
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'

const APP_NAME = 'Codex Studio'

if (process.platform !== 'darwin') {
  process.exit(0)
}

const require = createRequire(import.meta.url)
let electronDist
try {
  electronDist = dirname(require.resolve('electron/package.json'))
} catch {
  process.exit(0)
}

const plist = join(electronDist, 'dist', 'Electron.app', 'Contents', 'Info.plist')
if (!existsSync(plist)) {
  process.exit(0)
}

try {
  for (const key of ['CFBundleName', 'CFBundleDisplayName']) {
    execFileSync('plutil', ['-replace', key, '-string', APP_NAME, plist], { stdio: 'pipe' })
  }
  console.log(`[patch-electron-name] ${plist} → ${APP_NAME}`)
} catch (err) {
  console.warn('[patch-electron-name] skipped:', err instanceof Error ? err.message : err)
}
