import {
  DEFAULT_OLLAMA_BASE_URL,
  type AppSettings,
  type LLMProviderId,
} from '@codex/shared'
import { getProviderForModel, providerDisplayName } from '@codex/llm-adapters'

export interface LlmRuntimeConfig {
  provider: LLMProviderId
  apiKey: string
  baseUrl?: string
  model: string
  displayName: string
}

export function resolveProvider(settings: AppSettings): LLMProviderId {
  return settings.models.defaultProvider ?? getProviderForModel(settings.models.defaultChatModel)
}

export function getApiKeyForProvider(
  provider: LLMProviderId,
  models: AppSettings['models'],
): string | undefined {
  if (provider === 'ollama') {
    return 'ollama'
  }
  if (provider === 'anthropic') {
    return models.anthropicApiKey || process.env.ANTHROPIC_API_KEY
  }
  return models.openaiApiKey || process.env.OPENAI_API_KEY
}

export function getLlmRuntimeConfig(settings: AppSettings, mode: 'chat' | 'agent' = 'chat'): LlmRuntimeConfig {
  const provider = resolveProvider(settings)
  const apiKey = getApiKeyForProvider(provider, settings.models)
  const baseUrl = provider === 'ollama'
    ? modelsOllamaBaseUrl(settings.models)
    : undefined
  const model = mode === 'agent'
    ? settings.models.defaultAgentModel || settings.models.defaultChatModel
    : settings.models.defaultChatModel

  return {
    provider,
    apiKey: apiKey ?? '',
    baseUrl,
    model,
    displayName: providerDisplayName(provider),
  }
}

function modelsOllamaBaseUrl(models: AppSettings['models']): string {
  return models.ollamaBaseUrl || process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE_URL
}

export function missingApiKeyMessage(provider: LLMProviderId): string {
  if (provider === 'ollama') {
    return 'Ollama に接続できません。Ollama が起動しているか、設定の Base URL を確認してください。'
  }
  return `${providerDisplayName(provider)} API キーが設定されていません。設定画面から登録してください。`
}
