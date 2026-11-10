import type {
  AgentChatOptions,
  AgentMessage,
  AgentStreamChunk,
  ChatMessage,
  ChatOptions,
  LLMProvider,
  LlmUsage,
  StreamChunk,
  ToolCall,
} from './types'
import { parseToolArguments } from './types'
import { toOpenAIMessages } from './openai-messages'
import { createOpenAIClient } from './create-clients'
import { usageFromOpenAIChunk } from './usage-utils'

/** Default llama-server OpenAI-compatible endpoint. */
export const DEFAULT_LLAMACPP_BASE_URL = 'http://127.0.0.1:8080'

/** Fallback when /v1/models is unreachable. */
export const DEFAULT_LLAMACPP_MODEL = 'Qwen-AgentWorld-35B-A3B-UD-Q4_K_M.gguf'

type DeltaWithReasoning = {
  content?: string | null
  reasoning_content?: string | null
  tool_calls?: Array<{
    index?: number
    id?: string
    function?: { name?: string; arguments?: string }
  }>
}

function createClient(options: { apiKey: string; baseUrl?: string }) {
  const base = (options.baseUrl ?? DEFAULT_LLAMACPP_BASE_URL).replace(/\/$/, '')
  // llama-server serves OpenAI routes under /v1
  const baseURL = base.endsWith('/v1') ? base : `${base}/v1`
  return createOpenAIClient({
    apiKey: options.apiKey || 'llamacpp',
    baseURL,
  })
}

function textFromDelta(delta: DeltaWithReasoning | undefined): string | undefined {
  if (!delta) return undefined
  // Prefer final answer tokens; fall back to reasoning so the UI is not blank
  // while llama-server streams deepseek-style thinking (--reasoning-format).
  if (delta.content) return delta.content
  if (delta.reasoning_content) return delta.reasoning_content
  return undefined
}

export class LlamaCppProvider implements LLMProvider {
  id = 'llamacpp' as const

  async *chat(messages: ChatMessage[], options: ChatOptions): AsyncGenerator<StreamChunk> {
    const client = createClient(options)

    try {
      const stream = await client.chat.completions.create(
        {
          model: options.model,
          messages: messages.map((m) => ({
            role: m.role,
            content:
              typeof m.content === 'string'
                ? m.content
                : m.content
                    .map((p) => (p.type === 'text' ? p.text : '[image]'))
                    .join('\n'),
          })),
          stream: true,
          ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
        },
        { signal: options.signal },
      )

      let usage: LlmUsage | undefined
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta as DeltaWithReasoning | undefined
        const text = textFromDelta(delta)
        if (text) yield { type: 'text', delta: text }
        const chunkUsage = usageFromOpenAIChunk(chunk)
        if (chunkUsage) usage = chunkUsage
      }
      yield { type: 'done', usage }
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
      const stream = await client.chat.completions.create(
        {
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
          ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
        },
        { signal: options.signal },
      )

      const pending: Record<number, { id: string; name: string; arguments: string }> = {}
      let yieldedTools = false
      let yieldedText = false
      let reasoningBuf = ''
      let usage: LlmUsage | undefined

      for await (const chunk of stream) {
        const choice = chunk.choices[0]
        const delta = choice?.delta as DeltaWithReasoning | undefined
        const chunkUsage = usageFromOpenAIChunk(chunk)
        if (chunkUsage) usage = chunkUsage

        // Prefer final answer tokens. Keep reasoning aside — Qwen/AgentWorld with
        // --reasoning-format often fills max_tokens with thinking only; dumping it
        // into every turn would explode the next prefill, but ignoring it entirely
        // leaves the UI blank when content never arrives.
        if (delta?.reasoning_content) {
          reasoningBuf += delta.reasoning_content
        }
        if (delta?.content) {
          yieldedText = true
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
          yieldedTools = true
          yield { type: 'tool_calls', calls }
        }
      }

      // Fallback: model spent the whole budget on reasoning with no answer/tools.
      if (!yieldedText && !yieldedTools && reasoningBuf.trim()) {
        yield { type: 'text', delta: reasoningBuf }
      }

      yield { type: 'done', usage }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown LLM error'
      yield { type: 'error', error: options.signal?.aborted ? 'Cancelled' : message }
    }
  }
}

export const llamacppProvider = new LlamaCppProvider()
