import type { Attachment } from './types'

export interface SearchResult {
  path: string
  relativePath: string
  line: number
  column: number
  text: string
}

export interface ChatSendParams {
  sessionId: string
  content: string
  attachments?: Attachment[]
  mode?: 'ask' | 'agent'
  /** Open editor paths for Rules glob matching */
  contextPaths?: string[]
}

export type ChatStreamEvent =
  | { type: 'text_delta'; content: string }
  | { type: 'tool_call_start'; toolCallId: string; tool: string; args: unknown }
  | { type: 'tool_call_result'; toolCallId: string; tool: string; result: string; success: boolean; filePath?: string }
  | { type: 'approval_required'; toolCallId: string; tool: string; path: string; relativePath: string; oldContent: string; newContent: string; summary: string; action?: string }
  | { type: 'done'; messageId: string }
  | { type: 'error'; message: string }
