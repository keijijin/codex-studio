import type Anthropic from '@anthropic-ai/sdk'
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
import { createAnthropicClient } from './create-clients'

function toAnthropicMessages(messages: AgentMessage[]): {
  system: string
  messages: Anthropic.MessageParam[]
} {
  const system = messages.find((m) => m.role === 'system')?.content ?? ''
  const chatMessages: Anthropic.MessageParam[] = []
  const pendingToolResults: { tool_use_id: string; content: string }[] = []

  const flushToolResults = () => {
    if (pendingToolResults.length === 0) return
    chatMessages.push({
      role: 'user',
      content: pendingToolResults.map((r) => ({
        type: 'tool_result' as const,
        tool_use_id: r.tool_use_id,
        content: r.content,
      })),
    })
    pendingToolResults.length = 0
  }

  for (const m of messages) {
    if (m.role === 'system') continue

    if (m.role === 'tool') {
      pendingToolResults.push({
        tool_use_id: m.tool_call_id ?? '',
        content: m.content,
      })
      continue
    }

    flushToolResults()

    if (m.role === 'assistant' && m.tool_calls?.length) {
      const content: Anthropic.ContentBlockParam[] = []
      if (m.content) {
        content.push({ type: 'text', text: m.content })
      }
      for (const tc of m.tool_calls) {
        content.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.name,
          input: tc.arguments,
        })
      }
      chatMessages.push({ role: 'assistant', content })
      continue
    }

    chatMessages.push({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })
  }

  flushToolResults()

  return { system, messages: chatMessages }
}

function systemParam(
  system: string,
  enableCache: boolean,
): string | Anthropic.TextBlockParam[] | undefined {
  if (!system) return undefined
  if (!enableCache) return system
  return [
    {
      type: 'text',
      text: system,
      cache_control: { type: 'ephemeral' },
    },
  ]
}

/** Prefer accumulating: input from message_start, output from message_delta. */
function applyAnthropicUsageEvent(
  usage: LlmUsage,
  event: Anthropic.MessageStreamEvent,
): LlmUsage {
  if (event.type === 'message_start') {
    const u = event.message.usage
    return {
      inputTokens: u.input_tokens ?? 0,
      outputTokens: u.output_tokens ?? 0,
      cachedInputTokens: (u as { cache_read_input_tokens?: number }).cache_read_input_tokens ?? 0,
    }
  }
  if (event.type === 'message_delta' && event.usage) {
    return {
      inputTokens: usage.inputTokens,
      outputTokens: event.usage.output_tokens ?? usage.outputTokens,
      cachedInputTokens: usage.cachedInputTokens,
    }
  }
  return usage
}

export class AnthropicProvider implements LLMProvider {
  id = 'anthropic' as const

  async *chat(messages: ChatMessage[], options: ChatOptions): AsyncGenerator<StreamChunk> {
    const client = createAnthropicClient({ apiKey: options.apiKey })

    const system = messages.find((m) => m.role === 'system')?.content ?? ''
    const chatMessages = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }))
    const enableCache = options.enablePromptCache !== false

    try {
      const stream = await client.messages.create({
        model: options.model,
        max_tokens: options.maxTokens ?? 4096,
        system: systemParam(system, enableCache),
        messages: chatMessages,
        stream: true,
      }, { signal: options.signal })

      let usage: LlmUsage = { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 }
      for await (const event of stream) {
        usage = applyAnthropicUsageEvent(usage, event)
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield { type: 'text', delta: event.delta.text }
        }
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
    const client = createAnthropicClient({ apiKey: options.apiKey })
    const { system, messages: chatMessages } = toAnthropicMessages(messages)
    const enableCache = options.enablePromptCache !== false

    try {
      const stream = await client.messages.create({
        model: options.model,
        max_tokens: options.maxTokens ?? 8192,
        system: systemParam(system, enableCache),
        messages: chatMessages,
        tools: options.tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.parameters,
        })),
        stream: true,
      }, { signal: options.signal })

      const toolUses = new Map<number, { id: string; name: string; inputJson: string }>()
      let yieldedTools = false
      let usage: LlmUsage = { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 }

      for await (const event of stream) {
        usage = applyAnthropicUsageEvent(usage, event)

        if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
          toolUses.set(event.index, {
            id: event.content_block.id,
            name: event.content_block.name,
            inputJson: '',
          })
        }

        if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            yield { type: 'text', delta: event.delta.text }
          }
          if (event.delta.type === 'input_json_delta') {
            const current = toolUses.get(event.index)
            if (current) {
              current.inputJson += event.delta.partial_json
            }
          }
        }

        if (event.type === 'message_delta' && event.delta.stop_reason === 'tool_use') {
          const calls: ToolCall[] = [...toolUses.values()]
            .filter((t) => t.id && t.name)
            .map((t) => ({
              id: t.id,
              name: t.name,
              arguments: parseInputJson(t.inputJson),
            }))
          if (calls.length > 0) {
            yieldedTools = true
            yield { type: 'tool_calls', calls }
          }
        }
      }

      if (!yieldedTools && toolUses.size > 0) {
        const calls: ToolCall[] = [...toolUses.values()]
          .filter((t) => t.id && t.name)
          .map((t) => ({
          id: t.id,
          name: t.name,
          arguments: parseInputJson(t.inputJson),
        }))
        yield { type: 'tool_calls', calls }
      }

      yield { type: 'done', usage }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown LLM error'
      yield { type: 'error', error: options.signal?.aborted ? 'Cancelled' : message }
    }
  }
}

function parseInputJson(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw || '{}') as Record<string, unknown>
  } catch {
    return {}
  }
}

export const anthropicProvider = new AnthropicProvider()
