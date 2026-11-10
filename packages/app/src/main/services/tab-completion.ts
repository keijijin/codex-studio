import { getProviderInstance } from '@codex/llm-adapters'
import { isLocalLlmProvider } from '@codex/shared'
import { settingsService } from './settings'
import {
  getApiKeyForProvider,
  modelsLlamacppBaseUrl,
  modelsOllamaBaseUrl,
  modelsXaiBaseUrl,
} from './llm-config'

export interface CompletionRequest {
  prefix: string
  suffix?: string
  language?: string
  path?: string
}

export interface CompletionResult {
  text: string
  skipped?: string
}

export async function completeInline(
  req: CompletionRequest,
  signal?: AbortSignal,
): Promise<CompletionResult> {
  const settings = settingsService.get()
  if (!settings.tabCompletion?.enabled) {
    return { text: '', skipped: 'disabled' }
  }

  const provider = settings.models.defaultProvider
  // Local servers typically serve one request at a time; Tab completion steals
  // the slot from Agent/Ask and makes TTFT feel much worse.
  if (isLocalLlmProvider(provider) && settings.tabCompletion.allowOnLocal !== true) {
    return { text: '', skipped: 'paused-on-local-provider' }
  }

  const apiKey = getApiKeyForProvider(provider, settings.models)
  if (!apiKey && provider !== 'ollama' && provider !== 'llamacpp') {
    return { text: '', skipped: 'no-api-key' }
  }

  const model = settings.models.defaultChatModel
  const maxTokens = settings.tabCompletion.maxTokens || 64
  const llm = getProviderInstance(provider)
  const baseUrl =
    provider === 'ollama'
      ? modelsOllamaBaseUrl(settings.models)
      : provider === 'llamacpp'
        ? modelsLlamacppBaseUrl(settings.models)
        : provider === 'xai'
          ? modelsXaiBaseUrl(settings.models)
          : undefined

  const prefix = req.prefix.slice(-4000)
  const suffix = (req.suffix ?? '').slice(0, 500)
  const prompt = `You are a code completion engine. Continue the code at the cursor.
Return ONLY the completion text to insert — no markdown fences, no explanations.
Language: ${req.language ?? 'text'}
File: ${req.path ?? 'untitled'}

<<<PREFIX
${prefix}
PREFIX>>>
<<<SUFFIX
${suffix}
SUFFIX>>>`

  let out = ''
  try {
    for await (const chunk of llm.chat(
      [
        { role: 'system', content: 'Complete code. Output only the insertion text.' },
        { role: 'user', content: prompt },
      ],
      {
        model,
        apiKey: apiKey ?? 'ollama',
        baseUrl,
        signal,
        maxTokens,
      },
    )) {
      if (chunk.type === 'text') out += chunk.delta
      if (chunk.type === 'error') {
        return { text: '', skipped: chunk.error }
      }
    }
  } catch (err) {
    return {
      text: '',
      skipped: err instanceof Error ? err.message : 'completion failed',
    }
  }

  // Strip accidental fences
  const cleaned = out
    .replace(/^```[\w]*\n?/, '')
    .replace(/\n?```$/, '')
    .replace(/^\n+/, '')
  return { text: cleaned.slice(0, 2000) }
}
