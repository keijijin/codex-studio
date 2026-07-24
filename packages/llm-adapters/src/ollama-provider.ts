import type {
  AgentChatOptions,
  AgentMessage,
  AgentStreamChunk,
  ChatMessage,
  ChatOptions,
  LLMProvider,
  StreamChunk,
  ToolCall,
} from './types'
import { parseToolArguments } from './types'
import { toOpenAIMessages } from './openai-messages'
import { createOpenAIClient } from './create-clients'

export const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434'

function createClient(options: { apiKey: string; baseUrl?: string }) {
  const base = (options.baseUrl ?? DEFAULT_OLLAMA_BASE_URL).replace(/\/$/, '')
  return createOpenAIClient({
    apiKey: options.apiKey || 'ollama',
    baseURL: `${base}/v1`,
  })
}

export class OllamaProvider implements LLMProvider {
  id = 'ollama' as const

  async *chat(messages: ChatMessage[], options: ChatOptions): AsyncGenerator<StreamChunk> {
    const client = createClient(options)

    try {
      const stream = await client.chat.completions.create({
        model: options.model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        stream: true,
        ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
      }, { signal: options.signal })

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content
        if (delta) yield { type: 'text', delta }
      }
      yield { type: 'done' }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown LLM error'
      yield { type: 'error', error: options.signal?.aborted ? 'Cancelled' : message }
    }
  }

  async *agentChat(
    messages: AgentMessage[],
    options: AgentChatOptions,
  ): AsyncGenerator<AgentStreamChunk> {
    const client = createClient(options)

    try {
      const stream = await client.chat.completions.create({
        model: options.model,
        messages: toOpenAIMessages(messages),
        tools: options.tools.map((t) => ({
          type: 'function' as const,
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        })),
        tool_choice: 'auto',
        stream: true,
      }, { signal: options.signal })

      const pending: Record<number, { id: string; name: string; arguments: string }> = {}
      let yieldedTools = false

      for await (const chunk of stream) {
        const choice = chunk.choices[0]
        const delta = choice?.delta

        if (delta?.content) {
          yield { type: 'text', delta: delta.content }
        }

        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0
            if (!pending[idx]) {
              pending[idx] = { id: '', name: '', arguments: '' }
            }
            if (tc.id) pending[idx].id = tc.id
            if (tc.function?.name) pending[idx].name = tc.function.name
            if (tc.function?.arguments) pending[idx].arguments += tc.function.arguments
          }
        }

        if (choice?.finish_reason === 'tool_calls') {
          const calls: ToolCall[] = Object.values(pending)
            .filter((p) => p.id && p.name)
            .map((p) => ({
              id: p.id,
              name: p.name,
              arguments: parseToolArguments(p.arguments),
            }))
          if (calls.length > 0) {
            yieldedTools = true
            yield { type: 'tool_calls', calls }
          }
        }
      }

      if (!yieldedTools && Object.keys(pending).length > 0) {
        const calls: ToolCall[] = Object.values(pending)
          .filter((p) => p.id && p.name)
          .map((p) => ({
            id: p.id,
            name: p.name,
            arguments: parseToolArguments(p.arguments),
          }))
        if (calls.length > 0) {
          yield { type: 'tool_calls', calls }
        }
      }

      yield { type: 'done' }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown LLM error'
      yield { type: 'error', error: options.signal?.aborted ? 'Cancelled' : message }
    }
  }
}

export const ollamaProvider = new OllamaProvider()
