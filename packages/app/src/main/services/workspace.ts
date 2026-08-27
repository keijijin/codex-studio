import { createHash } from 'crypto'
import { realpath, readdir, readFile, stat, writeFile } from 'fs/promises'
import { basename, dirname, join, relative, resolve } from 'path'
import type { FileNode, PathIgnore, Workspace } from '@codex/shared'
import { createDefaultPathIgnore, isPathInsideRoot } from '@codex/shared'
import { pathIgnoreService } from './path-ignore-service'

export function workspaceIdFromPath(resolvedPath: string): string {
  return createHash('sha256').update(resolvedPath).digest('hex').slice(0, 24)
}

/** Normalize folder path for stable per-workspace session keys. */
export async function normalizeWorkspaceRoot(path: string): Promise<string> {
  const resolved = resolve(path)
  try {
    return await realpath(resolved)
  } catch {
    return resolved
  }
}

export class WorkspaceService {
  private workspace: Workspace | null = null

  get(): Workspace | null {
    return this.workspace
  }

  getRoot(): string | null {
    return this.workspace?.rootPaths[0] ?? null
  }

  getRoots(): string[] {
    return this.workspace?.rootPaths ?? []
  }

  async open(path: string): Promise<Workspace> {
    const resolved = await normalizeWorkspaceRoot(path)
    const stats = await stat(resolved)
    if (!stats.isDirectory()) {
      throw new Error('Path is not a directory')
    }

    this.workspace = {
      id: workspaceIdFromPath(resolved),
      rootPaths: [resolved],
      name: resolved.split(/[/\\]/).filter(Boolean).pop() ?? resolved,
      openedAt: new Date().toISOString(),
    }

    await pathIgnoreService.reload(resolved)
    return this.workspace
  }

  /** Add another folder root to the current workspace (N4-3). */
  async addRoot(path: string): Promise<Workspace> {
    if (!this.workspace) {
      return this.open(path)
    }
    const resolved = await normalizeWorkspaceRoot(path)
    const stats = await stat(resolved)
    if (!stats.isDirectory()) {
      throw new Error('Path is not a directory')
    }
    if (this.workspace.rootPaths.some((r) => r === resolved)) {
      return this.workspace
    }
    const name = resolved.split(/[/\\]/).filter(Boolean).pop() ?? resolved
    this.workspace = {
      ...this.workspace,
      rootPaths: [...this.workspace.rootPaths, resolved],
      name:
        this.workspace.rootPaths.length === 1
          ? `${this.workspace.name} + ${name}`
          : `${this.workspace.name.split(' + ')[0]} +${this.workspace.rootPaths.length}`,
    }
    return this.workspace
  }

  close(): void {
    this.workspace = null
  }

  resolveWithinWorkspace(targetPath: string): string {
    const roots = this.getRoots()
    if (!roots.length) {
      throw new Error('No workspace open')
    }

    const resolved = resolve(targetPath)
    for (const root of roots) {
      const normalizedRoot = resolve(root)
      if (isPathInsideRoot(normalizedRoot, resolved)) {
        return resolved
      }
    }

    // Relative path: try each root
    for (const root of roots) {
      const normalizedRoot = resolve(root)
      const relativeResolved = resolve(normalizedRoot, targetPath)
      if (isPathInsideRoot(normalizedRoot, relativeResolved)) {
        return relativeResolved
      }
    }

    throw new Error('Path is outside workspace')
  }

