import { BrowserWindow } from 'electron'
import { AgentOrchestrator } from '@codex/agent-core'
import type { AgentMessage } from '@codex/llm-adapters'
import { getProviderInstance } from '@codex/llm-adapters'
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
import { createE2eMockAgentProvider } from './e2e-mock-agent'
import { getLlmRuntimeConfig, missingApiKeyMessage } from './llm-config'
import { sessionService, settingsService } from './settings'
import { workspaceService } from './workspace'

const ALL_AGENT_TOOLS = ['Read', 'Grep', 'Glob', 'Write', 'StrReplace', 'Delete', 'Shell']

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
    const { sessionId, content, attachments = [] } = params
    const settings = settingsService.get()
    const root = workspaceService.getRoot()

    if (!root) {
      this.emit(webContents, sessionId, {
        type: 'error',
        message: 'ワークスペースを開いてから Agent を使用してください。',
      })
      return
    }

    const runtime = getLlmRuntimeConfig(settings, 'agent')
    const isE2eMock = process.env.CODEX_E2E_MOCK_AGENT === '1'

    if (!runtime.apiKey && !isE2eMock) {
      this.emit(webContents, sessionId, {
        type: 'error',
        message: missingApiKeyMessage(runtime.provider),
      })
      return
    }

    const llm = isE2eMock ? createE2eMockAgentProvider() : getProviderInstance(runtime.provider)
    this.orchestrator = new AgentOrchestrator(llm, defaultToolRegistry)

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

    const history = this.buildAgentHistory(sessionService.getMessages(sessionId), attachments)
    let assistantContent = ''
    const toolCalls: ToolCallRecord[] = []

    const notifyFileChanged = (absolutePath: string) => {
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send(IPC_EVENTS.FILE_CHANGED, {
          path: absolutePath,
          relativePath: workspaceService.getRelativePath(absolutePath),
        })
      }
    }

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
        signal: abortController.signal,
        resolvePath: (p) => workspaceService.resolveWithinWorkspace(p),
        getRelativePath: (p) => workspaceService.getRelativePath(p),
        onFileChanged: notifyFileChanged,
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
          this.emit(webContents, sessionId, { type: 'error', message: event.message })
          return
        } else if (event.type === 'done') {
          break
        }
      }

      const saved = sessionService.addMessage(sessionId, {
        sessionId,
        role: 'assistant',
        content: assistantContent,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      })

      this.emit(webContents, sessionId, { type: 'done', messageId: saved.id })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Agent failed'
      this.emit(webContents, sessionId, { type: 'error', message })
    } finally {
      this.abortControllers.delete(sessionId)
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

    return agentMessages
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
