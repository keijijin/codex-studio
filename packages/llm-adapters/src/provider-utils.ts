import type { LLMProvider } from './types'
import { anthropicProvider } from './anthropic-provider'
import { ollamaProvider } from './ollama-provider'
import { openaiProvider } from './openai-provider'
import { xaiProvider } from './xai-provider'
import type { LLMProviderId } from './types'

export function getProviderInstance(id: LLMProviderId): LLMProvider {
  switch (id) {
    case 'anthropic':
      return anthropicProvider
    case 'ollama':
      return ollamaProvider
    case 'xai':
      return xaiProvider
    default:
      return openaiProvider
  }
}

export function providerDisplayName(id: LLMProviderId): string {
  switch (id) {
    case 'anthropic':
      return 'Anthropic'
    case 'ollama':
      return 'Ollama'
    case 'xai':
      return 'xAI (Grok)'
    default:
      return 'OpenAI'
  }
}
