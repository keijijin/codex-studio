/**
 * Must be imported before any module that reads app.getPath('userData')
 * or constructs electron-store (e.g. settings.ts).
 */
import { app } from 'electron'
import { join } from 'path'
import { APP_ID, APP_NAME, APP_USER_DATA_DIR } from '@codex/shared'
import { enableSystemCaCertificates } from '../../../llm-adapters/src/system-ca-fetch'

// Electron 35 / Node 22 cannot setDefaultCACertificates; this installs a
// system-CA-aware fetch used by OpenAI/Anthropic clients (see llm-adapters).
enableSystemCaCertificates()

const e2eUserData = process.env.ELECTRON_USER_DATA?.trim()
app.setPath(
  'userData',
  e2eUserData && e2eUserData.length > 0
    ? e2eUserData
    : join(app.getPath('appData'), APP_USER_DATA_DIR),
)
app.setName(APP_NAME)
if (process.platform === 'win32') {
  app.setAppUserModelId(APP_ID)
}
