import { BrowserWindow } from 'electron'
import { AgentOrchestrator } from '@codex/agent-core'
import type { AgentMessage } from '@codex/llm-adapters'
import { getProviderInstance, isConnectionError, isRetryableError } from '@codex/llm-adapters'
import { defaultToolRegistry } from '@codex/tools'
import type { WebContents } from 'electron'
import {
  IPC_EVENTS,
  type ApprovalRequest,
  type Attachment,
  type ChatSendParams,
  type ChatStreamEvent,
  type Message,
  type ToolCallRecord,
} from '@codex/shared'
import { approvalService } from './approval'
import { agentEnvService } from './agent-env-service'
import { createE2eMockAgentProvider } from './e2e-mock-agent'
import {
  formatLlmConnectionError,
  missingApiKeyMessage,
  noteProviderConnectionFailure,
  resolveRoutingDecisionAsync,
  runtimeFromCandidate,
  type LlmRuntimeConfig,
} from './llm-config'
import { formatSkillPrompt, formatSkillUserMessage } from '@codex/agent-core'
import {
  appendMemoryNote,
  createConcurrencyLimiter,
  findTeam,
  collectTeams,
  runSubagentTask,
  runTeam,
  sanitizeToolMessagePairs,
} from '@codex/agent-core'
import { DEFAULT_AGENT_PERMISSIONS } from '@codex/shared'
import { skillsService } from './skills-service'
import { teamsService } from './teams-service'
import { rulesService } from './rules-service'
import { hooksService } from './hooks-service'
import { sessionService, settingsService } from './settings'
import { workspaceService } from './workspace'
import { assertUnderDailyBudget, recordLlmTurn } from './usage-helpers'

const ALL_AGENT_TOOLS = [
  'Read',
  'Grep',
  'Glob',
  'Write',
  'StrReplace',
  'Delete',
  'Shell',
  'Task',
  'Team',
  'WebSearch',
  'MemoryAppend',
]

export class AgentService {
  private abortControllers = new Map<string, AbortController>()
  private orchestrator = new AgentOrchestrator(getProviderInstance('openai'), defaultToolRegistry)

  cancel(sessionId: string): void {
    this.abortControllers.get(sessionId)?.abort()
    this.abortControllers.delete(sessionId)
    approvalService.cancelAll(sessionId)
  }

  respondApproval(sessionId: string, toolCallId: string, approved: boolean): void {
    approvalService.respond(sessionId, toolCallId, approved)
  }

