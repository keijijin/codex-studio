import { describe, expect, it } from 'vitest'
import {
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
})
