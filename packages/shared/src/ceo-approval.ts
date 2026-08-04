/** CEO / human gate for multi-stage Agent Teams. */

export type CeoApprovalDecision = 'approve' | 'conditional' | 'reject' | 'defer'

export type TeamPipelineStage =
  | 'research'
  | 'decide'
  | 'await_approval'
  | 'execute'
  | 'done'
  | 'cancelled'

export interface CeoApprovalRequest {
  approvalId: string
  teamId: string
  teamName: string
  task: string
  /** CEO synthesizer output (decision brief) */
  decisionBrief: string
  boardPath: string
  boardRelativePath: string
  /** Heuristic label parsed from brief, if any */
  suggestedDecision?: CeoApprovalDecision
}

export interface CeoApprovalResponse {
  decision: CeoApprovalDecision
  /** Required for conditional; optional otherwise */
  note?: string
}
