import ignore, { type Ignore } from 'ignore'

/** Always skipped for tree / watch / index / glob (not optional). */
export const ALWAYS_IGNORED_DIR_NAMES = [
  'node_modules',
  '.git',
  '.codex-studio',
] as const

/**
 * Build / package outputs. Hidden from Explorer/index/watch/glob unless
 * `showBuildOutputs` is true (Explorer may still list them shallowly).
 */
export const BUILD_OUTPUT_DIR_NAMES = [
  'dist',
  'out',
  'release',
  'coverage',
  '.turbo',
  'playwright-report',
  'test-results',
] as const

export const ALWAYS_IGNORED_FILE_NAMES = ['.DS_Store'] as const

export interface PathIgnoreOptions {
  /** Raw `.gitignore` text (workspace root). */
  gitignoreContent?: string
  /**
   * When false (default), build output dir names are ignored everywhere.
   * When true, they are not gitignore-forced — caller may still treat them as shallow.
   */
  showBuildOutputs?: boolean
  /** Extra gitignore-style patterns */
  extraPatterns?: string[]
}

function toPosix(relPath: string): string {
  return relPath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '')
}

function basenamePosix(relPath: string): string {
  const posix = toPosix(relPath)
  const i = posix.lastIndexOf('/')
  return i === -1 ? posix : posix.slice(i + 1)
}

/**
 * Unified ignore rules for Explorer, watcher, indexer, and Glob.
 * Combines hard-coded defaults, optional build-output policy, and `.gitignore`.
 */
export class PathIgnore {
  private readonly ig: Ignore
  private readonly showBuildOutputs: boolean

  constructor(options: PathIgnoreOptions = {}) {
    this.showBuildOutputs = options.showBuildOutputs === true
    this.ig = ignore()

    this.ig.add([
      ...ALWAYS_IGNORED_DIR_NAMES.map((d) => d + '/'),
      ...ALWAYS_IGNORED_FILE_NAMES,
    ])

    if (!this.showBuildOutputs) {
      this.ig.add(BUILD_OUTPUT_DIR_NAMES.map((d) => d + '/'))
    }

    if (options.extraPatterns?.length) {
      this.ig.add(options.extraPatterns)
    }

    if (options.gitignoreContent?.trim()) {
      this.ig.add(options.gitignoreContent)
    }
  }

  /** Relative path from workspace root (file or directory). */
  ignores(relativePath: string): boolean {
    const posix = toPosix(relativePath)
    if (!posix || posix === '.') return false
    const base = basenamePosix(posix)
    if ((ALWAYS_IGNORED_FILE_NAMES as readonly string[]).includes(base)) return true
    if ((ALWAYS_IGNORED_DIR_NAMES as readonly string[]).includes(base)) return true
    if (
      !this.showBuildOutputs &&
      (BUILD_OUTPUT_DIR_NAMES as readonly string[]).includes(base)
    ) {
      return true
    }
    // Match both "foo" and "foo/" for directory-oriented patterns
    return this.ig.ignores(posix) || this.ig.ignores(posix + '/')
  }

  /**
   * Directory that may appear in Explorer but must not be fully recursed
   * (Electron .app bundles, build outputs when visible).
   */
  isShallowDirectory(name: string, relativePath?: string): boolean {
    if (name.endsWith('.app')) return true
    if ((BUILD_OUTPUT_DIR_NAMES as readonly string[]).includes(name)) {
      return this.showBuildOutputs
    }
    if (relativePath) {
      const base = basenamePosix(relativePath)
      if ((BUILD_OUTPUT_DIR_NAMES as readonly string[]).includes(base)) {
        return this.showBuildOutputs
      }
    }
    return false
  }

  get showBuildOutputsEnabled(): boolean {
    return this.showBuildOutputs
  }
}

export function createDefaultPathIgnore(
  options: PathIgnoreOptions = {},
): PathIgnore {
  return new PathIgnore(options)
}
