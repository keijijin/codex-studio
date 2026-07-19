import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'
import {
  buildCatalogFromAvailability,
  createDefaultCatalog,
  isCatalogExpired,
  listModels,
  type LLMProviderId,
  type ModelCatalogSnapshot,
} from '@codex/llm-adapters'
import {
  APP_USER_DATA_DIR,
  DEFAULT_OLLAMA_BASE_URL,
  DEFAULT_XAI_BASE_URL,
  type AppSettings,
} from '@codex/shared'

function catalogPath(): string {
  if (process.env.ELECTRON_USER_DATA) {
    return join(process.env.ELECTRON_USER_DATA, 'model-catalog.json')
  }
  if (process.platform === 'darwin') {
    return join(
      homedir(),
      'Library',
      'Application Support',
      APP_USER_DATA_DIR,
      'model-catalog.json',
    )
  }
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || join(homedir(), 'AppData', 'Roaming')
    return join(appData, APP_USER_DATA_DIR, 'model-catalog.json')
  }
  const config = process.env.XDG_CONFIG_HOME || join(homedir(), '.config')
  return join(config, APP_USER_DATA_DIR, 'model-catalog.json')
}

function apiKeyFor(provider: LLMProviderId, models: AppSettings['models']): string | undefined {
  if (provider === 'ollama') return 'ollama'
  if (provider === 'anthropic') return models.anthropicApiKey || process.env.ANTHROPIC_API_KEY
  if (provider === 'xai') return models.xaiApiKey || process.env.XAI_API_KEY
  return models.openaiApiKey || process.env.OPENAI_API_KEY
}

function baseUrlFor(provider: LLMProviderId, models: AppSettings['models']): string | undefined {
  if (provider === 'ollama') {
    return models.ollamaBaseUrl || process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE_URL
  }
  if (provider === 'xai') {
    return models.xaiBaseUrl || process.env.XAI_BASE_URL || DEFAULT_XAI_BASE_URL
  }
  return undefined
}

class ModelCatalogService {
  private cache: ModelCatalogSnapshot | null = null
  private refreshPromise: Promise<ModelCatalogSnapshot> | null = null

  getCached(): ModelCatalogSnapshot {
    if (this.cache && !isCatalogExpired(this.cache)) return this.cache
    const fromDisk = this.readDisk()
    if (fromDisk && !isCatalogExpired(fromDisk)) {
      this.cache = fromDisk
      return fromDisk
    }
    return this.cache ?? fromDisk ?? createDefaultCatalog()
  }

  /** Return catalog; kick off background refresh when stale. */
  getForRouting(settings: AppSettings): ModelCatalogSnapshot {
    const current = this.getCached()
    if (isCatalogExpired(current)) {
      void this.refresh(settings).catch(() => {
        // keep last known catalog
      })
    }
    return current
  }

  async refresh(settings: AppSettings, force = false): Promise<ModelCatalogSnapshot> {
    if (this.refreshPromise) return this.refreshPromise
    if (!force && this.cache && !isCatalogExpired(this.cache)) {
      return this.cache
    }

    this.refreshPromise = this.fetchAndStore(settings).finally(() => {
      this.refreshPromise = null
    })
    return this.refreshPromise
  }

  private async fetchAndStore(settings: AppSettings): Promise<ModelCatalogSnapshot> {
    const available: Partial<Record<LLMProviderId, string[]>> = {}
    const providers: LLMProviderId[] = ['openai', 'anthropic', 'xai', 'ollama']

    await Promise.all(
      providers.map(async (provider) => {
        const apiKey = apiKeyFor(provider, settings.models)
        if (!apiKey && provider !== 'ollama') return
        try {
          const models = await listModels(provider, apiKey ?? 'ollama', {
            baseUrl: baseUrlFor(provider, settings.models),
          })
          available[provider] = models.map((m) => m.id)
        } catch {
          // skip provider — keep aliases
        }
      }),
    )

    const snapshot = buildCatalogFromAvailability(available)
    this.cache = snapshot
    this.writeDisk(snapshot)
    return snapshot
  }

  private readDisk(): ModelCatalogSnapshot | null {
    try {
      const path = catalogPath()
      if (!existsSync(path)) return null
      const raw = JSON.parse(readFileSync(path, 'utf-8')) as ModelCatalogSnapshot
      if (!raw?.tiers?.openai || !raw.expiresAt) return null
      return raw
    } catch {
      return null
    }
  }

  private writeDisk(snapshot: ModelCatalogSnapshot): void {
    try {
      const path = catalogPath()
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf-8')
    } catch {
      // best-effort
    }
  }
}

export const modelCatalogService = new ModelCatalogService()
