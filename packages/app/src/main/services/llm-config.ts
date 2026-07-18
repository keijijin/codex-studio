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
import {
  getCachedOllamaAvailability,
  markOllamaAvailability,
  probeOllamaAvailable,
} from './ollama-availability'

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

export function modelsOllamaBaseUrl(models: AppSettings['models']): string {
  return models.ollamaBaseUrl || process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE_URL
}

/**
 * Sync availability: cloud providers need keys; Ollama uses probe cache.
 * Unknown Ollama status is treated as unavailable so we don't prefer a dead local server.
 */
export function isCandidateAvailable(
  candidate: ModelCandidate,
  settings: AppSettings,
): boolean {
  if (candidate.provider === 'ollama') {
    const cached = getCachedOllamaAvailability(modelsOllamaBaseUrl(settings.models))
    return cached === true
  }
  return Boolean(getApiKeyForProvider(candidate.provider, settings.models))
}

export async function isCandidateAvailableAsync(
  candidate: ModelCandidate,
  settings: AppSettings,
): Promise<boolean> {
  if (candidate.provider === 'ollama') {
    return probeOllamaAvailable(modelsOllamaBaseUrl(settings.models))
  }
  return Boolean(getApiKeyForProvider(candidate.provider, settings.models))
}

export interface ResolveRoutingOptions {
  runMode: 'chat' | 'agent'
  prompt?: string
  isTeam?: boolean
  /** Override settings.routing.mode (e.g. CLI --routing). */
  modeOverride?: RoutingSettings['mode']
}

function decideWithAvailability(
  settings: AppSettings,
  options: ResolveRoutingOptions,
  isAvailable: (c: ModelCandidate) => boolean,
): RoutingDecision {
  const routing = getRoutingSettings(settings)
  const primary = getPrimaryCandidate(settings, options.runMode)
  return decideRouting({
    mode: options.modeOverride ?? routing.mode,
    primary,
    fallbackChain: routing.fallbackChain,
    profiles: routing.profiles,
    maxAttempts: routing.maxAttempts,
    isAvailable,
    prompt: options.prompt,
    runMode: options.runMode,
    isTeam: options.isTeam,
  })
}

/** Sync routing using Ollama cache only (may skip Ollama until probed). */
export function resolveRoutingDecision(
  settings: AppSettings,
  options: ResolveRoutingOptions,
): RoutingDecision {
  return decideWithAvailability(settings, options, (c) => isCandidateAvailable(c, settings))
}

/** Probe Ollama when needed, then build the routing queue. */
export async function resolveRoutingDecisionAsync(
  settings: AppSettings,
  options: ResolveRoutingOptions,
): Promise<RoutingDecision> {
  const routing = getRoutingSettings(settings)
  const primary = getPrimaryCandidate(settings, options.runMode)
  const maybeNeedsOllama =
    primary.provider === 'ollama' ||
    routing.fallbackChain.some((c) => c.provider === 'ollama') ||
    routing.mode === 'auto'

  if (maybeNeedsOllama) {
    await probeOllamaAvailable(modelsOllamaBaseUrl(settings.models))
  }

  return decideWithAvailability(settings, options, (c) => isCandidateAvailable(c, settings))
}

export function getLlmRuntimeConfig(settings: AppSettings, mode: 'chat' | 'agent' = 'chat'): LlmRuntimeConfig {
  const decision = resolveRoutingDecision(settings, { runMode: mode })
  return runtimeFromCandidate(decision.selected, settings)
}

export function missingApiKeyMessage(provider: LLMProviderId): string {
  if (provider === 'ollama') {
    return 'Ollama に接続できません。Ollama が起動しているか、設定の Base URL を確認してください。'
  }
  return `${providerDisplayName(provider)} API キーが設定されていません。設定画面から登録してください。`
}

/** Map low-level SDK errors (e.g. "Connection error.") to actionable messages. */
export function formatLlmConnectionError(
  provider: LLMProviderId,
  error: unknown,
): string {
  const raw = error instanceof Error ? error.message : String(error ?? '')
  const message = raw.trim() || 'Unknown LLM error'
  const isConnection =
    /connection error/i.test(message) ||
    /fetch failed/i.test(message) ||
    /ECONNREFUSED/i.test(message) ||
    /ENOTFOUND/i.test(message) ||
    /certificate/i.test(message) ||
    /UNABLE_TO_VERIFY/i.test(message) ||
    /network/i.test(message) ||
    /接続できません/i.test(message) ||
    /への接続に失敗/i.test(message)

  if (!isConnection) return message

  if (provider === 'ollama') {
    return missingApiKeyMessage('ollama')
  }

  return (
    `${providerDisplayName(provider)} への接続に失敗しました。` +
    `ネットワーク / プロキシ / TLS 証明書、および API キーを確認してください。` +
    ` (詳細: ${message})`
  )
}

/** After a live connection failure, avoid retrying that endpoint immediately. */
export function noteProviderConnectionFailure(
  provider: LLMProviderId,
  settings: AppSettings,
): void {
  if (provider === 'ollama') {
    markOllamaAvailability(modelsOllamaBaseUrl(settings.models), false)
  }
}
