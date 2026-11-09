import { existsSync, realpathSync } from 'fs'
import { isAbsolute, join, relative, resolve, sep } from 'path'
import { isPathInsideRoot } from '@codex/shared'

/**
 * Resolve a workspace path and ensure the *real* path stays inside the
 * workspace root (blocks symlink escapes). Relative paths are resolved
 * against the workspace root only (never process.cwd()).
 */
export function resolveWithinWorkspace(
  workspaceRoot: string,
  targetPath: string,
): string {
  const rootAbs = resolve(workspaceRoot)
  const logical = isAbsolute(targetPath) ? resolve(targetPath) : resolve(rootAbs, targetPath)

  const rel = relative(rootAbs, logical)
  if (rel.startsWith(`..${sep}`) || rel === '..' || isAbsolute(rel)) {
    throw new Error('Path is outside workspace')
  }

  const rootReal = existsSync(rootAbs) ? realpathSync(rootAbs) : rootAbs

  if (existsSync(logical)) {
    const real = realpathSync(logical)
    if (!isPathInsideRoot(rootReal, real)) {
      throw new Error('Path is outside workspace')
    }
    return real
  }

  // Non-existent target (e.g. Write): keep under the real root using the relative path.
  return rel === '' ? rootReal : join(rootReal, rel)
}

/** @deprecated Prefer isPathInsideRoot from @codex/shared */
export function pathHasWorkspacePrefix(root: string, target: string): boolean {
  const normalizedRoot = resolve(root)
  const resolved = resolve(target)
  if (resolved === normalizedRoot) return true
  const prefix =
    normalizedRoot.endsWith('/') || normalizedRoot.endsWith('\\')
      ? normalizedRoot
      : normalizedRoot + (normalizedRoot.includes('\\') ? '\\' : '/')
  return resolved.startsWith(prefix)
}
