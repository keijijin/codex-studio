import { existsSync, lstatSync } from 'fs'
import { mkdir, readFile, appendFile, writeFile, unlink } from 'fs/promises'
import { dirname } from 'path'
import { resolveUnlinkWithinWorkspace, resolveWithinWorkspace } from './resolve-path'

/**
 * Single entry for agent file I/O. All path resolution goes through
 * resolveWithinWorkspace / resolveUnlinkWithinWorkspace so tools cannot
 * accidentally write outside the workspace via raw `fs` calls.
 *
 * Migration target for Write / Delete / MemoryAppend / Team BOARD (S2).
 */
export class WorkspaceFs {
  constructor(private readonly roots: string[]) {
    if (!roots.length) {
      throw new Error('WorkspaceFs requires at least one workspace root')
    }
  }

  get primaryRoot(): string {
    return this.roots[0]!
  }

  /**
   * Resolve a path that must stay inside some workspace root.
   * Prefer a root where the path already exists (multi-root relative names).
   */
  resolve(targetPath: string): string {
    const errors: string[] = []
    let firstOk: string | undefined
    for (const root of this.roots) {
      try {
        const resolved = resolveWithinWorkspace(root, targetPath)
        if (!firstOk) firstOk = resolved
        if (existsSync(resolved)) return resolved
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err))
      }
    }
    if (firstOk) return firstOk
    throw new Error(errors[0] || 'Path is outside workspace')
  }

  /** Resolve for unlink: workspace symlinks (including dangling / escaping) map to the link node. */
  resolveUnlink(targetPath: string): string {
    const errors: string[] = []
    for (const root of this.roots) {
      try {
        const resolved = resolveUnlinkWithinWorkspace(root, targetPath)
        try {
          lstatSync(resolved)
          return resolved
        } catch {
          // not present on this root — try next
        }
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err))
      }
    }
    try {
      return this.resolve(targetPath)
    } catch {
      throw new Error(errors[0] || 'Path is outside workspace')
    }
  }

  async readText(targetPath: string): Promise<string> {
    return readFile(this.resolve(targetPath), 'utf-8')
  }

  async writeText(targetPath: string, content: string): Promise<string> {
    const resolved = this.resolve(targetPath)
    await mkdir(dirname(resolved), { recursive: true })
    await writeFile(resolved, content, 'utf-8')
    return resolved
  }

  async appendText(targetPath: string, content: string): Promise<string> {
    const resolved = this.resolve(targetPath)
    await mkdir(dirname(resolved), { recursive: true })
    await appendFile(resolved, content, 'utf-8')
    return resolved
  }

  async unlink(targetPath: string): Promise<string> {
    const resolved = this.resolveUnlink(targetPath)
    await unlink(resolved)
    return resolved
  }

  async mkdirp(targetPath: string): Promise<string> {
    const resolved = this.resolve(targetPath)
    await mkdir(resolved, { recursive: true })
    return resolved
  }

  /** lstat without following; returns null when the path does not exist. */
  lstat(targetPath: string): { isSymbolicLink: boolean } | null {
    const resolved = this.resolveUnlink(targetPath)
    try {
      const st = lstatSync(resolved)
      return { isSymbolicLink: st.isSymbolicLink() }
    } catch {
      return null
    }
  }
}

export function createWorkspaceFs(roots: string | string[]): WorkspaceFs {
  return new WorkspaceFs(Array.isArray(roots) ? roots : [roots])
}
