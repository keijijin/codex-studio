/**
 * True if `target` is `root` or a path inside it
 * (avoids `/workspace` matching `/workspace-evil`).
 *
 * Browser-safe: no Node `path` import (shared is used by the renderer).
 * Pass already-resolved absolute paths when possible.
 */
export function isPathInsideRoot(root: string, target: string): boolean {
  const trimTrailing = (p: string) => p.replace(/[/\\]+$/, '')
  const r = trimTrailing(root)
  const t = trimTrailing(target)
  if (t === r) return true

  const sep = r.includes('\\') && !r.startsWith('/') ? '\\' : '/'
  return t.startsWith(r + sep)
}
