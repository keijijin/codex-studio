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

const DEFAULT_TOOLS: Tool[] = [
  readTool, grepTool, globTool,
  writeTool, strReplaceTool, deleteTool, shellTool,
  taskTool, webSearchTool, memoryAppendTool, teamTool,
]

export class ToolRegistry {
  private tools = new Map<string, Tool>()

  constructor(tools: Tool[] = DEFAULT_TOOLS) {
    for (const tool of tools) {
      this.tools.set(tool.name, tool)
    }
  }

  list(enabled?: string[]): ToolDefinition[] {
    const all = [...this.tools.values()]
    const filtered = enabled?.length
      ? all.filter((t) => enabled.includes(t.name))
      : all
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
    return tool.execute(ctx, args)
  }
}

export const defaultToolRegistry = new ToolRegistry()
