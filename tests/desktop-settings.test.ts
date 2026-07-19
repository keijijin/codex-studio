import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  desktopSettingsStorePath,
  loadDesktopModelsSettings,
} from '../packages/cli/src/desktop-settings'

describe('desktop settings for CLI', () => {
  const prev = process.env.ELECTRON_USER_DATA

  afterEach(() => {
    if (prev === undefined) delete process.env.ELECTRON_USER_DATA
    else process.env.ELECTRON_USER_DATA = prev
  })

  it('reads models from electron-store json under ELECTRON_USER_DATA', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-cli-settings-'))
    process.env.ELECTRON_USER_DATA = dir
    writeFileSync(
      join(dir, 'codex-studio.json'),
      JSON.stringify({
        settings: {
          models: {
            defaultProvider: 'xai',
            defaultChatModel: 'grok-4.5',
            defaultAgentModel: 'grok-4.5',
            xaiApiKey: 'xai-test-key',
          },
        },
      }),
    )
    expect(desktopSettingsStorePath()).toBe(join(dir, 'codex-studio.json'))
    expect(loadDesktopModelsSettings()?.xaiApiKey).toBe('xai-test-key')
  })

  it('returns null when store is missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-cli-missing-'))
    process.env.ELECTRON_USER_DATA = dir
    expect(loadDesktopModelsSettings()).toBeNull()
  })
})
