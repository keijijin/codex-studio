import { resolve, sep } from 'path'
import { isPathInsideRoot } from '@codex/shared'

export function resolveWithinWorkspace(
  workspaceRoot: string,
  targetPath: string,
): string {
  const normalizedRoot = resolve(workspaceRoot)
  const absolute = resolve(targetPath)
  if (isPathInsideRoot(normalizedRoot, absolute)) {
    return absolute
  }

  const relativeResolved = resolve(normalizedRoot, targetPath)
  if (!isPathInsideRoot(normalizedRoot, relativeResolved)) {
    throw new Error('Path is outside workspace')
  }
  return relativeResolved
}

/** @deprecated Prefer isPathInsideRoot from @codex/shared */
export function pathHasWorkspacePrefix(root: string, target: string): boolean {
  const normalizedRoot = resolve(root)
  const resolved = resolve(target)
  if (resolved === normalizedRoot) return true
  const prefix = normalizedRoot.endsWith(sep) ? normalizedRoot : normalizedRoot + sep
  return resolved.startsWith(prefix)
}
