export type RuleSource = 'workspace-codex' | 'workspace-cursor' | 'global'

export interface RuleMeta {
  alwaysApply: boolean
  globs: string[]
  description?: string
}

export interface RuleFile {
  /** Stable id = absolute path */
  id: string
  name: string
  source: RuleSource
  absolutePath: string
  /** Relative display path within its rules directory */
  relativePath: string
  content: string
  raw: string
  meta: RuleMeta
  editable: boolean
}

export interface RuleSaveParams {
  /** File name without path, e.g. typescript.md */
  name: string
  content: string
  alwaysApply: boolean
  globs: string[]
  description?: string
  scope: 'workspace' | 'global'
  /** When updating an existing rule */
  absolutePath?: string
}
