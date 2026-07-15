export interface ApprovalRequest {
  toolCallId: string
  tool: string
  path: string
  relativePath: string
  oldContent: string
  newContent: string
  summary: string
  action?: 'create' | 'overwrite' | 'replace' | 'delete' | 'shell'
}
