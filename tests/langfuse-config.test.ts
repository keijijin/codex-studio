import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_LANGFUSE } from '@codex/shared'
import {
  isLangfuseConfigured,
  langfuseHostHint,
  normalizeLangfuseBaseUrl,
  resolveLangfuseConfig,
} from '../packages/app/src/main/services/langfuse-config'

const ENV_KEYS = [
  'LANGFUSE_PUBLIC_KEY',
  'LANGFUSE_SECRET_KEY',
  'LANGFUSE_BASE_URL',
  'LANGFUSE_HOST',
  'LANGFUSE_BASEURL',
] as const

afterEach(() => {
  for (const key of ENV_KEYS) {
    delete process.env[key]
  }
})

describe('resolveLangfuseConfig', () => {
  it('defaults to disabled local base URL', () => {
    const cfg = resolveLangfuseConfig(null)
    expect(cfg.enabled).toBe(false)
    expect(cfg.publicKey).toBe('')
    expect(cfg.secretKey).toBe('')
    expect(cfg.baseUrl).toBe(DEFAULT_LANGFUSE.baseUrl)
  })

  it('strips trailing slash from baseUrl', () => {
    const cfg = resolveLangfuseConfig({
      ...DEFAULT_LANGFUSE,
      enabled: true,
      publicKey: 'pk',
      secretKey: 'sk',
      baseUrl: 'http://localhost:3000/',
    })
    expect(cfg.baseUrl).toBe('http://localhost:3000')
  })

  it('enables when env keys are present even if settings.enabled is false', () => {
    process.env.LANGFUSE_PUBLIC_KEY = 'pk-env'
    process.env.LANGFUSE_SECRET_KEY = 'sk-env'
    process.env.LANGFUSE_BASE_URL = 'https://cloud.langfuse.com/'
    const cfg = resolveLangfuseConfig({ ...DEFAULT_LANGFUSE, enabled: false })
    expect(cfg.enabled).toBe(true)
    expect(cfg.publicKey).toBe('pk-env')
    expect(cfg.secretKey).toBe('sk-env')
    expect(cfg.baseUrl).toBe('https://cloud.langfuse.com')
  })

  it('prefers settings keys over env', () => {
    process.env.LANGFUSE_PUBLIC_KEY = 'pk-env'
    process.env.LANGFUSE_SECRET_KEY = 'sk-env'
    const cfg = resolveLangfuseConfig({
      enabled: true,
      publicKey: 'pk-settings',
      secretKey: 'sk-settings',
      baseUrl: 'http://localhost:3000',
    })
    expect(cfg.publicKey).toBe('pk-settings')
    expect(cfg.secretKey).toBe('sk-settings')
  })

  it('strips curly quotes from baseUrl', () => {
    expect(normalizeLangfuseBaseUrl('“https://jp.cloud.langfuse.com”')).toBe(
      'https://jp.cloud.langfuse.com',
    )
  })
})

describe('langfuseHostHint', () => {
  it('warns when Cloud keys point at localhost', () => {
    const hint = langfuseHostHint({
      enabled: true,
      publicKey: 'pk-lf-xxxx',
      secretKey: 'sk-lf-yyyy',
      baseUrl: 'http://localhost:3000',
    })
    expect(hint).toMatch(/jp\.cloud\.langfuse\.com/)
  })

  it('is silent when Cloud keys match Cloud host', () => {
    expect(
      langfuseHostHint({
        enabled: true,
        publicKey: 'pk-lf-xxxx',
        secretKey: 'sk-lf-yyyy',
        baseUrl: 'https://jp.cloud.langfuse.com',
      }),
    ).toBeNull()
  })
})

describe('isLangfuseConfigured', () => {
  it('is false without keys', () => {
    expect(
      isLangfuseConfigured({
        langfuse: { ...DEFAULT_LANGFUSE, enabled: true },
      } as never),
    ).toBe(false)
  })

  it('is true when enabled with keys', () => {
    expect(
      isLangfuseConfigured({
        langfuse: {
          enabled: true,
          publicKey: 'pk',
          secretKey: 'sk',
          baseUrl: 'http://localhost:3000',
        },
      } as never),
    ).toBe(true)
  })
})
