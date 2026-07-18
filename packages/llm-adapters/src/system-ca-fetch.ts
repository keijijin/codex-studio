import http from 'node:http'
import https from 'node:https'
import { Readable } from 'node:stream'
import tls from 'node:tls'
import { URL } from 'node:url'

type TlsWithCaApi = typeof tls & {
  getCACertificates?: (type?: string) => readonly string[]
  setDefaultCACertificates?: (certs: readonly string[]) => void
}

let installed = false
let cachedFetch: typeof globalThis.fetch | undefined

function getMergedCaCertificates(): string[] | undefined {
  const t = tls as TlsWithCaApi
  if (typeof t.getCACertificates !== 'function') return undefined
  try {
    return [...t.getCACertificates('default'), ...t.getCACertificates('system')]
  } catch {
    return undefined
  }
}

/**
 * Electron 35 ships Node 22.16 which can *read* OS CAs via getCACertificates('system')
 * but cannot *install* them globally (setDefaultCACertificates arrives in newer Node).
 * Corporate MITM proxies need those OS CAs or every OpenAI/Anthropic call fails with
 * "Connection error." / UNABLE_TO_VERIFY_LEAF_SIGNATURE.
 */
export function enableSystemCaCertificates(): boolean {
  if (installed) return true
  const t = tls as TlsWithCaApi
  if (typeof t.getCACertificates !== 'function') return false

  if (typeof t.setDefaultCACertificates === 'function') {
    try {
      const merged = getMergedCaCertificates()
      if (merged) {
        t.setDefaultCACertificates(merged)
        installed = true
        return true
      }
    } catch {
      // fall through to custom fetch
    }
  }

  // Node 22 / Electron 35: provide a fetch that uses an Agent with merged CAs.
  const ca = getMergedCaCertificates()
  if (!ca || ca.length === 0) return false
  cachedFetch = createAgentFetch(ca)
  installed = true
  return true
}

/** Fetch that trusts OS + Node default CAs (for OpenAI / Anthropic SDKs). */
export function getSystemCaFetch(): typeof globalThis.fetch | undefined {
  enableSystemCaCertificates()
  if (cachedFetch) return cachedFetch
  // Global CA install succeeded — native fetch is enough.
  if (installed) return undefined
  return undefined
}

function createAgentFetch(ca: string[]): typeof globalThis.fetch {
  const httpsAgent = new https.Agent({ ca, keepAlive: true })
  const httpAgent = new http.Agent({ keepAlive: true })

  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init)
    const url = new URL(request.url)
    const isHttps = url.protocol === 'https:'
    const headers: Record<string, string> = {}
    request.headers.forEach((value, key) => {
      headers[key] = value
    })

    // Avoid Node calculating a mismatched Content-Length for streamed bodies.
    const bodyBuf =
      request.method === 'GET' || request.method === 'HEAD'
        ? undefined
        : Buffer.from(await request.arrayBuffer())
    if (bodyBuf && bodyBuf.length > 0) {
      headers['content-length'] = String(bodyBuf.length)
    }

    return new Promise<Response>((resolve, reject) => {
      const lib = isHttps ? https : http
      const req = lib.request(
        {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path: `${url.pathname}${url.search}`,
          method: request.method,
          headers,
          agent: isHttps ? httpsAgent : httpAgent,
        },
        (res) => {
          const webStream = Readable.toWeb(res) as ReadableStream<Uint8Array>
          const responseHeaders = new Headers()
          for (const [key, value] of Object.entries(res.headers)) {
            if (value === undefined) continue
            if (Array.isArray(value)) {
              for (const item of value) responseHeaders.append(key, item)
            } else {
              responseHeaders.set(key, value)
            }
          }
          resolve(
            new Response(webStream, {
              status: res.statusCode ?? 0,
              statusText: res.statusMessage,
              headers: responseHeaders,
            }),
          )
        },
      )

      const signal = init?.signal ?? request.signal
      if (signal) {
        if (signal.aborted) {
          req.destroy(new Error('Aborted'))
          reject(signal.reason ?? new Error('Aborted'))
          return
        }
        signal.addEventListener(
          'abort',
          () => {
            req.destroy(new Error('Aborted'))
          },
          { once: true },
        )
      }

      req.on('error', reject)
      if (bodyBuf && bodyBuf.length > 0) req.write(bodyBuf)
      req.end()
    })
  }
}
