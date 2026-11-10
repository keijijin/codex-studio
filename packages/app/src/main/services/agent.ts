import { BrowserWindow } from 'electron'
import { AgentOrchestrator } from '@codex/agent-core'
import type { AgentMessage } from '@codex/llm-adapters'
import { getProviderInstance, isConnectionError, isRetryableError } from '@codex/llm-adapters'
import { createWorkspaceFs, defaultToolRegistry } from '@codex/tools'
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
import { langfuseService } from './langfuse-service'
import { approvalService } from './approval'
import { ceoApprovalService } from './ceo-approval'
import { agentEnvService } from './agent-env-service'
import { createE2eMockAgentProvider } from './e2e-mock-agent'
import {
  effectiveCompactTokenBudget,
  effectiveMaxOutputTokens,
  effectiveMaxSubagents,
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
  runSubagentTask,
  sanitizeToolMessagePairs,
} from '@codex/agent-core'
import { DEFAULT_AGENT_PERMISSIONS, type TurnTrace } from '@codex/shared'
import { skillsService } from './skills-service'
import { personasService } from './personas-service'
import { teamsService } from './teams-service'
import { rulesService } from './rules-service'
import { hooksService } from './hooks-service'
import { fileWatcherService } from './file-watcher'
import { sessionService, settingsService } from './settings'
import { workspaceService } from './workspace'
import { workspaceTrustService } from './workspace-trust'
import { pathIgnoreService } from './path-ignore-service'
import { assertUnderDailyBudget, recordLlmTurn } from './usage-helpers'
import { formatAttachments, materializeAttachments } from './attachment-context'
import { mcpService } from './mcp-service'

const ALL_AGENT_TOOLS = [
  'Read',
  'Grep',
  'Glob',
  'GitStatus',
  'Write',
  'StrReplace',
  'Delete',
  'Shell',
  'Task',
  'Team',
  'WebSearch',
  'MemoryAppend',
  'GenerateVideo',
  'GeneratePresentation',
  '*mcp*',
]

const PLAN_TOOLS = ['Read', 'Grep', 'Glob', 'GitStatus'] as const

const PLAN_PERMISSIONS = {
  read: 'allow' as const,
  edit: 'deny' as const,
  shell: 'deny' as const,
  network: 'deny' as const,
  media: 'deny' as const,
  mcp: 'deny' as const,
}

export class AgentService {
  private abortControllers = new Map<string, AbortController>()
  private orchestrator = new AgentOrchestrator(getProviderInstance('openai'), defaultToolRegistry)

  cancel(sessionId: string): void {
    this.abortControllers.get(sessionId)?.abort()
    this.abortControllers.delete(sessionId)
    approvalService.cancelAll(sessionId)
    ceoApprovalService.cancelAll(sessionId)
  }

  respondApproval(sessionId: string, toolCallId: string, approved: boolean): void {
    approvalService.respond(sessionId, toolCallId, approved)
  }

  respondCeoApproval(
    sessionId: string,
    approvalId: string,
    response: import('@codex/shared').CeoApprovalResponse,
  ): void {
    teamsService.respondCeoApproval(sessionId, approvalId, response)
  }

  async run(params: ChatSendParams, webContents: WebContents): Promise<void> {
    const { sessionId } = params
    let content = params.content
    const isPlan = params.mode === 'plan'
    const attachments = await materializeAttachments(params.attachments ?? [], content)
    const settings = settingsService.get()
    const root = workspaceService.getRoot()

    // Refresh MCP tools (best-effort; failures surface in MCP status)
    if (!isPlan && (settings.mcpServers?.length ?? 0) > 0) {
      try {
        await mcpService.syncFromSettings(settings.mcpServers)
      } catch (err) {
        console.warn('[agent] MCP sync failed', err)
      }
    }

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

    let personaPrompt: string | undefined
    let activePersona: { id: string; name: string } | undefined
    const session = sessionService.getSession(sessionId)
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
      personaPrompt = personasService.formatPrompt(personaMatch.persona)
      activePersona = { id: personaMatch.persona.id, name: personaMatch.persona.name }
      sessionService.setPersona(sessionId, personaMatch.persona.name)
      content = personaMatch.args || personasService.formatUserMessage(personaMatch.persona, '')
    } else {
      const stickyOrDefault =
        (await personasService.resolveDefault(session?.personaName)) ??
        (await personasService.resolveDefault(settings.agent.defaultPersona))
      if (stickyOrDefault) {
        personaPrompt = personasService.formatPrompt(stickyOrDefault)
        activePersona = { id: stickyOrDefault.id, name: stickyOrDefault.name }
      }
    }

