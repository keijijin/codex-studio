import { execFile } from 'child_process'
import { promisify } from 'util'
import type { Tool, ToolContext, ToolResult } from '../types'

const execFileAsync = promisify(execFile)

export const gitStatusTool: Tool = {
  name: 'GitStatus',
  description:
    'Show git status for the workspace: current branch, ahead/behind, and changed files (staged/unstaged)',
  requiresApproval: false,
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(ctx: ToolContext, _args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const { stdout: top } = await execFileAsync('git', ['rev-parse', '--show-toplevel'], {
        cwd: ctx.workspaceRoot,
        maxBuffer: 1024 * 1024,
      })
      const root = top.trim()

      const { stdout: branchOut } = await execFileAsync(
        'git',
        ['rev-parse', '--abbrev-ref', 'HEAD'],
        { cwd: root, maxBuffer: 1024 * 1024 },
      )
      const branch = branchOut.trim()

      let ahead = 0
      let behind = 0
      try {
        const { stdout: counts } = await execFileAsync(
          'git',
          ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'],
          { cwd: root, maxBuffer: 1024 * 1024 },
        )
        const parts = counts.trim().split(/\s+/)
        ahead = Number(parts[0] ?? 0) || 0
        behind = Number(parts[1] ?? 0) || 0
      } catch {
        // no upstream
      }

      const { stdout: porcelain } = await execFileAsync(
        'git',
        ['status', '--porcelain', '-uall'],
        { cwd: root, maxBuffer: 8 * 1024 * 1024 },
      )
      const lines = porcelain.split('\n').map((l) => l.replace(/\r$/, '')).filter(Boolean)

      const header = [
        `branch: ${branch}`,
        ahead || behind ? `ahead: ${ahead}, behind: ${behind}` : null,
        `changes: ${lines.length}`,
      ]
        .filter(Boolean)
        .join('\n')

      if (lines.length === 0) {
        return {
          success: true,
          output: `${header}\n(working tree clean)`,
          metadata: { branch, ahead, behind, changeCount: 0 },
        }
      }

      return {
        success: true,
        output: `${header}\n\n${lines.join('\n')}`,
        metadata: { branch, ahead, behind, changeCount: lines.length },
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'git status failed'
      if (/not a git repository/i.test(message)) {
        return { success: false, output: 'Error: not a git repository' }
      }
      return { success: false, output: `Error: ${message}` }
    }
  },
}
