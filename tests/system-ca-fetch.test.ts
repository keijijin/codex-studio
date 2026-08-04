import { describe, expect, it } from 'vitest'
import tls from 'node:tls'
import {
  enableSystemCaCertificates,
  getSystemCaFetch,
} from '../packages/llm-adapters/src/system-ca-fetch'

describe('system CA fetch', () => {
  it('enables system CA support when getCACertificates exists', () => {
    const hasApi =
      typeof (tls as unknown as { getCACertificates?: unknown }).getCACertificates ===
      'function'
    const ok = enableSystemCaCertificates()
    // Node 22+ / Electron: true. Node 20 (local vitest): false — API absent.
    expect(ok).toBe(hasApi)
  })

  it('can fetch api.openai.com without UNABLE_TO_VERIFY_LEAF_SIGNATURE', async () => {
    enableSystemCaCertificates()
    const fetchImpl = getSystemCaFetch() ?? fetch
    const res = await fetchImpl('https://api.openai.com/v1/models')
    // 401 without a key still proves TLS handshake succeeded.
    expect(res.status).toBeGreaterThanOrEqual(200)
    expect(res.status).toBeLessThan(500)
  })
})