  /** Resolve a markdown href to an absolute path inside the workspace. */
  resolveMarkdownLink(href: string, baseFilePath?: string): string {
    const root = this.getRoot()
    if (!root) {
      throw new Error('No workspace open')
    }

    const normalizedRoot = resolve(root)
    let target = href.trim()

    if (target.startsWith('file:')) {
      try {
        target = decodeURIComponent(new URL(target).pathname)
      } catch {
        target = target.replace(/^file:\/\//, '')
      }
    }

    const hashIndex = target.indexOf('#')
    if (hashIndex >= 0) {
      target = target.slice(0, hashIndex)
    }
    if (target === '') {
      throw new Error('Not a workspace file link')
    }

    let resolved: string
    if (target.startsWith('/')) {
      resolved = resolve(target)
    } else if (baseFilePath) {
      resolved = resolve(dirname(baseFilePath), target)
    } else {
      resolved = resolve(normalizedRoot, target)
    }

    if (!isPathInsideRoot(normalizedRoot, resolved)) {
      throw new Error('Path is outside workspace')
    }
    return resolved
  }

  async getFileTree(): Promise<FileNode[]> {
    const roots = this.getRoots()
    if (!roots.length) {
      return []
    }
    const rules = pathIgnoreService.getRules()
    if (roots.length === 1) {
      return this.buildTree(roots[0]!, roots[0]!, 0, new Set(), rules)
    }
    const nodes: FileNode[] = []
    for (const root of roots) {
      const name = root.split(/[/\\]/).filter(Boolean).pop() ?? root
      const children = await this.buildTree(root, root, 0, new Set(), rules)
      nodes.push({ name, path: root, type: 'directory', children })
    }
    return nodes
  }

  private async buildTree(
    root: string,
    dirPath: string,
    depth: number,
    visited: Set<string>,
    rules: PathIgnore,
  ): Promise<FileNode[]> {
    if (depth > 256) {
      return []
    }

    let realDir: string
    try {
      realDir = await realpath(dirPath)
    } catch {
      realDir = resolve(dirPath)
    }
    if (visited.has(realDir)) {
      return []
    }
    visited.add(realDir)

    let entries: string[]
    try {
      entries = await readdir(dirPath)
    } catch {
      return []
    }

    entries.sort((a, b) => a.localeCompare(b))

    const nodes: FileNode[] = []

    for (const entry of entries) {
      const fullPath = join(dirPath, entry)
      const rel = relative(root, fullPath)
      if (rules.ignores(rel)) continue

      let entryStat
      try {
        entryStat = await stat(fullPath)
      } catch {
        continue
      }

      if (entryStat.isDirectory()) {
        if (rules.isShallowDirectory(entry, rel)) {
          nodes.push({
            name: entry,
            path: fullPath,
            type: 'directory',
            children: await this.buildShallowListing(root, fullPath, rules),
          })
          continue
        }
        const children = await this.buildTree(root, fullPath, depth + 1, visited, rules)
        nodes.push({
          name: entry,
          path: fullPath,
          type: 'directory',
          children,
        })
      } else if (entryStat.isFile()) {
        nodes.push({
          name: entry,
          path: fullPath,
          type: 'file',
        })
      }
    }

    return nodes.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1
      }
      return a.name.localeCompare(b.name)
    })
  }

  /** One level only: files + empty directory stubs (no nested walk). */
  private async buildShallowListing(
    root: string,
    dirPath: string,
    rules: PathIgnore,
  ): Promise<FileNode[]> {
    let entries: string[]
    try {
      entries = await readdir(dirPath)
    } catch {
      return []
    }
    entries.sort((a, b) => a.localeCompare(b))
    const nodes: FileNode[] = []
    for (const entry of entries) {
      const fullPath = join(dirPath, entry)
      const rel = relative(root, fullPath)
      if (rules.ignores(rel)) continue
      let entryStat
      try {
        entryStat = await stat(fullPath)
      } catch {
        continue
      }
      if (entryStat.isDirectory()) {
        nodes.push({ name: entry, path: fullPath, type: 'directory', children: [] })
      } else if (entryStat.isFile()) {
        nodes.push({ name: entry, path: fullPath, type: 'file' })
      }
    }
    return nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }

  async readFile(path: string): Promise<string> {
    const resolved = this.resolveWithinWorkspace(path)
    return readFile(resolved, 'utf-8')
  }

  async writeFile(path: string, content: string): Promise<void> {
    const resolved = this.resolveWithinWorkspace(path)
    await writeFile(resolved, content, 'utf-8')
  }

  getRelativePath(absolutePath: string): string {
    const roots = this.getRoots()
    if (!roots.length) return absolutePath
    for (const root of roots) {
      const rel = relative(root, absolutePath)
      if (rel && !rel.startsWith('..') && !rel.startsWith('/')) {
        return roots.length > 1
          ? `${basename(root)}/${rel}`.replace(/\\/g, '/')
          : rel.replace(/\\/g, '/')
      }
      if (absolutePath === root) {
        return roots.length > 1 ? basename(root) : '.'
      }
    }
    return relative(roots[0]!, absolutePath)
  }
}

export const workspaceService = new WorkspaceService()

/** Test helper — build ignore without opening a workspace. */
export function pathIgnoreForTests(
  gitignoreContent: string,
  showBuildOutputs = false,
): PathIgnore {
  return createDefaultPathIgnore({ gitignoreContent, showBuildOutputs })
}
