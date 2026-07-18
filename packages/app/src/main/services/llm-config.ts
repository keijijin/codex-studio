import {
  DEFAULT_OLLAMA_BASE_URL,
  migrateModelId,
  normalizeRoutingSettings,
  type AppSettings,
  type LLMProviderId,
  type ModelCandidate,
  type RoutingSettings,
} from '@codex/shared'
import {
  decideRouting,
  getProviderForModel,
  providerDisplayName,
  type RoutingDecision,
} from '@codex/llm-adapters'

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

export function getRoutingSettings(settings: AppSettings): RoutingSettings {
  return normalizeRoutingSettings(settings.routing)
}

export function getPrimaryCandidate(
  settings: AppSettings,
  mode: 'chat' | 'agent' = 'chat',
): ModelCandidate {
  const provider = resolveProvider(settings)
  const model = mode === 'agent'
    ? settings.models.defaultAgentModel || settings.models.defaultChatModel
    : settings.models.defaultChatModel
  return { provider, model: migrateModelId(model) }
}

export function runtimeFromCandidate(
  candidate: ModelCandidate,
  settings: AppSettings,
): LlmRuntimeConfig {
  const apiKey = getApiKeyForProvider(candidate.provider, settings.models)
  const baseUrl = candidate.provider === 'ollama'
    ? modelsOllamaBaseUrl(settings.models)
    : undefined
  return {
    provider: candidate.provider,
    apiKey: apiKey ?? '',
    baseUrl,
    model: migrateModelId(candidate.model),
    displayName: providerDisplayName(candidate.provider),
  }
}

export function isCandidateAvailable(
  candidate: ModelCandidate,
  settings: AppSettings,
): boolean {
  if (candidate.provider === 'ollama') return true
  return Boolean(getApiKeyForProvider(candidate.provider, settings.models))
}

export interface ResolveRoutingOptions {
  runMode: 'chat' | 'agent'
  prompt?: string
  isTeam?: boolean
  /** Override settings.routing.mode (e.g. CLI --routing). */
  modeOverride?: RoutingSettings['mode']
}

export function resolveRoutingDecision(
  settings: AppSettings,
  options: ResolveRoutingOptions,
): RoutingDecision {
  const routing = getRoutingSettings(settings)
  const primary = getPrimaryCandidate(settings, options.runMode)
  return decideRouting({
    mode: options.modeOverride ?? routing.mode,
    primary,
    fallbackChain: routing.fallbackChain,
    profiles: routing.profiles,
    maxAttempts: routing.maxAttempts,
    isAvailable: (c) => isCandidateAvailable(c, settings),
    prompt: options.prompt,
    runMode: options.runMode,
    isTeam: options.isTeam,
  })
}

export function getLlmRuntimeConfig(settings: AppSettings, mode: 'chat' | 'agent' = 'chat'): LlmRuntimeConfig {
  const decision = resolveRoutingDecision(settings, { runMode: mode })
  return runtimeFromCandidate(decision.selected, settings)
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
