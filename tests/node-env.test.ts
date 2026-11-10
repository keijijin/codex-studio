import { describe, expect, it } from 'vitest'
import {
  ensureUtf8LocaleEnv,
  envWithoutElectronOnlyNodeOptions,
  sanitizeNodeOptions,
} from '../packages/shared/src/node-env'

describe('sanitizeNodeOptions', () => {
  it('strips --use-system-ca', () => {
    expect(sanitizeNodeOptions('--use-system-ca')).toBeUndefined()
    expect(sanitizeNodeOptions('--max-old-space-size=4096 --use-system-ca')).toBe(
      '--max-old-space-size=4096',
    )
  })

  it('envWithoutElectronOnlyNodeOptions removes the flag', () => {
    const env = envWithoutElectronOnlyNodeOptions({
      PATH: '/usr/bin',
      NODE_OPTIONS: '--use-system-ca --trace-warnings',
    })
    expect(env.NODE_OPTIONS).toBe('--trace-warnings')
    expect(env.PATH).toBe('/usr/bin')
  })

  it('ensureUtf8LocaleEnv fills LANG when missing or C', () => {
    const env = ensureUtf8LocaleEnv({ PATH: '/usr/bin', LANG: 'C' })
    expect(env.LANG?.toLowerCase()).toMatch(/utf-?8/)
    expect(env.LC_CTYPE?.toLowerCase()).toMatch(/utf-?8/)
    expect(env.PYTHONIOENCODING).toBe('utf-8')
  })

  it('envWithoutElectronOnlyNodeOptions keeps UTF-8 locale', () => {
    const env = envWithoutElectronOnlyNodeOptions({
      PATH: '/bin',
      LANG: '',
      NODE_OPTIONS: '--use-system-ca',
    })
    expect(env.NODE_OPTIONS).toBeUndefined()
    expect(env.LANG?.toLowerCase()).toMatch(/utf-?8/)
  })
})
