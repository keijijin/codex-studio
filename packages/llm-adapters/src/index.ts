export * from './types'
export * from './openai-provider'
export * from './anthropic-provider'
export * from './ollama-provider'
export * from './models'
export * from './provider-utils'

export { openaiProvider } from './openai-provider'
export { anthropicProvider } from './anthropic-provider'
export { ollamaProvider, DEFAULT_OLLAMA_BASE_URL } from './ollama-provider'
export type { AgentMessage, ToolCall, AgentStreamChunk } from './types'

export function getProvider(id: 'openai' | 'anthropic' | 'ollama') {
  if (id === 'anthropic') {
    return import('./anthropic-provider').then((m) => m.anthropicProvider)
  }
  if (id === 'ollama') {
    return import('./ollama-provider').then((m) => m.ollamaProvider)
  }
  return import('./openai-provider').then((m) => m.openaiProvider)
}
