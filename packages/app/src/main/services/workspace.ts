import { createHash } from 'crypto'
import { realpath, readdir, readFile, stat, writeFile } from 'fs/promises'
import { dirname, join, relative, resolve } from 'path'
import type { FileNode, Workspace } from '@codex/shared'

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

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'out',
  'release',
  '.codex-studio',
])

const IGNORED_FILES = new Set(['.DS_Store'])

export class WorkspaceService {
  private workspace: Workspace | null = null

  get(): Workspace | null {
    return this.workspace
  }

  getRoot(): string | null {
    return this.workspace?.rootPaths[0] ?? null
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
      name: resolved.split(/[/\\]/).pop() ?? resolved,
      openedAt: new Date().toISOString(),
    }

    return this.workspace
  }

  close(): void {
    this.workspace = null
  }

  resolveWithinWorkspace(targetPath: string): string {
    const root = this.getRoot()
    if (!root) {
      throw new Error('No workspace open')
    }

    const normalizedRoot = resolve(root)
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

    if (!resolved.startsWith(normalizedRoot)) {
      throw new Error('Path is outside workspace')
    }
    return resolved
  }

  async getFileTree(): Promise<FileNode[]> {
    const root = this.getRoot()
    if (!root) {
      return []
    }
    return this.buildTree(root, root, 0, new Set())
  }

  private async buildTree(
    root: string,
    dirPath: string,
    depth: number,
    visited: Set<string>,
  ): Promise<FileNode[]> {
    // Safety cap only (symlink loops / pathological trees). Do not treat
    // normal project depth as a hard UX limit — previously depth > 6 hid
    // everything past ~7 nested folders.
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
      if (IGNORED_FILES.has(entry)) continue

      const fullPath = join(dirPath, entry)
      let entryStat
      try {
        entryStat = await stat(fullPath)
      } catch {
        continue
      }

      if (entryStat.isDirectory()) {
        if (IGNORED_DIRS.has(entry)) continue
        const children = await this.buildTree(root, fullPath, depth + 1, visited)
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

    // Directories first, then files
    return nodes.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1
      }
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
    const root = this.getRoot()
    if (!root) return absolutePath
    return relative(root, absolutePath)
  }
}

export const workspaceService = new WorkspaceService()
