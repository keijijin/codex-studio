/** Short-lived probe cache for llama-server (OpenAI-compatible). */
type ProbeEntry = { ok: boolean; at: number }

const cache = new Map<string, ProbeEntry>()
const TTL_MS = 15_000
const PROBE_TIMEOUT_MS = 700

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, '')
}

export function getCachedLlamacppAvailability(baseUrl: string): boolean | null {
  const entry = cache.get(normalizeBaseUrl(baseUrl))
  if (!entry) return null
  if (Date.now() - entry.at >= TTL_MS) return null
  return entry.ok
}

export function markLlamacppAvailability(baseUrl: string, ok: boolean): void {
  cache.set(normalizeBaseUrl(baseUrl), { ok, at: Date.now() })
}

/** Probe /v1/models (falls back to /health) with a short timeout. */
export async function probeLlamacppAvailable(baseUrl: string): Promise<boolean> {
  const key = normalizeBaseUrl(baseUrl)
  const cached = getCachedLlamacppAvailability(key)
  if (cached !== null) return cached

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  try {
    const modelsRes = await fetch(`${key}/v1/models`, { signal: controller.signal })
    if (modelsRes.ok) {
      markLlamacppAvailability(key, true)
      return true
    }
    const healthRes = await fetch(`${key}/health`, { signal: controller.signal })
    const ok = healthRes.ok
    markLlamacppAvailability(key, ok)
    return ok
  } catch {
    markLlamacppAvailability(key, false)
    return false
  } finally {
    clearTimeout(timer)
  }
}

/** Test helper */
export function clearLlamacppAvailabilityCache(): void {
  cache.clear()
}
