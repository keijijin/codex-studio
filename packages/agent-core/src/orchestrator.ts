import type { LLMProvider, AgentMessage, ToolCall } from '@codex/llm-adapters'
import type { AgentPermissions, ApprovalRequest } from '@codex/shared'
import { DEFAULT_AGENT_PERMISSIONS, permissionForTool } from '@codex/shared'
import type { ToolRegistry, ToolResult } from '@codex/tools'
import type { ToolContext } from '@codex/tools'
import { estimateMessagesTokens, trimAgentHistory } from './context-builder'
import { loadProjectContext } from './project-context'
import { loadRules } from './rules-loader'
import { loadMemory } from './memory'
import { detectReplyLanguage, formatLanguageInstruction } from './language'

export interface AgentRunContext {
  workspaceRoot: string
  sessionId: string
  modelId: string
  apiKey: string
  baseUrl?: string
  maxIterations: number
  enabledTools: string[]
  yoloMode: boolean
  permissions?: AgentPermissions
  /** Auto-compact when estimated history tokens exceed this (0 = use default budget only) */
  compactTokenThreshold?: number
  signal: AbortSignal
  resolvePath: (path: string) => string
  getRelativePath: (absolutePath: string) => string
  onFileChanged?: (absolutePath: string) => void
  requestApproval?: (request: ApprovalRequest) => Promise<boolean>
  /** Prebuilt rules + project context + memory prompt. */
  rulesPrompt?: string
  /** Extra system instructions from an invoked Skill */
  skillPrompt?: string
  /** Nested subagent depth (0 = top-level parent) */
  subagentDepth?: number
  /** Wired for Task tool */
  runSubagent?: (params: {
    prompt: string
    description?: string
  }) => Promise<ToolResult>
  /** Wired for Team tool (Phase D local teams) */
  runTeam?: (params: {
    teamId: string
    prompt: string
  }) => Promise<ToolResult>
}

export type AgentOrchestratorEvent =
  | { type: 'text_delta'; content: string }
  | { type: 'tool_call_start'; toolCallId: string; tool: string; args: unknown }
  | { type: 'tool_call_result'; toolCallId: string; tool: string; result: string; success: boolean; filePath?: string }
  | { type: 'approval_required'; request: ApprovalRequest }
  | { type: 'done' }
  | { type: 'error'; message: string }

const buildSystemPrompt = (
  workspaceRoot: string,
  rules: string,
  skillPrompt?: string,
  languageBlock = '',
  isSubagent = false,
) => {
  const skillBlock = skillPrompt ? `\n\n${skillPrompt}` : ''
  if (isSubagent) {
    return `You are a read-only Codex Studio subagent.

Workspace root: ${workspaceRoot}

You may only use Read, Grep, and Glob. Do not attempt to modify files or run shell commands.
Return a concise factual report for the parent agent.
Use markdown for formatting.${languageBlock}${rules}${skillBlock}`
  }

  return `You are Codex Studio, an AI coding assistant with access to tools for reading, searching, and modifying the codebase.

Workspace root: ${workspaceRoot}

Tools available:
- Read, Grep, Glob — inspect and search the codebase
- Write, StrReplace, Delete — modify files (subject to permission policy)
- Shell — run commands (subject to permission policy)
- Task — spawn a read-only subagent for a focused investigation (parallel Tasks allowed)
- Team — run a local multi-role team from .codex/teams/ (shared BOARD.md)
- WebSearch — search the public web for external docs / errors
- MemoryAppend — append durable project notes to .codex/memory/MEMORY.md

For code questions, use Read/Grep/Glob first. For independent research threads, spawn Task subagents then synthesize.
For multi-perspective reviews, prefer Team when a matching team exists.
To make changes, use Write or StrReplace.
Use workspace-relative paths (e.g. README.md, packages/app/src/main/index.ts).
Use markdown for formatting.${languageBlock}${rules}${skillBlock}`
}

