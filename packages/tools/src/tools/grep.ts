import { indexService } from '@codex/indexer'
import type { Tool, ToolContext, ToolResult } from '../types'

const MAX_RESULTS = 100

export const grepTool: Tool = {
  name: 'Grep',
  description: 'Search for a text pattern across files in the workspace using ripgrep',
  requiresApproval: false,
  parameters: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Text pattern to search for (fixed string)' },
      path: { type: 'string', description: 'Optional subdirectory or file path to limit search' },
    },
    required: ['pattern'],
  },
  async execute(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
    const pattern = String(args.pattern ?? '').trim()
    if (!pattern) {
      return { success: false, output: 'Error: pattern is required' }
    }

    try {
      const results = await indexService.search(pattern)
      let filtered = results

      if (args.path) {
        const scope = ctx.resolvePath(String(args.path))
        filtered = results.filter((r) => r.path.startsWith(scope))
      }

      const limited = filtered.slice(0, MAX_RESULTS)
      if (limited.length === 0) {
        return { success: true, output: 'No matches found.' }
      }

      const lines = limited.map(
        (r) => `${r.relativePath}:${r.line}: ${r.text.trim()}`,
      )
      const header =
        filtered.length > MAX_RESULTS
          ? `Found ${filtered.length} matches (showing first ${MAX_RESULTS}):\n`
          : `Found ${limited.length} matches:\n`

      return {
        success: true,
        output: header + lines.join('\n'),
        metadata: { totalMatches: filtered.length, shown: limited.length },
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Grep failed'
      return { success: false, output: `Error: ${message}` }
    }
  },
}
