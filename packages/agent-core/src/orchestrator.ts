import type { LLMProvider, AgentMessage, ToolCall } from '@codex/llm-adapters'
import type { ApprovalRequest } from '@codex/shared'
import type { ToolRegistry } from '@codex/tools'
import type { ToolContext } from '@codex/tools'
import { trimAgentHistory } from './context-builder'
import { loadRules } from './rules-loader'

export interface AgentRunContext {
  workspaceRoot: string
  sessionId: string
  modelId: string
  apiKey: string
  baseUrl?: string
  maxIterations: number
  enabledTools: string[]
  yoloMode: boolean
  signal: AbortSignal
  resolvePath: (path: string) => string
  getRelativePath: (absolutePath: string) => string
  onFileChanged?: (absolutePath: string) => void
  requestApproval?: (request: ApprovalRequest) => Promise<boolean>
  /** Prebuilt rules prompt (global + workspace). Falls back to workspace .codex/rules only. */
  rulesPrompt?: string
}

export type AgentOrchestratorEvent =
  | { type: 'text_delta'; content: string }
  | { type: 'tool_call_start'; toolCallId: string; tool: string; args: unknown }
  | { type: 'tool_call_result'; toolCallId: string; tool: string; result: string; success: boolean; filePath?: string }
  | { type: 'approval_required'; request: ApprovalRequest }
  | { type: 'done' }
  | { type: 'error'; message: string }

const buildSystemPrompt = (workspaceRoot: string, rules: string) => `You are Codex Studio, an AI coding assistant with access to tools for reading, searching, and modifying the codebase.

Workspace root: ${workspaceRoot}

Tools available:
- Read, Grep, Glob — inspect and search the codebase
- Write, StrReplace, Delete — modify files (requires user approval)
- Shell — run commands (requires user approval)

For code questions, use Read/Grep/Glob first. To make changes, use Write or StrReplace.
Use workspace-relative paths (e.g. README.md, packages/app/src/main/index.ts).
Respond in the user's language (Japanese or English). Use markdown for formatting.${rules}`

export class AgentOrchestrator {
  constructor(
    private llm: LLMProvider,
    private registry: ToolRegistry,
  ) {}

  async *run(
    history: AgentMessage[],
    ctx: AgentRunContext,
  ): AsyncGenerator<AgentOrchestratorEvent> {
    const rules = ctx.rulesPrompt ?? (await loadRules(ctx.workspaceRoot))
    let messages: AgentMessage[] = [
      { role: 'system', content: buildSystemPrompt(ctx.workspaceRoot, rules) },
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
    }

    for (let i = 0; i < ctx.maxIterations; i++) {
      if (ctx.signal.aborted) {
        yield { type: 'error', message: 'Cancelled' }
        return
      }

      messages = trimAgentHistory(messages)

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

      for (const call of pendingToolCalls) {
        yield {
          type: 'tool_call_start',
          toolCallId: call.id,
          tool: call.name,
          args: call.arguments,
        }

        const tool = this.registry.get(call.name)
        const needsApproval = tool?.requiresApproval && !ctx.yoloMode

        let result
        if (needsApproval) {
          const preview = await this.registry.execute(call.name, call.arguments, {
            ...baseToolCtx,
            executeMode: 'preview',
          })

          if (!preview.success) {
            result = preview
          } else {
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

            yield { type: 'approval_required', request: approvalReq }

            const approved = ctx.requestApproval
              ? await ctx.requestApproval(approvalReq)
              : false

            if (!approved) {
              result = { success: false, output: 'Error: user rejected the change' }
            } else {
              result = await this.registry.execute(call.name, call.arguments, {
                ...baseToolCtx,
                executeMode: 'apply',
              })
            }
          }
        } else {
          result = await this.registry.execute(call.name, call.arguments, {
            ...baseToolCtx,
            executeMode: 'apply',
          })
        }

        yield {
          type: 'tool_call_result',
          toolCallId: call.id,
          tool: call.name,
          result: result.output,
          success: result.success,
          filePath: typeof result.metadata?.path === 'string' ? result.metadata.path : undefined,
        }

        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: result.output,
        })
      }
    }

    yield {
      type: 'error',
      message: `ツール呼び出しの上限（${ctx.maxIterations}回）に達しました。設定の「最大イテレーション」を引き上げて再実行してください。`,
    }
  }
}
