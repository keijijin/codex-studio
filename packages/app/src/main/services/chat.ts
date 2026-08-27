import {
  flattenChatContent,
  getProviderInstance,
  isConnectionError,
  isRetryableError,
  listModels,
  type ChatMessage,
  type RoutingDecision,
} from '@codex/llm-adapters'
import type { WebContents } from 'electron'
import {
  IPC_EVENTS,
  type Attachment,
  type ChatSendParams,
  type ChatStreamEvent,
  type LLMProviderId,
  type Message,
  type TurnTrace,
} from '@codex/shared'
import { sessionService, settingsService } from './settings'
import { agentService } from './agent'
import {
  formatLlmConnectionError,
  getApiKeyForProvider,
  missingApiKeyMessage,
  modelsOllamaBaseUrl,
  modelsXaiBaseUrl,
  noteProviderConnectionFailure,
  resolveRoutingDecisionAsync,
  runtimeFromCandidate,
} from './llm-config'
import { formatSkillPrompt, formatSkillUserMessage, compactMessageContents, detectReplyLanguage, formatLanguageInstruction, estimateTokens } from '@codex/agent-core'
import { rulesService } from './rules-service'
import { skillsService } from './skills-service'
import { personasService } from './personas-service'
import { modelCatalogService } from './model-catalog-service'
import { assertUnderDailyBudget, recordLlmTurn } from './usage-helpers'
import { langfuseService } from './langfuse-service'
import { formatAttachments, materializeAttachments } from './attachment-context'

const SYSTEM_PROMPT = `You are Codex Studio, an AI coding assistant integrated into a developer IDE.
Help the user with code understanding, debugging, refactoring, and general programming questions.
When file attachments are provided, use them as context for your answers.
Use markdown for code blocks and formatting.`

export class ChatService {
  private abortControllers = new Map<string, AbortController>()

  cancel(sessionId: string): void {
    this.abortControllers.get(sessionId)?.abort()
    this.abortControllers.delete(sessionId)
    agentService.cancel(sessionId)
  }

  async listModels(provider: LLMProviderId) {
    const settings = settingsService.get()
    const apiKey = getApiKeyForProvider(provider, settings.models)
    if (!apiKey && provider !== 'ollama') {
      throw new Error(missingApiKeyMessage(provider))
    }
    const baseUrl =
      provider === 'ollama'
        ? modelsOllamaBaseUrl(settings.models)
        : provider === 'xai'
          ? modelsXaiBaseUrl(settings.models)
          : undefined
    const list = await listModels(provider, apiKey ?? 'ollama', { baseUrl })
    // Refresh cost-routing catalog in the background when models are listed
    void modelCatalogService.refresh(settings).catch(() => undefined)
    return list
  }

  async send(params: ChatSendParams, webContents: WebContents): Promise<void> {
    const session = sessionService.getSession(params.sessionId)
    const mode = params.mode ?? session?.mode ?? 'ask'

    if (process.env.CODEX_E2E_MOCK_CHAT === '1' && mode !== 'agent') {
      return this.sendAskMock(params, webContents)
    }

    if ((mode === 'agent' || mode === 'plan') && session && session.mode !== mode) {
      sessionService.setMode(params.sessionId, mode)
    }

    if (mode === 'agent' || mode === 'plan') {
      return agentService.run({ ...params, mode }, webContents)
    }

    return this.sendAsk(params, webContents)
  }

  private async sendAskMock(params: ChatSendParams, webContents: WebContents): Promise<void> {
    const { sessionId, content, attachments = [] } = params
    sessionService.addMessage(sessionId, {
      sessionId,
      role: 'user',
      content,
      attachments: attachments.map(({ type, path, name }) => ({ type, path, name })),
    })
    this.updateSessionTitle(sessionId, content)
    this.emit(webContents, sessionId, { type: 'text_delta', content: 'E2E mock response' })
    const saved = sessionService.addMessage(sessionId, {
      sessionId,
      role: 'assistant',
      content: 'E2E mock response',
    })
    this.emit(webContents, sessionId, { type: 'done', messageId: saved.id })
  }

