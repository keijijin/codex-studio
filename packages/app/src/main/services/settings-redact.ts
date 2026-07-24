import {
  API_KEY_REDACTED,
  DEFAULT_COST_SETTINGS,
  DEFAULT_SETTINGS,
  isRedactedApiKey,
  type AppSettings,
} from '@codex/shared'

export function redactSettingsForRenderer(settings: AppSettings): AppSettings {
  return {
    ...settings,
    models: {
      ...settings.models,
      openaiApiKey: settings.models.openaiApiKey ? API_KEY_REDACTED : '',
      anthropicApiKey: settings.models.anthropicApiKey ? API_KEY_REDACTED : '',
      xaiApiKey: settings.models.xaiApiKey ? API_KEY_REDACTED : '',
    },
  }
}

function keepOrReplaceKey(current: string | undefined, incoming: string | undefined): string | undefined {
  if (incoming === undefined) return current
  if (incoming === '' || isRedactedApiKey(incoming)) return current
  return incoming
}

export function mergeSettingsPartial(
  current: AppSettings,
  partial: Partial<AppSettings>,
): AppSettings {
  const models = {
    ...current.models,
    ...partial.models,
    openaiApiKey: keepOrReplaceKey(current.models.openaiApiKey, partial.models?.openaiApiKey),
    anthropicApiKey: keepOrReplaceKey(
      current.models.anthropicApiKey,
      partial.models?.anthropicApiKey,
    ),
    xaiApiKey: keepOrReplaceKey(current.models.xaiApiKey, partial.models?.xaiApiKey),
  }

  const cost = {
    ...DEFAULT_COST_SETTINGS,
    ...current.cost,
    ...partial.cost,
  }
  cost.maxOutputTokens = Math.min(128_000, Math.max(256, Math.floor(cost.maxOutputTokens) || 4096))
  cost.maxOutputTokensAgent = Math.min(
    128_000,
    Math.max(256, Math.floor(cost.maxOutputTokensAgent) || 8192),
  )
  cost.dailyBudgetUsd = Math.max(0, Number(cost.dailyBudgetUsd) || 0)
  cost.logUsage = Boolean(cost.logUsage)
  cost.enablePromptCache = Boolean(cost.enablePromptCache)

  return {
    ...DEFAULT_SETTINGS,
    ...current,
    ...partial,
    general: { ...current.general, ...partial.general },
    models,
    cost,
    agent: {
      ...current.agent,
      ...partial.agent,
      permissions: {
        ...current.agent.permissions,
        ...partial.agent?.permissions,
      },
    },
    routing: partial.routing
      ? {
          ...current.routing,
          ...partial.routing,
          fallbackChain: partial.routing.fallbackChain ?? current.routing.fallbackChain,
          profiles: partial.routing.profiles ?? current.routing.profiles,
        }
      : current.routing,
  }
}
