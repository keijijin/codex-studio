import type { Tool, ToolContext, ToolDefinition, ToolResult } from './types'
import { readTool } from './tools/read'
import { grepTool } from './tools/grep'
import { globTool } from './tools/glob'
import { writeTool } from './tools/write'
import { strReplaceTool } from './tools/str-replace'
import { deleteTool } from './tools/delete'
import { shellTool } from './tools/shell'
import { taskTool } from './tools/task'
import { webSearchTool } from './tools/web-search'
import { memoryAppendTool } from './tools/memory-append'
import { teamTool } from './tools/team'
import { generateVideoTool } from './tools/generate-video'
import { generatePresentationTool } from './tools/generate-presentation'
import { gitStatusTool } from './tools/git-status'

const DEFAULT_TOOLS: Tool[] = [
  readTool, grepTool, globTool, gitStatusTool,
  writeTool, strReplaceTool, deleteTool, shellTool,
  taskTool, webSearchTool, memoryAppendTool, teamTool, generateVideoTool, generatePresentationTool,
]

export class ToolRegistry {
  private tools = new Map<string, Tool>()
  private dynamicNames = new Set<string>()

  constructor(tools: Tool[] = DEFAULT_TOOLS) {
    for (const tool of tools) {
      this.tools.set(tool.name, tool)
    }
  }

  register(tool: Tool, options?: { dynamic?: boolean }): void {
    this.tools.set(tool.name, tool)
    if (options?.dynamic !== false) this.dynamicNames.add(tool.name)
  }

  unregister(name: string): void {
    this.tools.delete(name)
    this.dynamicNames.delete(name)
  }

  /** Remove previously registered dynamic tools (e.g. MCP) matching a prefix. */
  unregisterByPrefix(prefix: string): void {
    for (const name of [...this.dynamicNames]) {
      if (name.startsWith(prefix)) {
        this.tools.delete(name)
        this.dynamicNames.delete(name)
      }
    }
  }

  listNames(): string[] {
    return [...this.tools.keys()]
  }

  list(enabled?: string[]): ToolDefinition[] {
    const all = [...this.tools.values()]
    const allowMcp = !enabled?.length || enabled.includes('*mcp*')
    const filtered = !enabled?.length
      ? all
      : all.filter(
          (t) =>
            enabled.includes(t.name) ||
            (allowMcp && t.name.startsWith('mcp__')),
        )
    return filtered.map(({ name, description, parameters, requiresApproval }) => ({
      name,
      description,
      parameters,
      requiresApproval,
    }))
  }

  get(name: string): Tool | undefined {
    const exact = this.tools.get(name)
    if (exact) return exact
    const lower = name.toLowerCase()
    return [...this.tools.values()].find((t) => t.name.toLowerCase() === lower)
  }

  async execute(
    name: string,
    args: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    const tool = this.get(name)
    if (!tool) {
      return { success: false, output: `Error: unknown tool "${name}"` }
    }
    if (ctx.signal.aborted) {
      return { success: false, output: 'Error: cancelled' }
    }
    if (ctx.executeMode === 'preview' && tool.preview) {
      return tool.preview(ctx, args)
    }
    if (ctx.executeMode === 'apply' && tool.apply) {
      return tool.apply(ctx, args)
    }
    return tool.execute(ctx, args)
  }
}

export const defaultToolRegistry = new ToolRegistry()