  private async sendAsk(params: ChatSendParams, webContents: WebContents): Promise<void> {
    const { sessionId } = params
    let content = params.content
    const attachments = await materializeAttachments(params.attachments ?? [], content)

    const settings = settingsService.get()

    let personaPrompt = ''
    let activePersona: { id: string; name: string } | undefined
    const sessionForPersona = sessionService.getSession(sessionId)
    const personaMatch = await personasService.matchInvocation(content)
    if (personaMatch?.clear) {
      sessionService.setPersona(sessionId, undefined)
      if (!personaMatch.args) {
        sessionService.addMessage(sessionId, {
          sessionId,
          role: 'user',
          content: '/persona clear',
        })
        const saved = sessionService.addMessage(sessionId, {
          sessionId,
          role: 'assistant',
          content: 'このセッションの Persona を解除しました。',
        })
        this.emit(webContents, sessionId, { type: 'done', messageId: saved.id })
        return
      }
      content = personaMatch.args
    } else if (personaMatch) {
      personaPrompt = `\n\n${personasService.formatPrompt(personaMatch.persona)}`
      activePersona = { id: personaMatch.persona.id, name: personaMatch.persona.name }
      sessionService.setPersona(sessionId, personaMatch.persona.name)
      content = personaMatch.args || personasService.formatUserMessage(personaMatch.persona, '')
    } else {
      const stickyOrDefault =
        (await personasService.resolveDefault(sessionForPersona?.personaName)) ??
        (await personasService.resolveDefault(settings.agent.defaultPersona))
      if (stickyOrDefault) {
        personaPrompt = `\n\n${personasService.formatPrompt(stickyOrDefault)}`
        activePersona = { id: stickyOrDefault.id, name: stickyOrDefault.name }
      }
    }

    const skillMatch = await skillsService.matchInvocation(content)
    let skillPrompt = ''
    if (skillMatch) {
      skillPrompt = `\n\n${formatSkillPrompt(skillMatch.skill, skillMatch.args)}`
      content = formatSkillUserMessage(skillMatch.skill, skillMatch.args)
    }

    const budgetError = await assertUnderDailyBudget(settings)
    if (budgetError) {
      this.emit(webContents, sessionId, { type: 'error', message: budgetError })
      return
    }

    const decision = await resolveRoutingDecisionAsync(settings, {
      runMode: 'chat',
      prompt: content,
    })

    if (decision.queue.length === 0 || !runtimeFromCandidate(decision.selected, settings).apiKey) {
      const provider = decision.selected.provider
      this.emit(webContents, sessionId, {
        type: 'error',
        message: missingApiKeyMessage(provider),
      })
      return
    }

    const existingAbort = this.abortControllers.get(sessionId)
    if (existingAbort) existingAbort.abort()

    const abortController = new AbortController()
    this.abortControllers.set(sessionId, abortController)

    sessionService.addMessage(sessionId, {
      sessionId,
      role: 'user',
      content,
      attachments: attachments.map(({ type, path, name }) => ({ type, path, name })),
    })

    this.updateSessionTitle(sessionId, content)

    const history = sessionService.getMessages(sessionId)
    const contextPaths = [
      ...(params.contextPaths ?? []),
      ...attachments.map((a) => a.path),
    ]
    const rulesPrompt =
      (await rulesService.buildPrompt(contextPaths)) + personaPrompt + skillPrompt
    let llmMessages = this.buildMessages(history, attachments, rulesPrompt)

    if (activePersona) {
      this.emit(webContents, sessionId, {
        type: 'persona_applied',
        personaId: activePersona.id,
        personaName: activePersona.name,
      })
    }

    // Soft trim Ask context using the same compact threshold as Agent
    const askBudget = settings.agent.compactTokenThreshold
    if (askBudget && askBudget > 0) {
      const estimated = llmMessages.reduce(
        (sum, m) => sum + estimateTokens(flattenChatContent(m.content)),
        0,
      )
      if (estimated > askBudget) {
        const compacted = compactMessageContents(
          llmMessages.filter((m) => m.role !== 'system').map((m) => ({
            role: m.role,
            content: flattenChatContent(m.content),
          })),
          8,
        )
        const system = llmMessages.find((m) => m.role === 'system')
        llmMessages = [
          ...(system ? [system] : []),
          ...compacted.map((m) => ({
            role: m.role as 'system' | 'user' | 'assistant',
            content: m.content,
          })),
        ]
      }
    }

    this.emitRouting(webContents, sessionId, decision)

    let lastError = ''
    try {
      for (let attempt = 0; attempt < decision.queue.length; attempt++) {
        if (abortController.signal.aborted) {
          this.emit(webContents, sessionId, { type: 'error', message: 'Cancelled' })
          return
        }

        const candidate = decision.queue[attempt]!
        const runtime = runtimeFromCandidate(candidate, settings)
        if (!runtime.apiKey) {
          lastError = missingApiKeyMessage(candidate.provider)
          continue
        }

        if (attempt > 0) {
          this.emit(webContents, sessionId, {
            type: 'retrying',
            provider: candidate.provider,
            model: candidate.model,
            attempt: attempt + 1,
            previousError: lastError,
          })
          this.emit(webContents, sessionId, {
            type: 'routing',
            provider: candidate.provider,
            model: candidate.model,
            reason: `フォールバック (${attempt + 1}/${decision.queue.length})`,
            mode: decision.mode,
          })
        }

        const llm = getProviderInstance(runtime.provider)
        let assistantContent = ''
        let rawStreamError: string | null = null
        let turnUsage: { inputTokens: number; outputTokens: number; cachedInputTokens: number } | undefined
        const startedAt = Date.now()
        const askTrace = langfuseService.startAskTrace({
          sessionId,
          input: content,
          provider: runtime.provider,
          model: runtime.model,
          settings,
        })

        try {
          for await (const chunk of llm.chat(llmMessages, {
            model: runtime.model,
            apiKey: runtime.apiKey,
            baseUrl: runtime.baseUrl,
            signal: abortController.signal,
            maxTokens: settings.cost?.maxOutputTokens ?? 4096,
            enablePromptCache: settings.cost?.enablePromptCache !== false,
          })) {
            if (chunk.type === 'text') {
              assistantContent += chunk.delta
              this.emit(webContents, sessionId, { type: 'text_delta', content: chunk.delta })
            } else if (chunk.type === 'done') {
              turnUsage = chunk.usage
            } else if (chunk.type === 'error') {
              rawStreamError = chunk.error
              break
            }
          }
        } catch (err) {
          rawStreamError = err instanceof Error ? err.message : 'Chat failed'
        }

        if (!rawStreamError) {
          const usagePayload = await recordLlmTurn({
            settings,
            sessionId,
            provider: runtime.provider,
            model: runtime.model,
            mode: 'ask',
            latencyMs: Date.now() - startedAt,
            usage: turnUsage,
          })
          askTrace?.end({
            output: assistantContent,
            model: runtime.model,
            provider: runtime.provider,
            usage: turnUsage,
            latencyMs: Date.now() - startedAt,
          })
          const trace: TurnTrace = {
            personaId: activePersona?.id,
            personaName: activePersona?.name,
            provider: runtime.provider,
            model: runtime.model,
            routeReason: decision.reason,
            usage: usagePayload,
            toolCount: 0,
          }
          const saved = sessionService.addMessage(sessionId, {
            sessionId,
            role: 'assistant',
            content: assistantContent,
            trace,
          })
          this.emit(webContents, sessionId, {
            type: 'done',
            messageId: saved.id,
            usage: usagePayload,
            trace,
          })
          return
        }

        if (isConnectionError(rawStreamError)) {
          noteProviderConnectionFailure(runtime.provider, settings)
        }

        const streamError = formatLlmConnectionError(runtime.provider, rawStreamError)
        lastError = streamError
        const canRetry =
          attempt < decision.queue.length - 1 &&
          (isConnectionError(rawStreamError) ||
            isRetryableError(rawStreamError) ||
            isRetryableError(streamError)) &&
          !abortController.signal.aborted

        askTrace?.end({
          output: assistantContent,
          model: runtime.model,
          provider: runtime.provider,
          usage: turnUsage,
          error: streamError,
          latencyMs: Date.now() - startedAt,
        })
        if (!canRetry) {
          this.emit(webContents, sessionId, { type: 'error', message: streamError })
          return
        }
      }

      this.emit(webContents, sessionId, {
        type: 'error',
        message: lastError || 'Chat failed',
      })
    } finally {
      this.abortControllers.delete(sessionId)
    }
  }

