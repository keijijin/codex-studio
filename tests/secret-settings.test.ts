import { describe, expect, it } from 'vitest'
import { API_KEY_CLEAR, API_KEY_REDACTED, DEFAULT_SETTINGS, mergeApiKeyField, type AppSettings } from '@codex/shared'
import {
  applySecretsToSettings,
  extractSecretsFromSettings,
  stripSecretsForDisk,
} from '../packages/app/src/main/services/secret-store'

describe('secret settings helpers (production modules)', () => {
  it('strips API keys for disk persistence', () => {
    const settings: AppSettings = {
      ...DEFAULT_SETTINGS,
      models: {
        ...DEFAULT_SETTINGS.models,
        openaiApiKey: 'sk-test',
        anthropicApiKey: 'ant-test',
      },
      video: { ...DEFAULT_SETTINGS.video, runwayApiKey: 'rw-test' },
      langfuse: { ...DEFAULT_SETTINGS.langfuse, secretKey: 'sk-lf-test' },
    }
    const stripped = stripSecretsForDisk(settings)
    expect(stripped.models.openaiApiKey).toBeUndefined()
    expect(stripped.models.anthropicApiKey).toBeUndefined()
    expect(stripped.video.runwayApiKey).toBeUndefined()
    expect(stripped.langfuse.secretKey).toBe('')
    expect(extractSecretsFromSettings(stripped).openaiApiKey).toBeUndefined()
  })

  it('overlays decrypted secrets onto settings', () => {
    const base = stripSecretsForDisk(DEFAULT_SETTINGS)
    const hydrated = applySecretsToSettings(base, {
      openaiApiKey: 'sk-from-keychain',
      langfuseSecretKey: 'sk-lf-from-keychain',
    })
    expect(hydrated.models.openaiApiKey).toBe('sk-from-keychain')
    expect(hydrated.langfuse.secretKey).toBe('sk-lf-from-keychain')
  })

  it('mergeApiKeyField keeps redacted, clears sentinel, replaces otherwise', () => {
    expect(mergeApiKeyField('sk-old', undefined)).toBe('sk-old')
    expect(mergeApiKeyField('sk-old', API_KEY_REDACTED)).toBe('sk-old')
    expect(mergeApiKeyField('sk-old', API_KEY_CLEAR)).toBe('')
    expect(mergeApiKeyField('sk-old', '')).toBe('')
    expect(mergeApiKeyField('sk-old', 'sk-new')).toBe('sk-new')
  })
})
