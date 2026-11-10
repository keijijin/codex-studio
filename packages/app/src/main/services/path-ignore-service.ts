import { readFile } from 'fs/promises'
import { join } from 'path'
import { PathIgnore, createDefaultPathIgnore } from '@codex/shared'
import { settingsService } from './settings'

/**
 * Workspace-scoped PathIgnore (`.gitignore` + build-output policy).
 * Reloaded on workspace open and when general.showBuildOutputs changes.
 */
class PathIgnoreService {
  private rules: PathIgnore = createDefaultPathIgnore()
  private root: string | null = null

  getRules(): PathIgnore {
    return this.rules
  }

  async reload(rootPath?: string | null): Promise<PathIgnore> {
    const root = rootPath ?? this.root
    this.root = root
    const showBuildOutputs = settingsService.get().general.showBuildOutputs === true

    let gitignoreContent = ''
    if (root) {
      try {
        gitignoreContent = await readFile(join(root, '.gitignore'), 'utf-8')
      } catch {
        gitignoreContent = ''
      }
    }

    this.rules = createDefaultPathIgnore({ gitignoreContent, showBuildOutputs })
    return this.rules
  }

  /** Watcher / index always hide build outputs even if Explorer shows them. */
  async reloadForIndexing(rootPath?: string | null): Promise<PathIgnore> {
    const root = rootPath ?? this.root
    let gitignoreContent = ''
    if (root) {
      try {
        gitignoreContent = await readFile(join(root, '.gitignore'), 'utf-8')
      } catch {
        gitignoreContent = ''
      }
    }
    return createDefaultPathIgnore({
      gitignoreContent,
      showBuildOutputs: false,
    })
  }
}

export const pathIgnoreService = new PathIgnoreService()
