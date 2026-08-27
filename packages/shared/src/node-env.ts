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

function isNonUtf8Locale(value: string | undefined): boolean {
  if (!value || !value.trim()) return true
  const v = value.trim().toLowerCase()
  return v === 'c' || v === 'posix' || (!v.includes('utf-8') && !v.includes('utf8'))
}

/**
 * Ensure PTY / child shells can list and print Japanese (and other Unicode) paths.
 * Electron often inherits a sparse env without LANG; macOS then falls back to C
 * and `ls` shows `?` for non-ASCII filenames.
 */
export function ensureUtf8LocaleEnv(
  base: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const next: NodeJS.ProcessEnv = { ...base }
  const fromHost = base.LANG || process.env.LANG
  const preferred =
    process.platform === 'darwin' || process.platform === 'linux'
      ? fromHost && !isNonUtf8Locale(fromHost)
        ? fromHost
        : process.platform === 'darwin'
          ? 'ja_JP.UTF-8'
          : 'C.UTF-8'
      : undefined

  if (preferred) {
    if (isNonUtf8Locale(next.LANG)) next.LANG = preferred
    if (isNonUtf8Locale(next.LC_ALL)) next.LC_ALL = preferred
    if (isNonUtf8Locale(next.LC_CTYPE)) next.LC_CTYPE = preferred
    if (isNonUtf8Locale(next.LC_MESSAGES)) next.LC_MESSAGES = preferred
  }

  if (!next.PYTHONIOENCODING) next.PYTHONIOENCODING = 'utf-8'
  return next
}

/** Env for child processes / PTYs that should not inherit Electron-only Node flags. */
export function envWithoutElectronOnlyNodeOptions(
  base: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const next = ensureUtf8LocaleEnv(base)
  const sanitized = sanitizeNodeOptions(base.NODE_OPTIONS)
  if (sanitized === undefined) {
    delete next.NODE_OPTIONS
  } else {
    next.NODE_OPTIONS = sanitized
  }
  return next
}
