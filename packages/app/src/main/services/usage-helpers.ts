import { estimateCostUsd, type AppSettings } from '@codex/shared'
import { appendUsageLog, getDailyUsageSummary } from './usage-log'

export async function assertUnderDailyBudget(settings: AppSettings): Promise<string | null> {
  const budget = settings.cost?.dailyBudgetUsd ?? 0
  if (!budget || budget <= 0) return null
  const daily = await getDailyUsageSummary()
  if (daily.estimatedCostUsd >= budget) {
    return `本日の推定課金が上限（$${budget.toFixed(2)}）に達しています（$${daily.estimatedCostUsd.toFixed(4)}）。設定の日次予算を引き上げるか、明日まで待ってください。`
  }
  return null
}

export async function recordLlmTurn(opts: {
  settings: AppSettings
  sessionId: string
  provider: string
  model: string
  mode: 'ask' | 'agent'
  latencyMs: number
  usage?: { inputTokens: number; outputTokens: number; cachedInputTokens: number }
}): Promise<{
  inputTokens: number
  outputTokens: number
  cachedInputTokens: number
  latencyMs: number
  estimatedCostUsd: number
} | undefined> {
  const usage = opts.usage ?? { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 }
  const estimatedCostUsd = estimateCostUsd(opts.model, usage)
  if (opts.settings.cost?.logUsage !== false) {
    await appendUsageLog({
      sessionId: opts.sessionId,
      provider: opts.provider,
      model: opts.model,
      mode: opts.mode,
      latencyMs: opts.latencyMs,
      ...usage,
      estimatedCostUsd,
    })
  }
  return {
    ...usage,
    latencyMs: opts.latencyMs,
    estimatedCostUsd,
  }
}
