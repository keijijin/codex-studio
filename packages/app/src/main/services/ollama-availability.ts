/** Short-lived probe cache so we don't hit Ollama on every chat turn. */
type ProbeEntry = { ok: boolean; at: number }

const cache = new Map<string, ProbeEntry>()
const TTL_MS = 15_000
const PROBE_TIMEOUT_MS = 700

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, '')
}

export function getCachedOllamaAvailability(baseUrl: string): boolean | null {
  const entry = cache.get(normalizeBaseUrl(baseUrl))
  if (!entry) return null
  if (Date.now() - entry.at >= TTL_MS) return null
  return entry.ok
}

export function markOllamaAvailability(baseUrl: string, ok: boolean): void {
  cache.set(normalizeBaseUrl(baseUrl), { ok, at: Date.now() })
}

/** HEAD/GET /api/tags with a short timeout. Results are cached. */
export async function probeOllamaAvailable(baseUrl: string): Promise<boolean> {
  const key = normalizeBaseUrl(baseUrl)
  const cached = getCachedOllamaAvailability(key)
  if (cached !== null) return cached

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  try {
    const res = await fetch(`${key}/api/tags`, { signal: controller.signal })
    const ok = res.ok
    markOllamaAvailability(key, ok)
    return ok
  } catch {
    markOllamaAvailability(key, false)
    return false
  } finally {
    clearTimeout(timer)
  }
}

/** Test helper */
export function clearOllamaAvailabilityCache(): void {
  cache.clear()
}
