/** Git working-tree change as shown in Source Control. */
export interface GitChange {
  /** Path relative to git root (posix) */
  path: string
  absolutePath: string
  /** Index (staged) status letter, space if clean */
  index: string
  /** Working tree status letter, space if clean */
  workingTree: string
  staged: boolean
  unstaged: boolean
}

export interface GitStatusSnapshot {
  /** Absolute path to git work tree, or null if not a repo */
  root: string | null
  branch: string | null
  ahead: number
  behind: number
  isRepo: boolean
  changes: GitChange[]
  error?: string
}

export interface GitCommitResult {
  success: boolean
  message: string
  commit?: string
}
