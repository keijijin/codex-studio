import type { Tool, ToolContext, ToolResult } from '../types'

async function runTeamTool(
  ctx: ToolContext,
  args: Record<string, unknown>,
  mode: 'preview' | 'apply',
): Promise<ToolResult> {
  const teamId = String(args.team ?? '').trim()
  const prompt = String(args.prompt ?? '').trim()
  if (!teamId) return { success: false, output: 'Error: team is required' }
  if (!prompt) return { success: false, output: 'Error: prompt is required' }
  if ((ctx.subagentDepth ?? 0) >= 1) {
    return { success: false, output: 'Error: Team cannot be nested inside Task/Team' }
  }
  if (mode === 'preview') {
    return {
      success: true,
      output: `Would run team "${teamId}": ${prompt.slice(0, 80)}`,
      metadata: {
        path: '',
        relativePath: `team:${teamId}`,
        oldContent: '',
        newContent: prompt,
        action: 'edit',
      },
    }
  }
  if (!ctx.runTeam) {
    return { success: false, output: 'Error: Team runner is not available in this runtime' }
  }
  return ctx.runTeam({ teamId, prompt })
}

/** Run a local Agent Team defined in `.codex/teams/<id>/team.json`. */
export const teamTool: Tool = {
  name: 'Team',
  description:
    'Run a named local Agent Team (parallel role subagents + shared BOARD.md + synthesizer). Prefer for multi-perspective reviews. Team ids live under .codex/teams/.',
  requiresApproval: true,
  parameters: {
    type: 'object',
    properties: {
      team: {
        type: 'string',
        description: 'Team id (directory name under .codex/teams/)',
      },
      prompt: {
        type: 'string',
        description: 'Task for the team',
      },
    },
    required: ['team', 'prompt'],
  },
  preview: (ctx, args) => runTeamTool(ctx, args, 'preview'),
  apply: (ctx, args) => runTeamTool(ctx, args, 'apply'),
  execute: (ctx, args) => runTeamTool(ctx, args, ctx.executeMode),
}
