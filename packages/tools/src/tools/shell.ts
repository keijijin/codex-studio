import { spawn } from 'child_process'
import type { Tool, ToolContext, ToolResult } from '../types'
import { wrapShellCommand } from '../utils/shell-profile'

const MAX_OUTPUT = 100 * 1024
const DEFAULT_TIMEOUT = 30_000

const DENY_PATTERNS = [
  /rm\s+-rf\s+\//,
  /rm\s+-rf\s+~\/\*/,
  /mkfs/,
  /:\(\)\s*\{\s*:\|:&\s*\};:/,
  /curl\s+[^\n|]*\|\s*(ba)?sh/,
  /wget\s+[^\n|]*\|\s*(ba)?sh/,
  />\s*\/dev\/sd[a-z]/,
  /dd\s+if=.*of=\/dev/,
]

export const shellTool: Tool = {
  name: 'Shell',
  description:
    'Run a shell command in the workspace. Use for build, test, or git commands. ' +
    'Login/profile files (e.g. ~/.bash_profile, ~/.zshrc) are sourced automatically — do not prepend source yourself.',
  requiresApproval: true,
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Shell command to run' },
      cwd: { type: 'string', description: 'Working directory (relative to workspace)' },
      timeout: { type: 'integer', description: 'Timeout in milliseconds (default 30000)' },
    },
    required: ['command'],
  },
  async execute(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
    const command = String(args.command ?? '').trim()
    if (!command) return { success: false, output: 'Error: command is required' }

    for (const pattern of DENY_PATTERNS) {
      if (pattern.test(command)) {
        return { success: false, output: `Error: command blocked by security policy` }
      }
    }

    const cwd = args.cwd
      ? ctx.resolvePath(String(args.cwd))
      : ctx.workspaceRoot
    const timeout = Number(args.timeout) || DEFAULT_TIMEOUT
    const wrapped = wrapShellCommand(command)

    if (ctx.executeMode === 'preview') {
      const profileNote = wrapped.bootstrap
        ? `\n(profile: ${wrapped.bootstrap})`
        : ''
      return {
        success: true,
        output: `Preview: run command in ${ctx.getRelativePath(cwd) || '.'}\n$ ${command}${profileNote}`,
        metadata: { command, cwd, action: 'shell', bootstrap: wrapped.bootstrap },
      }
    }

    return new Promise((resolve) => {
      const proc = spawn(wrapped.file, wrapped.args, {
        cwd,
        env: process.env,
        // Avoid nested shell:true — profile + command already wrapped for this shell.
        windowsHide: true,
      })
      let stdout = ''
      let stderr = ''
      let killed = false

      const timer = setTimeout(() => {
        killed = true
        proc.kill('SIGTERM')
      }, timeout)

      proc.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString()
        if (stdout.length > MAX_OUTPUT) stdout = stdout.slice(0, MAX_OUTPUT) + '\n...(truncated)'
      })
      proc.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString()
        if (stderr.length > MAX_OUTPUT) stderr = stderr.slice(0, MAX_OUTPUT) + '\n...(truncated)'
      })

      proc.on('close', (code) => {
        clearTimeout(timer)
        const output = [stdout, stderr].filter(Boolean).join('\n') || '(no output)'
        resolve({
          success: code === 0 && !killed,
          output: killed
            ? `Error: command timed out after ${timeout}ms\n${output}`
            : `Exit code: ${code ?? 'unknown'}\n${output}`,
          metadata: { exitCode: code, killed, shell: wrapped.file, bootstrap: wrapped.bootstrap },
        })
      })

      proc.on('error', (err) => {
        clearTimeout(timer)
        resolve({ success: false, output: `Error: ${err.message}` })
      })
    })
  },
}
