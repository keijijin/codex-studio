import type OpenAI from 'openai'
import type { AgentMessage } from './types'

export function toOpenAIMessages(messages: AgentMessage[]): OpenAI.Chat.ChatCompletionMessageParam[] {
  return messages.map((m) => {
    if (m.role === 'tool') {
      return {
        role: 'tool' as const,
        tool_call_id: m.tool_call_id ?? '',
        content: m.content,
      }
    }
    if (m.role === 'assistant' && m.tool_calls?.length) {
      return {
        role: 'assistant' as const,
        content: m.content || null,
        tool_calls: m.tool_calls.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments),
          },
        })),
      }
    }
    return {
      role: m.role as 'system' | 'user' | 'assistant',
      content: m.content,
    }
  })
}
