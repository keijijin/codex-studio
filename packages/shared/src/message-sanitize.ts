import type { ToolCallRecord } from './agent'
import type { Message } from './types'

/** Caps for persisted chat payload (M2-5). */
export const PERSIST_MAX_CONTENT_CHARS = 80_000
export const PERSIST_MAX_TOOL_RESULT_CHARS = 8_000

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  const suffix = '\n...(truncated for storage)'
  return `${text.slice(0, Math.max(0, max - suffix.length))}${suffix}`
}

function trimToolCalls(toolCalls: ToolCallRecord[] | undefined): ToolCallRecord[] | undefined {
  if (!toolCalls?.length) return toolCalls
  return toolCalls.map((tc) => {
    if (tc.result === undefined || tc.result.length <= PERSIST_MAX_TOOL_RESULT_CHARS) {
      return tc
    }
    return {
      ...tc,
      result: truncate(tc.result, PERSIST_MAX_TOOL_RESULT_CHARS),
    }
  })
}

/** Trim oversized content / tool results before writing to disk. */
export function sanitizeMessageForPersist<T extends Omit<Message, 'id' | 'createdAt'> | Message>(
  message: T,
): T {
  const content =
    message.content.length > PERSIST_MAX_CONTENT_CHARS
      ? truncate(message.content, PERSIST_MAX_CONTENT_CHARS)
      : message.content
  const toolCalls = trimToolCalls(message.toolCalls)
  return {
    ...message,
    content,
    ...(toolCalls ? { toolCalls } : {}),
  }
}
