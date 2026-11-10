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

  it(
    'can fetch api.openai.com without UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    async () => {
      enableSystemCaCertificates()
      const fetchImpl = getSystemCaFetch() ?? fetch
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 12_000)
      try {
        const res = await fetchImpl('https://api.openai.com/v1/models', {
          signal: controller.signal,
        })
        // 401 without a key still proves TLS handshake succeeded.
        expect(res.status).toBeGreaterThanOrEqual(200)
        expect(res.status).toBeLessThan(500)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        // Network / DNS / abort are environmental — only TLS CA failures are regressions.
        if (
          /UNABLE_TO_VERIFY_LEAF_SIGNATURE|CERT_HAS_EXPIRED|DEPTH_ZERO_SELF_SIGNED|self[- ]signed/i.test(
            message,
          )
        ) {
          throw err
        }
        console.warn(`[system-ca-fetch] skipped live check: ${message}`)
      } finally {
        clearTimeout(timer)
      }
    },
    15_000,
  )
})
