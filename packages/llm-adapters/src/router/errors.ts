/** Errors that should not trigger provider fallback (auth / cancel / bad request). */
const NON_RETRYABLE = [
  /api key/i,
  /unauthorized/i,
  /invalid.?api.?key/i,
  /authentication/i,
  /\b401\b/,
  /\b403\b/,
  /permission denied/i,
  /abort(ed)?/i,
  /cancelled/i,
  /canceled/i,
]

/** Failures worth trying the next model/provider. */
const RETRYABLE = [
  /\b429\b/,
  /rate.?limit/i,
  /quota/i,
  /insufficient_quota/i,
  /overloaded/i,
  /capacity/i,
  /\b404\b/,
  /not_found_error/i,
  /model:.*not.?found/i,
  /model: claude-/i,
  /\b500\b/,
  /\b502\b/,
  /\b503\b/,
  /\b504\b/,
  /timeout/i,
  /timed out/i,
  /ECONNREFUSED/i,
  /ENOTFOUND/i,
  /ECONNRESET/i,
  /fetch failed/i,
  /connection error/i,
  /certificate/i,
  /UNABLE_TO_VERIFY/i,
  /network/i,
  /socket/i,
  /ollama/i,
  /connection refused/i,
  /接続できません/i,
  /への接続に失敗/i,
  /temporarily unavailable/i,
]

/** True when the provider is unreachable (worth switching models). */
export function isConnectionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  if (!message.trim()) return false
  return (
    /connection error/i.test(message) ||
    /fetch failed/i.test(message) ||
    /ECONNREFUSED/i.test(message) ||
    /ENOTFOUND/i.test(message) ||
    /ECONNRESET/i.test(message) ||
    /certificate/i.test(message) ||
    /UNABLE_TO_VERIFY/i.test(message) ||
    /接続できません/i.test(message) ||
    /への接続に失敗/i.test(message) ||
    /connection refused/i.test(message)
  )
}

export function isRetryableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  if (!message.trim()) return false
  if (NON_RETRYABLE.some((re) => re.test(message))) return false
  return RETRYABLE.some((re) => re.test(message))
}