  async run(params: ChatSendParams, webContents: WebContents): Promise<void> {
    const { sessionId, attachments = [] } = params
    let content = params.content
    const settings = settingsService.get()
    const root = workspaceService.getRoot()

    if (!root) {
      this.emit(webContents, sessionId, {
        type: 'error',
        message: 'ワークスペースを開いてから Agent を使用してください。',
      })
      return
    }

    const budgetError = await assertUnderDailyBudget(settings)
    if (budgetError) {
      this.emit(webContents, sessionId, { type: 'error', message: budgetError })
      return
    }

    const skillMatch = await skillsService.matchInvocation(content)
    let skillPrompt: string | undefined
    const teamMatch = skillMatch ? null : await teamsService.matchInvocation(content)
    if (skillMatch) {
      skillPrompt = formatSkillPrompt(skillMatch.skill, skillMatch.args)
      content = formatSkillUserMessage(skillMatch.skill, skillMatch.args)
    } else if (teamMatch) {
      content = teamMatch.args
        ? `/team ${teamMatch.team.id} ${teamMatch.args}`
        : `/team ${teamMatch.team.id}`
    }

    const decision = await resolveRoutingDecisionAsync(settings, {
      runMode: 'agent',
      prompt: content,
      isTeam: Boolean(teamMatch),
    })
    const isE2eMock = process.env.CODEX_E2E_MOCK_AGENT === '1'
    const firstRuntime = runtimeFromCandidate(decision.selected, settings)

    if (!firstRuntime.apiKey && !isE2eMock) {
      this.emit(webContents, sessionId, {
        type: 'error',
        message: missingApiKeyMessage(firstRuntime.provider),
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

    if (teamMatch) {
      try {
        const toolCallId = `team-${teamMatch.team.id}`
        this.emit(webContents, sessionId, {
          type: 'tool_call_start',
          toolCallId,
          tool: 'Team',
          args: { team: teamMatch.team.id, prompt: teamMatch.args || content },
        })
        const result = await teamsService.run(
          teamMatch.team.id,
          teamMatch.args || 'Review this workspace',
          abortController.signal,
        )
        this.emit(webContents, sessionId, {
          type: 'tool_call_result',
          toolCallId,
          tool: 'Team',
          result: result.synthesis,
          success: result.success,
        })
        const saved = sessionService.addMessage(sessionId, {
          sessionId,
          role: 'assistant',
          content: result.synthesis,
          toolCalls: [
            {
              id: toolCallId,
              name: 'Team',
              args: { team: teamMatch.team.id, prompt: teamMatch.args || content },
              result: result.synthesis,
              status: result.success ? 'done' : 'error',
            },
          ],
        })
        this.emit(webContents, sessionId, { type: 'done', messageId: saved.id })
        void hooksService.onAgentComplete(sessionId)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Team failed'
        this.emit(webContents, sessionId, { type: 'error', message })
      } finally {
        this.abortControllers.delete(sessionId)
      }
      return
    }

    this.emit(webContents, sessionId, {
      type: 'routing',
      provider: decision.selected.provider,
      model: decision.selected.model,
      reason: decision.reason,
      mode: decision.mode,
    })

    const history = this.buildAgentHistory(sessionService.getMessages(sessionId), attachments)

    const notifyFileChanged = (absolutePath: string) => {
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send(IPC_EVENTS.FILE_CHANGED, {
          path: absolutePath,
          relativePath: workspaceService.getRelativePath(absolutePath),
        })
      }
    }

    const contextPaths = [
      ...(params.contextPaths ?? []),
      ...attachments.map((a) => a.path),
    ]
    const rulesPrompt = await rulesService.buildPrompt(contextPaths)
    const permissions = {
      ...DEFAULT_AGENT_PERMISSIONS,
      ...settings.agent.permissions,
    }
    const runLimited = createConcurrencyLimiter(settings.agent.maxSubagents ?? 3)
    const userPromptForMemory = content

    let lastError = ''
    try {
      for (let attempt = 0; attempt < decision.queue.length; attempt++) {
        if (abortController.signal.aborted) {
          this.emit(webContents, sessionId, { type: 'error', message: 'Cancelled' })
          return
        }

        const candidate = decision.queue[attempt]!
        const runtime = isE2eMock
          ? firstRuntime
          : runtimeFromCandidate(candidate, settings)
        if (!runtime.apiKey && !isE2eMock) {
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

        const outcome = await this.runOrchestratorAttempt({
          webContents,
          sessionId,
          root,
          history,
          runtime,
          isE2eMock,
          settings,
          abortController,
          rulesPrompt,
          skillPrompt,
          permissions,
          runLimited,
          notifyFileChanged,
        })

        if (outcome.status === 'ok') {
          const usagePayload = await recordLlmTurn({
            settings,
            sessionId,
            provider: runtime.provider,
            model: runtime.model,
            mode: 'agent',
            latencyMs: outcome.latencyMs,
            usage: outcome.usage,
          })
          const saved = sessionService.addMessage(sessionId, {
            sessionId,
            role: 'assistant',
            content: outcome.assistantContent,
            toolCalls: outcome.toolCalls.length > 0 ? outcome.toolCalls : undefined,
          })
          this.emit(webContents, sessionId, {
            type: 'done',
            messageId: saved.id,
            usage: usagePayload,
          })
          void hooksService.onAgentComplete(sessionId)

          if (settings.agent.autoMemory && outcome.assistantContent.trim()) {
            const note = `${userPromptForMemory.slice(0, 100)} → ${outcome.assistantContent.slice(0, 180)}`
            void appendMemoryNote(root, note).catch(() => undefined)
          }
          return
        }

        if (isConnectionError(outcome.error)) {
          noteProviderConnectionFailure(runtime.provider, settings)
        }
        lastError = formatLlmConnectionError(runtime.provider, outcome.error)
        const canRetry =
          !outcome.toolsStarted &&
          attempt < decision.queue.length - 1 &&
          (isConnectionError(outcome.error) ||
            isRetryableError(outcome.error) ||
            isRetryableError(lastError)) &&
          !abortController.signal.aborted &&
          !isE2eMock

        if (!canRetry) {
          this.emit(webContents, sessionId, { type: 'error', message: lastError })
          return
        }
      }

      this.emit(webContents, sessionId, {
        type: 'error',
        message: lastError || 'Agent failed',
      })
    } catch (err) {
      const provider = decision.selected.provider
      const message = formatLlmConnectionError(provider, err)
      this.emit(webContents, sessionId, { type: 'error', message })
    } finally {
      this.abortControllers.delete(sessionId)
    }
  }

  private async runOrchestratorAttempt(opts: {
    webContents: WebContents
    sessionId: string
    root: string
    history: AgentMessage[]
    runtime: LlmRuntimeConfig
    isE2eMock: boolean
    settings: ReturnType<typeof settingsService.get>
    abortController: AbortController
    rulesPrompt: string
    skillPrompt: string | undefined
    permissions: typeof DEFAULT_AGENT_PERMISSIONS
    runLimited: ReturnType<typeof createConcurrencyLimiter>
    notifyFileChanged: (absolutePath: string) => void
  }): Promise<
    | {
        status: 'ok'
        assistantContent: string
        toolCalls: ToolCallRecord[]
        usage?: { inputTokens: number; outputTokens: number; cachedInputTokens: number }
        latencyMs: number
      }
    | { status: 'error'; error: string; toolsStarted: boolean }
  > {
    const {
      webContents,
      sessionId,
      root,
      history,
      runtime,
      isE2eMock,
      settings,
      abortController,
      rulesPrompt,
      skillPrompt,
      permissions,
      runLimited,
      notifyFileChanged,
    } = opts

    const llm = isE2eMock ? createE2eMockAgentProvider() : getProviderInstance(runtime.provider)
    this.orchestrator = new AgentOrchestrator(llm, defaultToolRegistry)

    let assistantContent = ''
    const toolCalls: ToolCallRecord[] = []
    let toolsStarted = false
    let usage: { inputTokens: number; outputTokens: number; cachedInputTokens: number } | undefined
    const startedAt = Date.now()

    try {
      for await (const event of this.orchestrator.run(history, {
        workspaceRoot: root,
        sessionId,
        modelId: runtime.model,
        apiKey: runtime.apiKey,
        baseUrl: runtime.baseUrl,
        maxIterations: settings.agent.maxIterations,
        enabledTools: ALL_AGENT_TOOLS,
        yoloMode: isE2eMock ? false : settings.agent.yoloMode,
        permissions,
        compactTokenThreshold: settings.agent.compactTokenThreshold,
        maxTokens: settings.cost?.maxOutputTokensAgent ?? 8192,
        enablePromptCache: settings.cost?.enablePromptCache !== false,
        signal: abortController.signal,
        resolvePath: (p) => workspaceService.resolveWithinWorkspace(p),
        getRelativePath: (p) => workspaceService.getRelativePath(p),
        onFileChanged: notifyFileChanged,
        rulesPrompt,
        skillPrompt,
        subagentDepth: 0,
        runSubagent: async ({ prompt, description }) => {
          const result = await runLimited(() =>
            runSubagentTask({
              prompt,
              description,
              workspaceRoot: root,
              sessionId,
              modelId: runtime.model,
              apiKey: runtime.apiKey,
              baseUrl: runtime.baseUrl,
              signal: abortController.signal,
              llm,
              registry: defaultToolRegistry,
              resolvePath: (p) => workspaceService.resolveWithinWorkspace(p),
              getRelativePath: (p) => workspaceService.getRelativePath(p),
              rulesPrompt,
              parentDepth: 0,
            }),
          )
          return {
            success: result.success,
            output: result.output,
            metadata: { description: result.description },
          }
        },
        runTeam: async ({ teamId, prompt }) => {
          const teams = await collectTeams(root)
          const team = findTeam(teams, teamId)
          if (!team) {
            return { success: false, output: `Error: unknown team "${teamId}"` }
          }
          const result = await runTeam({
            workspaceRoot: root,
            team,
            task: prompt,
            modelId: runtime.model,
            apiKey: runtime.apiKey,
            baseUrl: runtime.baseUrl,
            signal: abortController.signal,
            llm,
            registry: defaultToolRegistry,
            resolvePath: (p) => workspaceService.resolveWithinWorkspace(p),
            getRelativePath: (p) => workspaceService.getRelativePath(p),
            rulesPrompt,
            maxConcurrency: settings.agent.maxSubagents ?? 3,
          })
          return {
            success: result.success,
            output: `${result.synthesis}\n\n(Board: ${result.boardPath})`,
            metadata: { teamId: result.teamId, boardPath: result.boardPath },
          }
        },
        getShellEnv: () => agentEnvService.resolve(root),
        requestApproval: async (request: ApprovalRequest) => {
          this.emit(webContents, sessionId, {
            type: 'approval_required',
            toolCallId: request.toolCallId,
            tool: request.tool,
            path: request.path,
            relativePath: request.relativePath,
            oldContent: request.oldContent,
            newContent: request.newContent,
            summary: request.summary,
            action: request.action,
          })
          return approvalService.waitForApproval(sessionId, request.toolCallId)
        },
      })) {
        if (event.type === 'text_delta') {
          assistantContent += event.content
          this.emit(webContents, sessionId, { type: 'text_delta', content: event.content })
        } else if (event.type === 'tool_call_start') {
          toolsStarted = true
          toolCalls.push({
            id: event.toolCallId,
            name: event.tool,
            args: event.args,
            status: 'running',
          })
          this.emit(webContents, sessionId, {
            type: 'tool_call_start',
            toolCallId: event.toolCallId,
            tool: event.tool,
            args: event.args,
          })
        } else if (event.type === 'tool_call_result') {
          toolsStarted = true
          const tc = toolCalls.find((t) => t.id === event.toolCallId)
          if (tc) {
            tc.result = event.result
            tc.status = event.success ? 'done' : 'error'
          }
          this.emit(webContents, sessionId, {
            type: 'tool_call_result',
            toolCallId: event.toolCallId,
            tool: event.tool,
            result: event.result,
            success: event.success,
            filePath: typeof event.filePath === 'string' ? event.filePath : undefined,
          })
        } else if (event.type === 'error') {
          return { status: 'error', error: event.message, toolsStarted }
        } else if (event.type === 'done') {
          usage = event.usage
          break
        }
      }

      return {
        status: 'ok',
        assistantContent,
        toolCalls,
        usage,
        latencyMs: Date.now() - startedAt,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Agent failed'
      return { status: 'error', error: message, toolsStarted }
    }
  }

  private buildAgentHistory(messages: Message[], latestAttachments: Attachment[]): AgentMessage[] {
    const agentMessages: AgentMessage[] = []

    for (const msg of messages) {
      if (msg.role === 'user') {
        let content = msg.content
        if (msg.attachments?.length) {
          const attachmentText = msg.attachments
            .filter((a) => a.content)
            .map((a) => `\n\n--- Attached file: ${a.name} (${a.path}) ---\n${a.content}\n--- End ---`)
            .join('')
          if (attachmentText) content += attachmentText
        }
        agentMessages.push({ role: 'user', content })
      } else if (msg.role === 'assistant') {
        if (msg.toolCalls?.length) {
          agentMessages.push({
            role: 'assistant',
            content: msg.content,
            tool_calls: msg.toolCalls.map((tc) => ({
              id: tc.id,
              name: tc.name,
              arguments: (tc.args ?? {}) as Record<string, unknown>,
            })),
          })
          for (const tc of msg.toolCalls) {
            if (tc.result !== undefined) {
              agentMessages.push({
                role: 'tool',
                tool_call_id: tc.id,
                content: tc.result,
              })
            }
          }
        } else {
          agentMessages.push({ role: 'assistant', content: msg.content })
        }
      }
    }

    if (latestAttachments.length > 0) {
      const last = agentMessages[agentMessages.length - 1]
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

    return sanitizeToolMessagePairs(agentMessages)
  }

  private updateSessionTitle(sessionId: string, content: string): void {
    const title = content.slice(0, 40) + (content.length > 40 ? '...' : '')
    sessionService.updateTitle(sessionId, title)
  }

  private emit(webContents: WebContents, sessionId: string, event: ChatStreamEvent): void {
    webContents.send(IPC_EVENTS.CHAT_STREAM, { sessionId, ...event })
  }
}

export const agentService = new AgentService()
