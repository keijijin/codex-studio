import { resolve } from 'path'

export function resolveWithinWorkspace(
  workspaceRoot: string,
  targetPath: string,
): string {
  const normalizedRoot = resolve(workspaceRoot)
  const resolved = resolve(targetPath)

  if (resolved.startsWith(normalizedRoot)) {
    return resolved
  }

  const relativeResolved = resolve(normalizedRoot, targetPath)
  if (!relativeResolved.startsWith(normalizedRoot)) {
    throw new Error('Path is outside workspace')
  }
  return relativeResolved
}
