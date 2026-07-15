import { stat } from 'fs/promises'
import { basename, relative } from 'path'
import type { FSWatcher } from 'chokidar'
import chokidar from 'chokidar'
import { BrowserWindow } from 'electron'
import { IPC_EVENTS } from '@codex/shared'
import { indexService } from '@codex/indexer'
import { workspaceService } from './workspace'

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'out',
  'release',
  '.codex-studio',
])

const IGNORED_FILES = new Set(['.DS_Store'])

function shouldIgnorePath(absolutePath: string): boolean {
  const segments = absolutePath.split(/[/\\]/)
  if (segments.some((segment) => IGNORED_DIRS.has(segment))) {
    return true
  }
  return IGNORED_FILES.has(basename(absolutePath))
}

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
  private watcher: FSWatcher | null = null
  private suppressUntil = new Map<string, number>()
  private treeRefreshTimer: ReturnType<typeof setTimeout> | null = null

  start(rootPath: string): void {
    this.stop()

    this.watcher = chokidar.watch(rootPath, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 250, pollInterval: 100 },
      ignored: (path) => shouldIgnorePath(path),
    })

    this.watcher.on('add', (path) => {
      void this.handleFileUpsert(path, rootPath)
    })
    this.watcher.on('change', (path) => {
      void this.handleFileUpsert(path, rootPath)
    })
    this.watcher.on('unlink', (path) => {
      void this.handleFileRemove(path, rootPath)
    })
    this.watcher.on('addDir', () => {
      this.scheduleTreeRefresh()
    })
    this.watcher.on('unlinkDir', () => {
      this.scheduleTreeRefresh()
    })
  }

  stop(): void {
    if (this.treeRefreshTimer) {
      clearTimeout(this.treeRefreshTimer)
      this.treeRefreshTimer = null
    }
    void this.watcher?.close()
    this.watcher = null
    this.suppressUntil.clear()
  }

  markInternalWrite(path: string): void {
    this.suppressUntil.set(path, Date.now() + 1000)
  }

  private isSuppressed(path: string): boolean {
    const until = this.suppressUntil.get(path)
    if (!until) return false
    if (Date.now() > until) {
      this.suppressUntil.delete(path)
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

  private async handleFileUpsert(path: string, rootPath: string): Promise<void> {
    if (this.isSuppressed(path) || shouldIgnorePath(path)) {
      return
    }

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
    broadcastTreeChanged()
    broadcastFileChanged(path, workspaceService.getRelativePath(path))
  }

  private async handleFileRemove(path: string, _rootPath: string): Promise<void> {
    if (this.isSuppressed(path)) {
      return
    }

    indexService.removeFile(path)
    this.scheduleTreeRefresh()
  }
}

export const fileWatcherService = new FileWatcherService()
