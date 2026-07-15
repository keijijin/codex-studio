import { readdir, stat } from 'fs/promises'
import { join, relative } from 'path'
import type { IndexStatus, SearchResult } from '@codex/shared'
import { searchInFiles, searchWithRipgrep } from './ripgrep'

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'out',
  'release',
  '.codex-studio',
])

const MAX_FILE_SIZE = 512 * 1024
const PROGRESS_EVERY = 200
const MAX_CONCURRENT_DIRS = 32

interface IndexedFile {
  path: string
  relativePath: string
  size: number
  mtime: number
}

export class IndexService {
  private rootPath: string | null = null
  private files: IndexedFile[] = []
  private status: IndexStatus = {
    state: 'idle',
    totalFiles: 0,
    indexedFiles: 0,
  }
  private onProgress?: (status: IndexStatus) => void

  setProgressCallback(cb: (status: IndexStatus) => void): void {
    this.onProgress = cb
  }

  getStatus(): IndexStatus {
    return { ...this.status }
  }

  getFiles(): IndexedFile[] {
    return this.files
  }

  async scan(rootPath: string): Promise<void> {
    this.rootPath = rootPath
    this.files = []
    this.status = { state: 'indexing', totalFiles: 0, indexedFiles: 0 }
    this.emitProgress()

    try {
      await this.walkDirectory(rootPath, rootPath)
      this.status = {
        state: 'ready',
        totalFiles: this.files.length,
        indexedFiles: this.files.length,
      }
    } catch (err) {
      this.status = {
        state: 'error',
        totalFiles: 0,
        indexedFiles: 0,
        message: err instanceof Error ? err.message : 'Index failed',
      }
    }
    this.emitProgress()
  }

  reset(): void {
    this.rootPath = null
    this.files = []
    this.status = { state: 'idle', totalFiles: 0, indexedFiles: 0 }
  }

  async upsertFile(rootPath: string, filePath: string): Promise<void> {
    if (this.rootPath !== rootPath) {
      return
    }

    let fileStat
    try {
      fileStat = await stat(filePath)
    } catch {
      this.removeFile(filePath)
      return
    }

    if (!fileStat.isFile() || fileStat.size > MAX_FILE_SIZE) {
      this.removeFile(filePath)
      return
    }

    const indexed: IndexedFile = {
      path: filePath,
      relativePath: relative(rootPath, filePath),
      size: fileStat.size,
      mtime: fileStat.mtimeMs,
    }

    const existingIndex = this.files.findIndex((file) => file.path === filePath)
    if (existingIndex >= 0) {
      this.files[existingIndex] = indexed
    } else {
      this.files.push(indexed)
    }

    this.status = {
      state: 'ready',
      totalFiles: this.files.length,
      indexedFiles: this.files.length,
    }
    this.emitProgress()
  }

  removeFile(filePath: string): void {
    const nextLength = this.files.length
    this.files = this.files.filter((file) => file.path !== filePath)
    if (this.files.length === nextLength) {
      return
    }

    this.status = {
      state: this.rootPath ? 'ready' : 'idle',
      totalFiles: this.files.length,
      indexedFiles: this.files.length,
    }
    this.emitProgress()
  }

  async search(query: string): Promise<SearchResult[]> {
    if (!this.rootPath || !query.trim()) {
      return []
    }

    const q = query.trim()
    const rgResults = await searchWithRipgrep(this.rootPath, q)
    if (rgResults.length > 0) return rgResults

    return searchInFiles(this.rootPath, q, this.files)
  }

  private async walkDirectory(root: string, dirPath: string): Promise<void> {
    const queue: string[] = [dirPath]
    let active = 0

    await new Promise<void>((resolve, reject) => {
      const pump = () => {
        while (active < MAX_CONCURRENT_DIRS && queue.length > 0) {
          const next = queue.shift()
          if (!next) break
          active++
          void this.processDirectory(root, next)
            .then((subdirs) => {
              queue.push(...subdirs)
            })
            .catch(reject)
            .finally(() => {
              active--
              if (queue.length === 0 && active === 0) {
                resolve()
              } else {
                pump()
              }
            })
        }
      }
      pump()
    })
  }

  private async processDirectory(root: string, dirPath: string): Promise<string[]> {
    let entries: string[]
    try {
      entries = await readdir(dirPath)
    } catch {
      return []
    }

    const subdirs: string[] = []

    for (const entry of entries) {
      const fullPath = join(dirPath, entry)
      let entryStat
      try {
        entryStat = await stat(fullPath)
      } catch {
        continue
      }

      if (entryStat.isDirectory()) {
        if (!IGNORED_DIRS.has(entry)) {
          subdirs.push(fullPath)
        }
      } else if (entryStat.isFile() && entryStat.size <= MAX_FILE_SIZE) {
        this.files.push({
          path: fullPath,
          relativePath: relative(root, fullPath),
          size: entryStat.size,
          mtime: entryStat.mtimeMs,
        })
        if (this.files.length % PROGRESS_EVERY === 0) {
          this.status = {
            state: 'indexing',
            totalFiles: this.files.length,
            indexedFiles: this.files.length,
          }
          this.emitProgress()
        }
      }
    }

    return subdirs
  }

  private emitProgress(): void {
    this.onProgress?.({ ...this.status })
  }
}

export const indexService = new IndexService()
