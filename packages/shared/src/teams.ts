/** Local Agent Teams (Phase D) — file-driven roles + shared board. */

import type { CeoApprovalDecision, TeamPipelineStage } from './ceo-approval'

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
  /** Optional Persona to inject (`.codex/personas/<name>.md`) */
  persona?: string
  /** When true, runs after other roles to merge the board (CEO / lead) */
  synthesize?: boolean
  /**
   * When true, runs after CEO approval to implement the decision.
   * May use Write / StrReplace / Shell (subject to tool approvals).
   */
  execute?: boolean
}

export interface TeamPipelineConfig {
  /**
   * After synthesize, show human CEO approval UI before execute.
   * Default false for simple teams; virtual-company enables this.
   */
  requireCeoApproval?: boolean
  /** Run execute role(s) after approve / conditional */
  executeAfterApprove?: boolean
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
  pipeline?: TeamPipelineConfig
}

export interface TeamRunResult {
  teamId: string
  success: boolean
  boardPath: string
  roleReports: Array<{ roleId: string; success: boolean; output: string }>
  synthesis: string
  execution?: string
  ceoDecision?: CeoApprovalDecision
  stagesCompleted?: TeamPipelineStage[]
  error?: string
}
