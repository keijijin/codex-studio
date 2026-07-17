/** Local Agent Teams (Phase D) — file-driven roles + shared board. */

export interface TeamRole {
  /** Stable id used in the board */
  id: string
  /** Display name */
  name: string
  /** Role mission for the subagent */
  goal: string
  /** Allowed tools (default: Read, Grep, Glob) */
  tools?: string[]
  /** Optional Skill to inject (`/name` body) */
  skill?: string
  /** When true, runs after other roles to merge the board */
  synthesize?: boolean
}

export interface TeamDefinition {
  id: string
  name: string
  description: string
  absolutePath: string
  relativePath: string
  roles: TeamRole[]
  /** Relative path to shared board (default: BOARD.md next to team.json) */
  boardRelativePath: string
}

export interface TeamRunResult {
  teamId: string
  success: boolean
  boardPath: string
  roleReports: Array<{ roleId: string; success: boolean; output: string }>
  synthesis: string
  error?: string
}
