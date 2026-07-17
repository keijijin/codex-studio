import type { Tool, ToolContext, ToolResult } from '../types'

/** Spawn a focused read-only subagent (parent Agent only; no nesting). */
export const taskTool: Tool = {
  name: 'Task',
  description:
    'Spawn a read-only subagent to investigate a focused question (Read/Grep/Glob only). Use multiple Task calls to research different areas in parallel, then synthesize the results yourself.',
  requiresApproval: false,
  parameters: {
    type: 'object',
    properties: {
      description: {
        type: 'string',
        description: 'Short label shown in the UI (e.g. "Find auth entrypoints")',
      },
      prompt: {
        type: 'string',
        description: 'Detailed task for the subagent. Ask for a concise report back.',
      },
    },
    required: ['prompt'],
  },
  async execute(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
    const prompt = String(args.prompt ?? '').trim()
    const description = String(args.description ?? '').trim()
    if (!prompt) return { success: false, output: 'Error: prompt is required' }

    if ((ctx.subagentDepth ?? 0) >= 1) {
      return {
        success: false,
        output: 'Error: nested Task subagents are not allowed',
      }
    }
    if (!ctx.runSubagent) {
      return {
        success: false,
        output: 'Error: Task / subagents are not available in this runtime',
      }
    }
    if (ctx.executeMode === 'preview') {
      return {
        success: true,
        output: `Would spawn subagent: ${description || prompt.slice(0, 80)}`,
        metadata: { description },
      }
    }

    return ctx.runSubagent({ prompt, description: description || undefined })
  },
}