    // Prefer explicit /team, then skill names that alias a team (e.g. /virtual-company).
    // Plan mode is read-only planning — skip Team execution.
    let teamMatch = isPlan ? null : await teamsService.matchInvocation(content)
    let skillPrompt: string | undefined
    if (!teamMatch && !isPlan) {
      const skillMatch = await skillsService.matchInvocation(content)
      if (skillMatch) {
        const asTeam = await teamsService.matchSkillAsTeam(
          skillMatch.skill.name,
          skillMatch.args,
        )
        if (asTeam) {
          teamMatch = asTeam
        } else {
          skillPrompt = formatSkillPrompt(skillMatch.skill, skillMatch.args)
          content = formatSkillUserMessage(skillMatch.skill, skillMatch.args)
        }
      }
    }
    if (teamMatch) {
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
        const notifyFileChanged = (absolutePath: string) => {
          fileWatcherService.notifyTreeChanged()
          for (const win of BrowserWindow.getAllWindows()) {
            win.webContents.send(IPC_EVENTS.FILE_CHANGED, {
              path: absolutePath,
              relativePath: workspaceService.getRelativePath(absolutePath),
            })
          }
        }
        const notifyWorkspaceChanged = () => {
          fileWatcherService.notifyTreeChanged()
        }
        const result = await teamsService.run(
          teamMatch.team.id,
          teamMatch.args || 'Review this workspace',
          abortController.signal,
          {
            sessionId,
            emit: (event) => {
              if (event.type === 'team_stage') {
                this.emit(webContents, sessionId, {
                  type: 'team_stage',
                  stage: event.stage as import('@codex/shared').TeamPipelineStage,
                  teamId: String(event.teamId),
                  detail: typeof event.detail === 'string' ? event.detail : undefined,
                })
              } else if (event.type === 'ceo_approval_required') {
                this.emit(webContents, sessionId, {
                  type: 'ceo_approval_required',
                  request: event.request as import('@codex/shared').CeoApprovalRequest,
                })
              }
            },
            onFileChanged: notifyFileChanged,
            onWorkspaceChanged: notifyWorkspaceChanged,
            requestToolApproval: async (request) => {
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
          },
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
        if (this.abortControllers.get(sessionId) === abortController) {
          this.abortControllers.delete(sessionId)
        }
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
    if (activePersona) {
      this.emit(webContents, sessionId, {
        type: 'persona_applied',
        personaId: activePersona.id,
        personaName: activePersona.name,
      })
    }

    const history = this.buildAgentHistory(sessionService.getMessages(sessionId), attachments)

    const notifyFileChanged = (absolutePath: string) => {
      fileWatcherService.notifyTreeChanged()
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send(IPC_EVENTS.FILE_CHANGED, {
          path: absolutePath,
          relativePath: workspaceService.getRelativePath(absolutePath),
        })
      }
    }
    const notifyWorkspaceChanged = () => {
      fileWatcherService.notifyTreeChanged()
    }

    const contextPaths = [
      ...(params.contextPaths ?? []),
      ...attachments.map((a) => a.path),
    ]
    const rulesPrompt = await rulesService.buildPrompt(contextPaths)
    const trusted = workspaceTrustService.isTrusted(root)
    // U-1 / U-2: untrusted → secret Read deny, network never allow (ask unless already deny)
    const secretReadPolicy = trusted ? ('ask' as const) : ('deny' as const)
    const basePermissions = isPlan
      ? { ...PLAN_PERMISSIONS }
      : {
          ...DEFAULT_AGENT_PERMISSIONS,
          ...settings.agent.permissions,
        }
    const permissions = isPlan
      ? basePermissions
      : {
          ...basePermissions,
          network: trusted
            ? basePermissions.network
            : basePermissions.network === 'deny'
              ? 'deny'
              : 'ask',
        }
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

        const runLimited = createConcurrencyLimiter(
          effectiveMaxSubagents(settings, runtime.provider),
        )
        const outcome = await this.runOrchestratorAttempt({
          webContents,
          sessionId,
          root,
          history,
          userInput: content,
          runtime,
          isE2eMock,
          settings,
          abortController,
          rulesPrompt,
          skillPrompt,
          personaPrompt,
          permissions,
          secretReadPolicy,
          enabledTools: isPlan ? [...PLAN_TOOLS] : ALL_AGENT_TOOLS,
          planMode: isPlan,
          runLimited,
          notifyFileChanged,
          notifyWorkspaceChanged,
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
          const trace: TurnTrace = {
            personaId: activePersona?.id,
            personaName: activePersona?.name,
            provider: runtime.provider,
            model: runtime.model,
            routeReason: decision.reason,
            usage: usagePayload,
            toolCount: outcome.toolCalls.length,
          }
          const saved = sessionService.addMessage(sessionId, {
            sessionId,
            role: 'assistant',
            content: outcome.assistantContent,
            toolCalls: outcome.toolCalls.length > 0 ? outcome.toolCalls : undefined,
            trace,
          })
          this.emit(webContents, sessionId, {
            type: 'done',
            messageId: saved.id,
            usage: usagePayload,
            trace,
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
      // Only clear if we still own the slot (a newer run may have replaced us).
      if (this.abortControllers.get(sessionId) === abortController) {
        this.abortControllers.delete(sessionId)
      }
    }
  }

  private async runOrchestratorAttempt(opts: {
    webContents: WebContents
    sessionId: string
    root: string
    history: AgentMessage[]
    userInput: string
    runtime: LlmRuntimeConfig
    isE2eMock: boolean
    settings: ReturnType<typeof settingsService.get>
    abortController: AbortController
    rulesPrompt: string
    skillPrompt: string | undefined
    personaPrompt: string | undefined
    permissions: typeof DEFAULT_AGENT_PERMISSIONS
    secretReadPolicy?: 'allow' | 'ask' | 'deny'
    enabledTools: string[]
    planMode?: boolean
    runLimited: ReturnType<typeof createConcurrencyLimiter>
    notifyFileChanged: (absolutePath: string) => void
    notifyWorkspaceChanged: () => void
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
      userInput,
      runtime,
      isE2eMock,
      settings,
      abortController,
      rulesPrompt,
      skillPrompt,
      personaPrompt,
      permissions,
      secretReadPolicy,
      enabledTools,
      planMode,
      runLimited,
      notifyFileChanged,
      notifyWorkspaceChanged,
    } = opts

    const llm = isE2eMock ? createE2eMockAgentProvider() : getProviderInstance(runtime.provider)
    this.orchestrator = new AgentOrchestrator(llm, defaultToolRegistry)

    let assistantContent = ''
    const toolCalls: ToolCallRecord[] = []
    let toolsStarted = false
    let usage: { inputTokens: number; outputTokens: number; cachedInputTokens: number } | undefined
    const startedAt = Date.now()
    const agentTrace = langfuseService.startAgentTrace({
      sessionId,
      input: userInput,
      provider: runtime.provider,
      model: runtime.model,
      planMode: Boolean(planMode),
      settings,
    })

    try {
      for await (const event of this.orchestrator.run(history, {
        workspaceRoot: root,
        sessionId,
        modelId: runtime.model,
        apiKey: runtime.apiKey,
        baseUrl: runtime.baseUrl,
        maxIterations: settings.agent.maxIterations,
        enabledTools,
        yoloMode: isE2eMock || planMode ? false : settings.agent.yoloMode,
        permissions,
        secretReadPolicy: secretReadPolicy ?? 'ask',
        planMode: Boolean(planMode),
        compactTokenThreshold: effectiveCompactTokenBudget(
          settings,
          runtime.provider,
          'agent',
        ),
        maxTokens: effectiveMaxOutputTokens(settings, runtime.provider, 'agent'),
        enablePromptCache: settings.cost?.enablePromptCache !== false,
        signal: abortController.signal,
        fs: createWorkspaceFs(workspaceService.getRoots()),
        resolvePath: (p) => workspaceService.resolveWithinWorkspace(p),
        getRelativePath: (p) => workspaceService.getRelativePath(p),
        isIgnoredPath: (rel) => pathIgnoreService.getRules().ignores(rel),
        onFileChanged: notifyFileChanged,
        onWorkspaceChanged: notifyWorkspaceChanged,
        rulesPrompt,
        skillPrompt,
        personaPrompt,
        observability: agentTrace?.hooks,
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
          const result = await teamsService.run(teamId, prompt, abortController.signal, {
            sessionId,
            emit: (event) => {
              if (event.type === 'team_stage') {
                this.emit(webContents, sessionId, {
                  type: 'team_stage',
                  stage: event.stage as import('@codex/shared').TeamPipelineStage,
                  teamId: String(event.teamId),
                  detail: typeof event.detail === 'string' ? event.detail : undefined,
                })
              } else if (event.type === 'ceo_approval_required') {
                this.emit(webContents, sessionId, {
                  type: 'ceo_approval_required',
                  request: event.request as import('@codex/shared').CeoApprovalRequest,
                })
              }
            },
            onFileChanged: notifyFileChanged,
            onWorkspaceChanged: notifyWorkspaceChanged,
            requestToolApproval: async (request) => {
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
          })
          return {
            success: result.success,
            output: `${result.synthesis}\n\n(Board: ${result.boardPath})`,
            metadata: {
              teamId: result.teamId,
              boardPath: result.boardPath,
              ceoDecision: result.ceoDecision,
              stages: result.stagesCompleted,
            },
          }
        },
        getShellEnv: () => agentEnvService.resolve(root),
        getVideoConfig: () => {
          const s = settingsService.get()
          return {
            video: s.video,
            openaiApiKey: s.models.openaiApiKey || process.env.OPENAI_API_KEY,
            runwayApiKey:
              s.video?.runwayApiKey ||
              process.env.RUNWAYML_API_SECRET ||
              process.env.RUNWAY_API_KEY,
          }
        },
        getPresentationConfig: () => {
          const s = settingsService.get()
          return {
            presentation: s.presentation,
            openaiApiKey: s.models.openaiApiKey || process.env.OPENAI_API_KEY,
          }
        },
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
          agentTrace?.end({
            output: assistantContent,
            model: runtime.model,
            provider: runtime.provider,
            usage,
            error: event.message,
            toolCount: toolCalls.length,
          })
          return { status: 'error', error: event.message, toolsStarted }
        } else if (event.type === 'done') {
          usage = event.usage
          break
        }
      }

      agentTrace?.end({
        output: assistantContent,
        model: runtime.model,
        provider: runtime.provider,
        usage,
        toolCount: toolCalls.length,
      })
      return {
        status: 'ok',
        assistantContent,
        toolCalls,
        usage,
        latencyMs: Date.now() - startedAt,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Agent failed'
      agentTrace?.end({
        output: assistantContent,
        model: runtime.model,
        provider: runtime.provider,
        usage,
        error: message,
        toolCount: toolCalls.length,
      })
      return { status: 'error', error: message, toolsStarted }
    }
  }

  private buildAgentHistory(messages: Message[], latestAttachments: Attachment[]): AgentMessage[] {
    const agentMessages: AgentMessage[] = []

    for (const msg of messages) {
      if (msg.role === 'user') {
        let content = msg.content
        if (msg.attachments?.length) {
          const attachmentText = formatAttachments(msg.attachments)
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
        const extra = formatAttachments(latestAttachments)
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
