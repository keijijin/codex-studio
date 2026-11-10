import { existsSync, lstatSync, realpathSync } from 'fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'path'
import { isPathInsideRoot } from '@codex/shared'

function tryRealpath(p: string): string {
  try {
    return realpathSync(p)
  } catch {
    return resolve(p)
  }
}

function isEscapingRelative(rel: string): boolean {
  return rel.startsWith(`..${sep}`) || rel === '..' || isAbsolute(rel)
}

/**
 * Walk path segments from an existing root, verifying every symlink stays inside rootReal.
 */
function walkSegments(
  rootReal: string,
  startLogical: string,
  startReal: string,
  segments: string[],
): string {
  let logicalCursor = startLogical
  let realCursor = startReal

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!
    logicalCursor = join(logicalCursor, seg)
    const isLast = i === segments.length - 1

    let isDanglingLink = false
    try {
      if (lstatSync(logicalCursor).isSymbolicLink()) {
        try {
          realpathSync(logicalCursor)
        } catch {
          isDanglingLink = true
        }
      }
    } catch {
      // ENOENT from lstat — path does not exist
    }

    if (isDanglingLink) {
      throw new Error('Path is outside workspace')
    }

    if (!existsSync(logicalCursor)) {
      const rest = segments.slice(i)
      const finalPath = join(realCursor, ...rest)
      if (!isPathInsideRoot(rootReal, finalPath)) {
        throw new Error('Path is outside workspace')
      }
      return finalPath
    }

    let realNext: string
    try {
      const st = lstatSync(logicalCursor)
      if (st.isSymbolicLink()) {
        try {
          realNext = realpathSync(logicalCursor)
        } catch {
          throw new Error('Path is outside workspace')
        }
      } else {
        realNext = tryRealpath(logicalCursor)
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('outside workspace')) throw err
      realNext = tryRealpath(logicalCursor)
    }

    if (!isPathInsideRoot(rootReal, realNext)) {
      throw new Error('Path is outside workspace')
    }
    realCursor = realNext

    if (isLast) {
      return realCursor
    }
  }

  return realCursor
}

/**
 * Resolve a workspace path and ensure the *real* path stays inside the
 * workspace root (blocks symlink escapes, including via parent directories).
 * Relative paths are resolved against the workspace root only (never cwd).
 */
export function resolveWithinWorkspace(
  workspaceRoot: string,
  targetPath: string,
): string {
  const rootAbs = resolve(workspaceRoot)
  const rootReal = existsSync(rootAbs) ? tryRealpath(rootAbs) : rootAbs
  const logical = isAbsolute(targetPath) ? resolve(targetPath) : resolve(rootAbs, targetPath)

  let walkLogical = rootAbs
  let walkReal = rootReal
  let rel = relative(rootAbs, logical)

  if (isEscapingRelative(rel)) {
    // Absolute path under the real root (e.g. root is a symlink; caller passed realpath).
    const relToReal = relative(rootReal, logical)
    if (isEscapingRelative(relToReal)) {
      if (existsSync(logical)) {
        const real = tryRealpath(logical)
        if (isPathInsideRoot(rootReal, real)) return real
      }
      throw new Error('Path is outside workspace')
    }
    // Still walk segments so directory symlinks under the real root cannot escape.
    walkLogical = rootReal
    walkReal = rootReal
    rel = relToReal
  }

  const segments = rel === '' ? [] : rel.split(sep)
  if (segments.length === 0) {
    return walkReal
  }
  return walkSegments(rootReal, walkLogical, walkReal, segments)
}

/**
 * Resolve a path for unlink/delete: if the final component is a symlink inside
 * the workspace (even when the target escapes or is dangling), return the link
 * path itself so we remove the link rather than the external target.
 */
export function resolveUnlinkWithinWorkspace(
  workspaceRoot: string,
  targetPath: string,
): string {
  const rootAbs = resolve(workspaceRoot)
  const rootReal = existsSync(rootAbs) ? tryRealpath(rootAbs) : rootAbs
  const logical = isAbsolute(targetPath) ? resolve(targetPath) : resolve(rootAbs, targetPath)

  let rel = relative(rootAbs, logical)
  let linkLogical = logical
  if (isEscapingRelative(rel)) {
    const relToReal = relative(rootReal, logical)
    if (isEscapingRelative(relToReal)) {
      throw new Error('Path is outside workspace')
    }
    linkLogical = join(rootReal, ...relToReal.split(sep))
    rel = relToReal
  }

  try {
    const st = lstatSync(linkLogical)
    if (st.isSymbolicLink()) {
      const parent = dirname(linkLogical)
      const parentReal = existsSync(parent) ? tryRealpath(parent) : parent
      if (!isPathInsideRoot(rootReal, parentReal)) {
        throw new Error('Path is outside workspace')
      }
      return linkLogical
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('outside workspace')) throw err
    // ENOENT — fall through
  }

  if (!existsSync(linkLogical)) {
    // Not a link and missing — let resolveWithinWorkspace produce a clear error path
    return resolveWithinWorkspace(workspaceRoot, targetPath)
  }

  return resolveWithinWorkspace(workspaceRoot, targetPath)
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
