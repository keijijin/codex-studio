import { describe, expect, it } from 'vitest'
import {
  enableSystemCaCertificates,
  getSystemCaFetch,
} from '../packages/llm-adapters/src/system-ca-fetch'

describe('system CA fetch', () => {
  it('enables system CA support when getCACertificates exists', () => {
    const ok = enableSystemCaCertificates()
    // On Node 22+ (including Electron) this should succeed on Windows/macOS/Linux.
    expect(ok).toBe(true)
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
