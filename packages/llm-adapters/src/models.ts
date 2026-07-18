import type { LLMProviderId, ModelInfo } from './types'
import { createOpenAIClient } from './create-clients'
import { getSystemCaFetch } from './system-ca-fetch'

const ANTHROPIC_MODELS: ModelInfo[] = [
  { id: 'claude-sonnet-5', name: 'Claude Sonnet 5', provider: 'anthropic' },
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', provider: 'anthropic' },
  { id: 'claude-opus-4-8', name: 'Claude Opus 4.8', provider: 'anthropic' },
  { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', provider: 'anthropic' },
  { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5 (dated)', provider: 'anthropic' },
]

const OPENAI_FALLBACK: ModelInfo[] = [
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai' },
  { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'openai' },
  { id: 'o1', name: 'o1', provider: 'openai' },
  { id: 'o1-mini', name: 'o1 Mini', provider: 'openai' },
]

function isChatModel(id: string): boolean {
  return (
    id.startsWith('gpt-') ||
    id.startsWith('o1') ||
    id.startsWith('o3') ||
    id.startsWith('o4') ||
    id.startsWith('chatgpt-')
  )
}

export async function listModels(
  provider: LLMProviderId,
  apiKey: string,
  options?: { baseUrl?: string },
): Promise<ModelInfo[]> {
  if (provider === 'ollama') {
    return listOllamaModels(options?.baseUrl)
  }

  if (provider === 'anthropic') {
    try {
      const fetchImpl = getSystemCaFetch() ?? fetch
      const res = await fetchImpl('https://api.anthropic.com/v1/models', {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
      })
      if (res.ok) {
        const data = (await res.json()) as { data?: { id: string; display_name?: string }[] }
        const models = (data.data ?? [])
          .map((m) => ({
            id: m.id,
            name: m.display_name ?? m.id,
            provider: 'anthropic' as const,
          }))
          .sort((a, b) => a.id.localeCompare(b.id))
        if (models.length > 0) return models
      }
    } catch {
      // fallback below
    }
    return ANTHROPIC_MODELS
  }

  try {
    const client = createOpenAIClient({ apiKey })
    const page = await client.models.list()
    const models: ModelInfo[] = []
    for await (const model of page) {
      if (isChatModel(model.id)) {
        models.push({ id: model.id, name: model.id, provider: 'openai' })
      }
    }
    models.sort((a, b) => a.id.localeCompare(b.id))
    return models.length > 0 ? models : OPENAI_FALLBACK
  } catch {
    return OPENAI_FALLBACK
  }
}

export function getProviderForModel(modelId: string): LLMProviderId {
  if (modelId.startsWith('claude')) return 'anthropic'
  if (modelId.includes(':') || modelId.startsWith('llama') || modelId.startsWith('mistral')) {
    return 'ollama'
  }
  return 'openai'
}

async function listOllamaModels(baseUrl = 'http://localhost:11434'): Promise<ModelInfo[]> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/tags`
  try {
    const res = await fetch(url)
    if (!res.ok) {
      throw new Error(`Ollama API error: ${res.status}`)
    }
    const data = (await res.json()) as { models?: { name: string }[] }
    const models = (data.models ?? []).map((m) => ({
      id: m.name,
      name: m.name,
      provider: 'ollama' as const,
    }))
    return models.sort((a, b) => a.id.localeCompare(b.id))
  } catch {
    return [
      { id: 'llama3.2', name: 'llama3.2 (fallback)', provider: 'ollama' },
      { id: 'mistral', name: 'mistral (fallback)', provider: 'ollama' },
    ]
  }
}
