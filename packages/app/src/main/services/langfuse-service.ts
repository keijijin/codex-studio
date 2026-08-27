import { Langfuse } from 'langfuse'
import type { AppSettings } from '@codex/shared'
import type { LlmUsage } from '@codex/llm-adapters'
import { resolveLangfuseConfig, langfuseHostHint } from './langfuse-config'
import { settingsService } from './settings'

type TraceHandle = ReturnType<Langfuse['trace']>
type GenerationHandle = ReturnType<TraceHandle['generation']>
type SpanHandle = ReturnType<TraceHandle['span']>

const MAX_TEXT = 8_000

function truncate(value: unknown, max = MAX_TEXT): unknown {
  if (typeof value === 'string') {
    return value.length > max ? `${value.slice(0, max)}…` : value
  }
  if (value == null) return value
  try {
    const json = JSON.stringify(value)
    if (json.length <= max) return value
    return `${json.slice(0, max)}…`
  } catch {
    return String(value).slice(0, max)
  }
}

function resolveFromSettings(settings?: AppSettings) {
  return resolveLangfuseConfig(settings?.langfuse ?? settingsService.get().langfuse)
}

export interface AgentTraceHooks {
  onLlmStart: (info: {
    iteration: number
    model: string
    messageCount: number
  }) => {
    end: (info: {
      outputText: string
      toolCalls?: unknown
      usage?: LlmUsage
      error?: string
    }) => void
  }
  onToolStart: (info: {
    toolCallId: string
    tool: string
    args: unknown
  }) => {
    end: (info: { output: string; success: boolean }) => void
  }
}

export interface AskTraceSession {
  end: (info: {
    output: string
    model: string
    provider: string
    usage?: LlmUsage
    error?: string
    latencyMs?: number
  }) => void
}

export interface AgentTraceSession {
  hooks: AgentTraceHooks
  end: (info: {
    output: string
    model: string
    provider: string
    usage?: LlmUsage
    error?: string
    toolCount?: number
  }) => void
}

class LangfuseService {
  private client: Langfuse | null = null
  private clientKey = ''

  isEnabled(settings?: AppSettings): boolean {
    const cfg = resolveFromSettings(settings)
    return Boolean(cfg.enabled && cfg.publicKey && cfg.secretKey)
  }

  private getClient(settings?: AppSettings): Langfuse | null {
    const cfg = resolveFromSettings(settings)
    if (!cfg.enabled) {
      return null
    }
    if (!cfg.publicKey || !cfg.secretKey) {
      console.warn(
        '[langfuse] enabled ですが Public/Secret Key が未設定のためトレースを送りません',
      )
      return null
    }
    const hint = langfuseHostHint(cfg)
    if (hint) {
      console.warn(`[langfuse] ${hint}`)
    }
    const key = `${cfg.publicKey}::${cfg.secretKey}::${cfg.baseUrl}`
    if (!this.client || this.clientKey !== key) {
      this.client?.shutdownAsync?.().catch(() => undefined)
      this.client = new Langfuse({
        publicKey: cfg.publicKey,
        secretKey: cfg.secretKey,
        baseUrl: cfg.baseUrl,
      })
      this.clientKey = key
      console.info(`[langfuse] client ready → ${cfg.baseUrl}`)
    }
    return this.client
  }

  private flushClient(client: Langfuse): void {
    void client.flushAsync().catch((err) => {
      console.warn(
        '[langfuse] flush failed（キーと Base URL の組み合わせを確認してください）',
        err instanceof Error ? err.message : err,
      )
    })
  }

  startAskTrace(opts: {
    sessionId: string
    input: string
    provider: string
    model: string
    settings?: AppSettings
  }): AskTraceSession | null {
    const client = this.getClient(opts.settings)
    if (!client) return null

    const trace = client.trace({
      name: 'ask',
      sessionId: opts.sessionId,
      input: truncate(opts.input),
      tags: ['ask', opts.provider],
      metadata: { model: opts.model, provider: opts.provider },
    })
    const generation = trace.generation({
      name: 'llm.chat',
      model: opts.model,
      input: truncate(opts.input),
      metadata: { provider: opts.provider },
    })

    return {
      end: (info) => {
        generation.end({
          output: truncate(info.output || info.error || ''),
          level: info.error ? 'ERROR' : 'DEFAULT',
          statusMessage: info.error,
          usage: info.usage
            ? {
                input: info.usage.inputTokens,
                output: info.usage.outputTokens,
              }
            : undefined,
          metadata: {
            provider: info.provider,
            latencyMs: info.latencyMs,
            cachedInputTokens: info.usage?.cachedInputTokens,
          },
        })
        trace.update({
          output: truncate(info.output || info.error || ''),
          metadata: {
            provider: info.provider,
            model: info.model,
            error: info.error,
          },
        })
        void this.flushClient(client)
      },
    }
  }

  startAgentTrace(opts: {
    sessionId: string
    input: string
    provider: string
    model: string
    planMode?: boolean
    settings?: AppSettings
  }): AgentTraceSession | null {
    const client = this.getClient(opts.settings)
    if (!client) return null

    const mode = opts.planMode ? 'plan' : 'agent'
    const trace = client.trace({
      name: mode,
      sessionId: opts.sessionId,
      input: truncate(opts.input),
      tags: [mode, opts.provider],
      metadata: { model: opts.model, provider: opts.provider, planMode: Boolean(opts.planMode) },
    })

    const hooks: AgentTraceHooks = {
      onLlmStart: ({ iteration, model, messageCount }) => {
        const generation: GenerationHandle = trace.generation({
          name: `llm.agentChat#${iteration}`,
          model,
          input: { iteration, messageCount },
          metadata: { iteration, messageCount },
        })
        return {
          end: ({ outputText, toolCalls, usage, error }) => {
            generation.end({
              output: truncate({
                text: outputText,
                toolCalls,
                error,
              }),
              level: error ? 'ERROR' : 'DEFAULT',
              statusMessage: error,
              usage: usage
                ? {
                    input: usage.inputTokens,
                    output: usage.outputTokens,
                  }
                : undefined,
              metadata: {
                cachedInputTokens: usage?.cachedInputTokens,
                toolCallCount: Array.isArray(toolCalls) ? toolCalls.length : 0,
              },
            })
          },
        }
      },
      onToolStart: ({ toolCallId, tool, args }) => {
        const span: SpanHandle = trace.span({
          name: `tool:${tool}`,
          input: truncate(args),
          metadata: { toolCallId, tool },
        })
        return {
          end: ({ output, success }) => {
            span.end({
              output: truncate(output),
              level: success ? 'DEFAULT' : 'WARNING',
              statusMessage: success ? undefined : 'tool failed',
              metadata: { success },
            })
          },
        }
      },
    }

    return {
      hooks,
      end: (info) => {
        trace.update({
          output: truncate(info.output || info.error || ''),
          metadata: {
            provider: info.provider,
            model: info.model,
            toolCount: info.toolCount,
            error: info.error,
            usage: info.usage,
          },
        })
        void this.flushClient(client)
      },
    }
  }

  async flush(): Promise<void> {
    if (!this.client) return
    try {
      await this.client.flushAsync()
    } catch (err) {
      console.warn(
        '[langfuse] flush failed（キーと Base URL の組み合わせを確認してください）',
        err instanceof Error ? err.message : err,
      )
    }
  }

  async shutdown(): Promise<void> {
    if (!this.client) return
    try {
      await this.client.shutdownAsync()
    } catch {
      // ignore
    }
    this.client = null
    this.clientKey = ''
  }
}

export const langfuseService = new LangfuseService()