  private emitRouting(
    webContents: WebContents,
    sessionId: string,
    decision: RoutingDecision,
  ): void {
    this.emit(webContents, sessionId, {
      type: 'routing',
      provider: decision.selected.provider,
      model: decision.selected.model,
      reason: decision.reason,
      mode: decision.mode,
    })
  }

  private buildMessages(
    history: Message[],
    latestAttachments: Attachment[],
    rulesPrompt = '',
  ): ChatMessage[] {
    const lastUser = [...history].reverse().find((m) => m.role === 'user')?.content ?? ''
    const languageBlock = formatLanguageInstruction(detectReplyLanguage(lastUser))
    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT + languageBlock + rulesPrompt },
    ]

    for (const msg of history) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        let content = msg.content
        if (msg.role === 'user' && msg.attachments?.length) {
          const attachmentText = formatAttachments(msg.attachments.filter((a) => a.type !== 'image'))
          if (attachmentText) content = content + attachmentText
        }
        messages.push({ role: msg.role, content })
      }
    }

    if (latestAttachments.length > 0) {
      const last = messages[messages.length - 1]
      if (last?.role === 'user') {
        const nonImages = latestAttachments.filter((a) => a.type !== 'image')
        const images = latestAttachments.filter(
          (a) => a.type === 'image' && a.content?.startsWith('data:'),
        )
        const extra = formatAttachments(nonImages)
        if (extra && typeof last.content === 'string' && !last.content.includes(extra)) {
          last.content += extra
        }
        if (images.length > 0 && typeof last.content === 'string') {
          last.content = [
            { type: 'text', text: last.content },
            ...images.map((img) => ({
              type: 'image_url' as const,
              image_url: { url: img.content! },
            })),
          ]
        }
      }
    }

    return messages
  }

  private updateSessionTitle(sessionId: string, content: string): void {
    const title = content.slice(0, 40) + (content.length > 40 ? '...' : '')
    sessionService.updateTitle(sessionId, title)
  }

  /** Compact persisted chat history for a session (manual 「履歴を圧縮」). */
  compactSession(sessionId: string): Message[] {
    const existing = sessionService.getMessages(sessionId)
    if (existing.length <= 4) return existing

    // Drop toolCalls metadata so rebuilt history never sends orphan tool roles to the API
    const compacted = compactMessageContents(
      existing.map((m) => ({
        role: m.role === 'tool' ? 'assistant' : m.role,
        content:
          m.content.length > 4_000
            ? `${m.content.slice(0, 4_000)}\n...(truncated for compact)`
            : m.content,
      })),
      6,
    )
    const now = new Date().toISOString()
    const next: Message[] = compacted.map((m, i) => ({
      id: existing[i]?.id ?? `compact-${sessionId}-${i}`,
      sessionId,
      role: m.role === 'assistant' ? 'assistant' : m.role === 'system' ? 'system' : 'user',
      content: m.content,
      createdAt: existing[Math.min(i, existing.length - 1)]?.createdAt ?? now,
    }))
    sessionService.replaceMessages(sessionId, next)
    return next
  }

  private emit(webContents: WebContents, sessionId: string, event: ChatStreamEvent): void {
    webContents.send(IPC_EVENTS.CHAT_STREAM, { sessionId, ...event })
  }
}

export const chatService = new ChatService()