function resolvePermission(
  toolName: string,
  yoloMode: boolean,
  permissions: AgentPermissions,
): 'allow' | 'ask' | 'deny' {
  if (yoloMode) return 'allow'
  return permissionForTool(toolName, permissions)
}

function isTaskTool(name: string): boolean {
  return name === 'Task' || name.toLowerCase() === 'task'
}

export class AgentOrchestrator {
  constructor(
    private llm: LLMProvider,
    private registry: ToolRegistry,
  ) {}

  async *run(
    history: AgentMessage[],
    ctx: AgentRunContext,
  ): AsyncGenerator<AgentOrchestratorEvent> {
    const permissions = ctx.permissions ?? DEFAULT_AGENT_PERMISSIONS
    const depth = ctx.subagentDepth ?? 0
    let rules = ctx.rulesPrompt
    if (rules === undefined) {
      const [rulesText, projectCtx, memory] = await Promise.all([
        loadRules(ctx.workspaceRoot),
        loadProjectContext(ctx.workspaceRoot),
        loadMemory(ctx.workspaceRoot),
      ])
      rules = `${rulesText}${projectCtx}${memory}`
    }

    const lastUserText = [...history].reverse().find((m) => m.role === 'user')?.content ?? ''
    const languageBlock = formatLanguageInstruction(detectReplyLanguage(lastUserText))

    let messages: AgentMessage[] = [
      {
        role: 'system',
        content: buildSystemPrompt(
          ctx.workspaceRoot,
          rules,
          ctx.skillPrompt,
          languageBlock,
          depth > 0,
        ),
      },
      ...history,
    ]

    const tools = this.registry.list(ctx.enabledTools)
    const baseToolCtx: Omit<ToolContext, 'executeMode'> = {
      workspaceRoot: ctx.workspaceRoot,
      sessionId: ctx.sessionId,
      signal: ctx.signal,
      resolvePath: ctx.resolvePath,
      getRelativePath: ctx.getRelativePath,
      onFileChanged: ctx.onFileChanged,
      subagentDepth: depth,
      runSubagent: ctx.runSubagent,
      runTeam: ctx.runTeam,
    }

    const budget =
      ctx.compactTokenThreshold && ctx.compactTokenThreshold > 0
        ? ctx.compactTokenThreshold
        : undefined

    for (let i = 0; i < ctx.maxIterations; i++) {
      if (ctx.signal.aborted) {
        yield { type: 'error', message: 'Cancelled' }
        return
      }

      if (budget && estimateMessagesTokens(messages) > budget) {
        messages = trimAgentHistory(messages, budget)
      } else {
        messages = trimAgentHistory(messages)
      }

      let assistantText = ''
      let pendingToolCalls: ToolCall[] = []

      for await (const chunk of this.llm.agentChat(messages, {
        model: ctx.modelId,
        apiKey: ctx.apiKey,
        baseUrl: ctx.baseUrl,
        tools,
        signal: ctx.signal,
      })) {
        if (chunk.type === 'text') {
          assistantText += chunk.delta
          yield { type: 'text_delta', content: chunk.delta }
        } else if (chunk.type === 'tool_calls') {
          pendingToolCalls = chunk.calls
        } else if (chunk.type === 'error') {
          yield { type: 'error', message: chunk.error }
          return
        }
      }

      if (pendingToolCalls.length === 0) {
        yield { type: 'done' }
        return
      }

      messages.push({
        role: 'assistant',
        content: assistantText,
        tool_calls: pendingToolCalls,
      })

      const resultsById = new Map<string, { result: ToolResult; tool: string }>()

      const taskCalls = pendingToolCalls.filter((c) => isTaskTool(c.name))
      const otherCalls = pendingToolCalls.filter((c) => !isTaskTool(c.name))

      // Parallel Task subagents (start events first, then await all)
      for (const call of taskCalls) {
        yield {
          type: 'tool_call_start',
          toolCallId: call.id,
          tool: call.name,
          args: call.arguments,
        }
      }

      if (taskCalls.length > 0) {
        const taskResults = await Promise.all(
          taskCalls.map(async (call) => {
            const result = await this.executeToolCall(call, ctx, permissions, baseToolCtx)
            return { call, result }
          }),
        )
        for (const { call, result } of taskResults) {
          resultsById.set(call.id, { result, tool: call.name })
          yield {
            type: 'tool_call_result',
            toolCallId: call.id,
            tool: call.name,
            result: result.output,
            success: result.success,
            filePath: typeof result.metadata?.path === 'string' ? result.metadata.path : undefined,
          }
        }
      }

      for (const call of otherCalls) {
        yield {
          type: 'tool_call_start',
          toolCallId: call.id,
          tool: call.name,
          args: call.arguments,
        }

        const result = await this.executeToolCall(call, ctx, permissions, baseToolCtx)

        resultsById.set(call.id, { result, tool: call.name })

        if (result.metadata?.__approvalRequest) {
          const approvalReq = result.metadata.__approvalRequest as ApprovalRequest
          yield { type: 'approval_required', request: approvalReq }
          const approved = ctx.requestApproval
            ? await ctx.requestApproval(approvalReq)
            : false
          const applied = approved
            ? await this.registry.execute(call.name, call.arguments, {
                ...baseToolCtx,
                executeMode: 'apply',
              })
            : { success: false, output: 'Error: user rejected the change' }
          resultsById.set(call.id, { result: applied, tool: call.name })
          yield {
            type: 'tool_call_result',
            toolCallId: call.id,
            tool: call.name,
            result: applied.output,
            success: applied.success,
            filePath: typeof applied.metadata?.path === 'string' ? applied.metadata.path : undefined,
          }
        } else {
          yield {
            type: 'tool_call_result',
            toolCallId: call.id,
            tool: call.name,
            result: result.output,
            success: result.success,
            filePath: typeof result.metadata?.path === 'string' ? result.metadata.path : undefined,
          }
        }
      }

      // Preserve tool message order matching the model's tool_calls list
      for (const call of pendingToolCalls) {
        const entry = resultsById.get(call.id)
        const content = entry?.result.output ?? 'Error: missing tool result'
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content,
        })
      }
    }

    yield {
      type: 'error',
      message: `ツール呼び出しの上限（${ctx.maxIterations}回）に達しました。設定の「最大イテレーション」を引き上げて再実行してください。`,
    }
  }

  private async executeToolCall(
    call: ToolCall,
    ctx: AgentRunContext,
    permissions: AgentPermissions,
    baseToolCtx: Omit<ToolContext, 'executeMode'>,
  ): Promise<ToolResult> {
    const tool = this.registry.get(call.name)
    const perm = resolvePermission(call.name, ctx.yoloMode, permissions)

    if (perm === 'deny') {
      return {
        success: false,
        output: `Error: tool "${call.name}" is denied by permission policy`,
      }
    }

    if (perm === 'ask' && tool?.requiresApproval) {
      const preview = await this.registry.execute(call.name, call.arguments, {
        ...baseToolCtx,
        executeMode: 'preview',
      })

      if (!preview.success) {
        return preview
      }

      const meta = preview.metadata ?? {}
      const approvalReq: ApprovalRequest = {
        toolCallId: call.id,
        tool: call.name,
        path: String(meta.path ?? ''),
        relativePath: String(meta.relativePath ?? meta.path ?? call.name),
        oldContent: String(meta.oldContent ?? ''),
        newContent: String(meta.newContent ?? ''),
        summary: preview.output,
        action: meta.action as ApprovalRequest['action'],
      }

      return {
        success: true,
        output: preview.output,
        metadata: { ...meta, __approvalRequest: approvalReq },
      }
    }

    return this.registry.execute(call.name, call.arguments, {
      ...baseToolCtx,
      executeMode: 'apply',
    })
  }
}
