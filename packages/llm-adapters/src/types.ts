import type { ToolDefinition } from '@codex/tools'

export type LLMProviderId = 'openai' | 'anthropic' | 'ollama' | 'xai'

export interface ModelInfo {
  id: string
  name: string
  provider: LLMProviderId
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatOptions {
  model: string
  apiKey: string
  baseUrl?: string
  signal?: AbortSignal
  /** Cap completion tokens (provider-dependent) */
  maxTokens?: number
  /** Enable prompt caching when the provider supports it */
  enablePromptCache?: boolean
}

export interface LlmUsage {
  inputTokens: number
  outputTokens: number
  cachedInputTokens: number
}

export type StreamChunk =
  | { type: 'text'; delta: string }
  | { type: 'done'; usage?: LlmUsage }
  | { type: 'error'; error: string }

export interface ToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export interface AgentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: ToolCall[]
  tool_call_id?: string
}

export interface AgentChatOptions {
  model: string
  apiKey: string
  baseUrl?: string
  tools: ToolDefinition[]
  signal?: AbortSignal
  maxTokens?: number
  enablePromptCache?: boolean
}

export type AgentStreamChunk =
  | { type: 'text'; delta: string }
  | { type: 'tool_calls'; calls: ToolCall[] }
  | { type: 'done'; usage?: LlmUsage }
  | { type: 'error'; error: string }

export interface LLMProvider {
  id: LLMProviderId
  chat(messages: ChatMessage[], options: ChatOptions): AsyncGenerator<StreamChunk>
  agentChat(messages: AgentMessage[], options: AgentChatOptions): AsyncGenerator<AgentStreamChunk>
}

export function parseToolArguments(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return {}
  }
}

export function emptyUsage(): LlmUsage {
  return { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 }
}

export function addUsage(a: LlmUsage, b?: LlmUsage): LlmUsage {
  if (!b) return a
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cachedInputTokens: a.cachedInputTokens + b.cachedInputTokens,
  }
}
