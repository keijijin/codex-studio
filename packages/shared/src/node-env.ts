/**
 * Remove flags that Electron may put in NODE_OPTIONS but host Node rejects.
 * (`--use-system-ca is not allowed in NODE_OPTIONS` on many Node builds)
 */
export function sanitizeNodeOptions(
  value: string | undefined | null,
): string | undefined {
  if (value == null || value === '') return undefined
  const cleaned = value
    .split(/\s+/)
    .filter(Boolean)
    .filter((opt) => opt !== '--use-system-ca')
  return cleaned.length > 0 ? cleaned.join(' ') : undefined
}

/** Env for child processes / PTYs that should not inherit Electron-only Node flags. */
export function envWithoutElectronOnlyNodeOptions(
  base: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const next: NodeJS.ProcessEnv = { ...base }
  const sanitized = sanitizeNodeOptions(base.NODE_OPTIONS)
  if (sanitized === undefined) {
    delete next.NODE_OPTIONS
  } else {
    next.NODE_OPTIONS = sanitized
  }
  return next
}
