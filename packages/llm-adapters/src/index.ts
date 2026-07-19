export * from './types'
export * from './openai-provider'
export * from './anthropic-provider'
export * from './ollama-provider'
export * from './xai-provider'
export * from './models'
export * from './provider-utils'
export * from './router'
export { enableSystemCaCertificates, getSystemCaFetch } from './system-ca-fetch'

export { openaiProvider } from './openai-provider'
export { anthropicProvider } from './anthropic-provider'
export { ollamaProvider, DEFAULT_OLLAMA_BASE_URL } from './ollama-provider'
export { xaiProvider, DEFAULT_XAI_BASE_URL, DEFAULT_XAI_MODEL } from './xai-provider'
export type { AgentMessage, ToolCall, AgentStreamChunk } from './types'

export function getProvider(id: 'openai' | 'anthropic' | 'ollama' | 'xai') {
  if (id === 'anthropic') {
    return import('./anthropic-provider').then((m) => m.anthropicProvider)
  }
  if (id === 'ollama') {
    return import('./ollama-provider').then((m) => m.ollamaProvider)
  }
  if (id === 'xai') {
    return import('./xai-provider').then((m) => m.xaiProvider)
  }
  return import('./openai-provider').then((m) => m.openaiProvider)
}
