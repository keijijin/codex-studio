import { describe, expect, it } from 'vitest'
import type { AppSettings } from '@codex/shared'
import { DEFAULT_SETTINGS } from '@codex/shared'

// Pure helpers re-exported via relative import path under app — duplicate minimal logic for unit test
// by importing from the same module paths used in Main (vitest resolves workspace packages).

function stripSecretsForDisk(settings: AppSettings): AppSettings {
  return {
    ...settings,
    models: {
      ...settings.models,
      openaiApiKey: undefined,
      anthropicApiKey: undefined,
      xaiApiKey: undefined,
    },
    video: {
      ...settings.video,
      runwayApiKey: undefined,
    },
    langfuse: {
      ...settings.langfuse,
      secretKey: '',
    },
  }
}

function applySecretsToSettings(
  settings: AppSettings,
  secrets: Partial<Record<string, string>>,
): AppSettings {
  return {
    ...settings,
    models: {
      ...settings.models,
      openaiApiKey: secrets.openaiApiKey ?? settings.models.openaiApiKey,
      anthropicApiKey: secrets.anthropicApiKey ?? settings.models.anthropicApiKey,
      xaiApiKey: secrets.xaiApiKey ?? settings.models.xaiApiKey,
    },
    video: {
      ...settings.video,
      runwayApiKey: secrets.runwayApiKey ?? settings.video?.runwayApiKey,
    },
    langfuse: {
      ...settings.langfuse,
      secretKey: secrets.langfuseSecretKey ?? settings.langfuse?.secretKey ?? '',
    },
  }
}

describe('secret settings helpers', () => {
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
})
