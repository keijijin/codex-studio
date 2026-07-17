import type { AgentMessage, LLMProvider } from '@codex/llm-adapters'
import type { AgentPermissions } from '@codex/shared'
import { DEFAULT_AGENT_PERMISSIONS } from '@codex/shared'
import type { ToolRegistry } from '@codex/tools'
import {
  AgentOrchestrator,
  type AgentRunContext,
} from './orchestrator'

export const SUBAGENT_TOOLS = ['Read', 'Grep', 'Glob'] as const

export interface SubagentTaskParams {
  prompt: string
  description?: string
  workspaceRoot: string
  sessionId: string
  modelId: string
  apiKey: string
  baseUrl?: string
  signal: AbortSignal
  llm: LLMProvider
  registry: ToolRegistry
  resolvePath: (path: string) => string
  getRelativePath: (absolutePath: string) => string
  rulesPrompt?: string
  skillPrompt?: string
  maxIterations?: number
  /** Override default read-only tool set */
  enabledTools?: string[]
  permissions?: AgentPermissions
  /** Parent depth; child runs at depth+1 */
  parentDepth?: number
}

export interface SubagentTaskResult {
  success: boolean
  output: string
  description?: string
}

/**
 * Run a single read-only subagent (no Task/Write/Shell nesting).
 */
export async function runSubagentTask(params: SubagentTaskParams): Promise<SubagentTaskResult> {
  const depth = (params.parentDepth ?? 0) + 1
  if (depth > 1) {
    return { success: false, output: 'Error: nested Task subagents are not allowed', description: params.description }
  }

  const orchestrator = new AgentOrchestrator(params.llm, params.registry)
  const permissions: AgentPermissions = params.permissions ?? {
    ...DEFAULT_AGENT_PERMISSIONS,
    read: 'allow',
    edit: 'deny',
    shell: 'deny',
    network: 'deny',
  }

  const label = params.description ? ` (${params.description})` : ''
  const history: AgentMessage[] = [
    {
      role: 'user',
      content: `You are a read-only subagent${label}. Investigate and report findings concisely. Do not modify files.\n\nTask:\n${params.prompt}`,
    },
  ]

  const ctx: AgentRunContext = {
    workspaceRoot: params.workspaceRoot,
    sessionId: `${params.sessionId}:sub:${Date.now()}`,
    modelId: params.modelId,
    apiKey: params.apiKey,
    baseUrl: params.baseUrl,
    maxIterations: params.maxIterations ?? 12,
    enabledTools: params.enabledTools?.length ? params.enabledTools : [...SUBAGENT_TOOLS],
    yoloMode: false,
    permissions,
    signal: params.signal,
    resolvePath: params.resolvePath,
    getRelativePath: params.getRelativePath,
    rulesPrompt: params.rulesPrompt ?? '',
    skillPrompt: params.skillPrompt,
    subagentDepth: depth,
    requestApproval: async () => false,
  }

  let text = ''
  try {
    for await (const event of orchestrator.run(history, ctx)) {
      if (event.type === 'text_delta') text += event.content
      else if (event.type === 'error') {
        return {
          success: false,
          output: `Subagent error${label}: ${event.message}`,
          description: params.description,
        }
      }
    }
    const output = text.trim() || '(subagent finished with no text)'
    return {
      success: true,
      output: `## Subagent report${label}\n${output}`,
      description: params.description,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Subagent failed'
    return { success: false, output: `Subagent error${label}: ${message}`, description: params.description }
  }
}

/** Simple concurrency pool for Task tools. */
export function createConcurrencyLimiter(limit: number) {
  let active = 0
  const queue: Array<() => void> = []
  const max = Math.max(1, Math.min(8, Math.floor(limit) || 1))

  return async function runLimited<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= max) {
      await new Promise<void>((resolve) => queue.push(resolve))
    }
    active++
    try {
      return await fn()
    } finally {
      active--
      queue.shift()?.()
    }
  }
}
