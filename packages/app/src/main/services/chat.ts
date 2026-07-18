import {
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
} from '@codex/shared'
import { sessionService, settingsService } from './settings'
import { agentService } from './agent'
import {
  formatLlmConnectionError,
  getApiKeyForProvider,
  missingApiKeyMessage,
  noteProviderConnectionFailure,
  resolveRoutingDecisionAsync,
  runtimeFromCandidate,
} from './llm-config'
import { DEFAULT_OLLAMA_BASE_URL } from '@codex/shared'
import { formatSkillPrompt, formatSkillUserMessage, compactMessageContents, detectReplyLanguage, formatLanguageInstruction } from '@codex/agent-core'
import { rulesService } from './rules-service'
import { skillsService } from './skills-service'

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
    const baseUrl = settings.models.ollamaBaseUrl || process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE_URL
    return listModels(provider, apiKey ?? 'ollama', { baseUrl })
  }

  async send(params: ChatSendParams, webContents: WebContents): Promise<void> {
    const session = sessionService.getSession(params.sessionId)
    const mode = params.mode ?? session?.mode ?? 'ask'

    if (process.env.CODEX_E2E_MOCK_CHAT === '1' && mode !== 'agent') {
      return this.sendAskMock(params, webContents)
    }

    if (mode === 'agent' && session && session.mode !== 'agent') {
      sessionService.setMode(params.sessionId, 'agent')
    }

    if (mode === 'agent') {
      return agentService.run({ ...params, mode: 'agent' }, webContents)
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
    const { sessionId, attachments = [] } = params
    let content = params.content

    const skillMatch = await skillsService.matchInvocation(content)
    let skillPrompt = ''
    if (skillMatch) {
      skillPrompt = `\n\n${formatSkillPrompt(skillMatch.skill, skillMatch.args)}`
      content = formatSkillUserMessage(skillMatch.skill, skillMatch.args)
    }

    const settings = settingsService.get()
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
    const rulesPrompt = (await rulesService.buildPrompt(contextPaths)) + skillPrompt
    const llmMessages = this.buildMessages(history, attachments, rulesPrompt)

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

        try {
          for await (const chunk of llm.chat(llmMessages, {
            model: runtime.model,
            apiKey: runtime.apiKey,
            baseUrl: runtime.baseUrl,
            signal: abortController.signal,
          })) {
            if (chunk.type === 'text') {
              assistantContent += chunk.delta
              this.emit(webContents, sessionId, { type: 'text_delta', content: chunk.delta })
            } else if (chunk.type === 'error') {
              rawStreamError = chunk.error
              break
            }
          }
        } catch (err) {
          rawStreamError = err instanceof Error ? err.message : 'Chat failed'
        }

        if (!rawStreamError) {
          const saved = sessionService.addMessage(sessionId, {
            sessionId,
            role: 'assistant',
            content: assistantContent,
          })
          this.emit(webContents, sessionId, { type: 'done', messageId: saved.id })
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
          const attachmentText = msg.attachments
            .filter((a) => a.content)
            .map((a) => `\n\n--- Attached file: ${a.name} (${a.path}) ---\n${a.content}\n--- End ---`)
            .join('')
          if (attachmentText) content = content + attachmentText
        }
        messages.push({ role: msg.role, content })
      }
    }

    if (latestAttachments.length > 0) {
      const last = messages[messages.length - 1]
      if (last?.role === 'user') {
        const extra = latestAttachments
          .filter((a) => a.content)
          .map((a) => `\n\n--- Attached file: ${a.name} (${a.path}) ---\n${a.content}\n--- End ---`)
          .join('')
        if (extra && !last.content.includes(extra)) {
          last.content += extra
        }
      }
    }

    return messages
  }

  private updateSessionTitle(sessionId: string, content: string): void {
    const title = content.slice(0, 40) + (content.length > 40 ? '...' : '')
    sessionService.updateTitle(sessionId, title)
  }

  /** Compact persisted chat history for a session (manual Compact). */
  compactSession(sessionId: string): Message[] {
    const existing = sessionService.getMessages(sessionId)
    if (existing.length <= 4) return existing

    // Drop toolCalls metadata so rebuilt history never sends orphan tool roles to the API
    const compacted = compactMessageContents(
      existing.map((m) => ({
        role: m.role === 'tool' ? 'assistant' : m.role,
        content: m.content,
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
