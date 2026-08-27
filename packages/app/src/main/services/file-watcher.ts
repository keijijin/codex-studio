import { stat } from 'fs/promises'
import { basename, relative } from 'path'
import type { FSWatcher } from 'chokidar'
import chokidar from 'chokidar'
import { BrowserWindow } from 'electron'
import { IPC_EVENTS, type PathIgnore } from '@codex/shared'
import { indexService } from '@codex/indexer'
import { workspaceService } from './workspace'
import { pathIgnoreService } from './path-ignore-service'

function broadcastTreeChanged(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC_EVENTS.WORKSPACE_TREE_CHANGED)
  }
}

function broadcastFileChanged(path: string, relativePath: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC_EVENTS.FILE_CHANGED, { path, relativePath })
  }
}

export class FileWatcherService {
  private watchers: FSWatcher[] = []
  /** Suppresses editor echo (FILE_CHANGED) only — tree refresh always runs. */
  private suppressFileChangedUntil = new Map<string, number>()
  private treeRefreshTimer: ReturnType<typeof setTimeout> | null = null
  private rootPaths: string[] = []
  /** Indexing rules: always hide build outputs. */
  private indexRules: PathIgnore | null = null
  private semanticTimer: ReturnType<typeof setTimeout> | null = null
  private pendingSemantic = new Set<string>()

  start(rootPath: string | string[]): void {
    this.stop()
    this.rootPaths = Array.isArray(rootPath) ? [...rootPath] : [rootPath]
    const primary = this.rootPaths[0]
    if (!primary) return

    void pathIgnoreService.reloadForIndexing(primary).then((rules) => {
      this.indexRules = rules
    })

    for (const root of this.rootPaths) {
      this.attachWatcher(root)
    }
  }

  /** Watch an additional multi-root folder without restarting others. */
  addRoot(rootPath: string): void {
    if (this.rootPaths.includes(rootPath)) return
    this.rootPaths.push(rootPath)
    this.attachWatcher(rootPath)
  }

  stop(): void {
    if (this.treeRefreshTimer) {
      clearTimeout(this.treeRefreshTimer)
      this.treeRefreshTimer = null
    }
    if (this.semanticTimer) {
      clearTimeout(this.semanticTimer)
      this.semanticTimer = null
    }
    this.pendingSemantic.clear()
    for (const w of this.watchers) {
      void w.close()
    }
    this.watchers = []
    this.suppressFileChangedUntil.clear()
    this.rootPaths = []
    this.indexRules = null
  }

  /** Skip reloading the open editor tab for our own write (1s). Tree still updates. */
  markInternalWrite(path: string): void {
    this.suppressFileChangedUntil.set(path, Date.now() + 1000)
  }

  /** Debounced push so Explorer re-fetches the full tree. */
  notifyTreeChanged(): void {
    this.scheduleTreeRefresh()
  }

  /** Call after settings / .gitignore change. */
  async reloadIgnoreRules(): Promise<void> {
    const primary = this.rootPaths[0]
    if (!primary) return
    this.indexRules = await pathIgnoreService.reloadForIndexing(primary)
  }

  private attachWatcher(rootPath: string): void {
    const watcher = chokidar.watch(rootPath, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 250, pollInterval: 100 },
      ignored: (path) => this.shouldIgnoreAbsolute(path, rootPath),
    })

    watcher.on('add', (path) => {
      void this.handleFileUpsert(path, rootPath)
    })
    watcher.on('change', (path) => {
      void this.handleFileUpsert(path, rootPath)
    })
    watcher.on('unlink', (path) => {
      void this.handleFileRemove(path)
    })
    watcher.on('addDir', () => {
      this.scheduleTreeRefresh()
    })
    watcher.on('unlinkDir', () => {
      this.scheduleTreeRefresh()
    })

    this.watchers.push(watcher)
  }

  private containingRoot(absolutePath: string): string | null {
    for (const root of this.rootPaths) {
      const rel = relative(root, absolutePath)
      if (rel && !rel.startsWith('..') && !rel.startsWith('/')) return root
      if (absolutePath === root) return root
    }
    return null
  }

  private shouldIgnoreAbsolute(absolutePath: string, rootHint?: string): boolean {
    const root = rootHint ?? this.containingRoot(absolutePath)
    if (!root) return false
    const rel = relative(root, absolutePath)
    if (!rel || rel.startsWith('..')) return false
    const rules = this.indexRules ?? pathIgnoreService.getRules()
    if (basename(absolutePath) === '.DS_Store') return true
    return rules.ignores(rel)
  }

  private isFileChangedSuppressed(path: string): boolean {
    const until = this.suppressFileChangedUntil.get(path)
    if (!until) return false
    if (Date.now() > until) {
      this.suppressFileChangedUntil.delete(path)
      return false
    }
    return true
  }

  private scheduleTreeRefresh(): void {
    if (this.treeRefreshTimer) {
      clearTimeout(this.treeRefreshTimer)
    }
    this.treeRefreshTimer = setTimeout(() => {
      this.treeRefreshTimer = null
      broadcastTreeChanged()
    }, 200)
  }

  private scheduleSemantic(path: string): void {
    this.pendingSemantic.add(path)
    if (this.semanticTimer) clearTimeout(this.semanticTimer)
    this.semanticTimer = setTimeout(() => {
      this.semanticTimer = null
      const paths = [...this.pendingSemantic]
      this.pendingSemantic.clear()
      void import('./semantic-index').then(({ indexFileForSemantic }) => {
        for (const p of paths) {
          void indexFileForSemantic(p).catch(() => {
            /* best-effort */
          })
        }
      })
    }, 800)
  }

  private async handleFileUpsert(path: string, rootPath: string): Promise<void> {
    if (this.shouldIgnoreAbsolute(path, rootPath)) {
      return
    }

    const skipFileChanged = this.isFileChangedSuppressed(path)

    let fileStat
    try {
      fileStat = await stat(path)
    } catch {
      return
    }

    if (!fileStat.isFile()) {
      this.scheduleTreeRefresh()
      return
    }

    await indexService.upsertFile(rootPath, path)
    this.scheduleSemantic(path)
    this.scheduleTreeRefresh()
    if (!skipFileChanged) {
      broadcastFileChanged(path, workspaceService.getRelativePath(path))
    }
  }

  private async handleFileRemove(path: string): Promise<void> {
    indexService.removeFile(path)
    void import('./semantic-index').then(({ removeSemanticFile }) => {
      removeSemanticFile(path)
    })
    this.scheduleTreeRefresh()
  }
}

export const fileWatcherService = new FileWatcherService()
