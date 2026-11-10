import { spawn } from 'child_process'
import type { Tool, ToolContext, ToolResult } from '../types'
import { wrapShellCommand } from '../utils/shell-profile'

const MAX_OUTPUT = 100 * 1024
const DEFAULT_TIMEOUT = 30_000
const MAX_TIMEOUT = 10 * 60_000

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

async function runShell(
  ctx: ToolContext,
  args: Record<string, unknown>,
  mode: 'preview' | 'apply',
): Promise<ToolResult> {
  const command = String(args.command ?? '').trim()
  if (!command) return { success: false, output: 'Error: command is required' }

  for (const pattern of DENY_PATTERNS) {
    if (pattern.test(command)) {
      return { success: false, output: `Error: command blocked by security policy` }
    }
  }

  const cwd = args.cwd ? ctx.resolvePath(String(args.cwd)) : ctx.workspaceRoot
  const requestedTimeout = Number(args.timeout) || DEFAULT_TIMEOUT
  const timeout = Math.min(Math.max(1_000, requestedTimeout), MAX_TIMEOUT)
  const wrapped = wrapShellCommand(command)

  if (mode === 'preview') {
    const profileNote = wrapped.bootstrap ? `\n(profile: ${wrapped.bootstrap})` : ''
    return {
      success: true,
      output: `Preview: run command in ${ctx.getRelativePath(cwd) || '.'}\n$ ${command}${profileNote}`,
      metadata: {
        path: cwd,
        relativePath: ctx.getRelativePath(cwd) || '.',
        command,
        cwd,
        action: 'shell',
        bootstrap: wrapped.bootstrap,
      },
    }
  }

  return new Promise((resolve) => {
      const env = ctx.getShellEnv?.() ?? process.env
      const proc = spawn(wrapped.file, wrapped.args, {
        cwd,
        env,
        // Process-group leader so cancel/timeout can kill children, not just the wrapper shell.
        detached: process.platform !== 'win32',
        // Avoid nested shell:true — profile + command already wrapped for this shell.
        windowsHide: true,
      })
      let stdout = ''
      let stderr = ''
      let killed = false
      let settled = false

      const killTree = () => {
        killed = true
        try {
          // Kill the whole process group when possible (wrapper shell + children).
          if (proc.pid) process.kill(-proc.pid, 'SIGTERM')
        } catch {
          proc.kill('SIGTERM')
        }
        setTimeout(() => {
          try {
            if (proc.pid) process.kill(-proc.pid, 'SIGKILL')
          } catch {
            try {
              proc.kill('SIGKILL')
            } catch {
              // ignore
            }
          }
        }, 2_000).unref?.()
      }

      const timer = setTimeout(() => {
        killTree()
      }, timeout)

      const onAbort = () => {
        killTree()
      }
      if (ctx.signal.aborted) {
        killTree()
      } else {
        ctx.signal.addEventListener('abort', onAbort, { once: true })
      }

      proc.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString()
        if (stdout.length > MAX_OUTPUT) stdout = stdout.slice(0, MAX_OUTPUT) + '\n...(truncated)'
      })
      proc.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString()
        if (stderr.length > MAX_OUTPUT) stderr = stderr.slice(0, MAX_OUTPUT) + '\n...(truncated)'
      })

      proc.on('close', (code) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        ctx.signal.removeEventListener('abort', onAbort)
        ctx.onWorkspaceChanged?.()
        const output = [stdout, stderr].filter(Boolean).join('\n') || '(no output)'
        const aborted = ctx.signal.aborted
        resolve({
          success: code === 0 && !killed && !aborted,
          output: aborted
            ? `Error: cancelled\n${output}`
            : killed
              ? `Error: command timed out after ${timeout}ms\n${output}`
              : `Exit code: ${code ?? 'unknown'}\n${output}`,
          metadata: {
            exitCode: code,
            killed,
            aborted,
            shell: wrapped.file,
            bootstrap: wrapped.bootstrap,
          },
        })
      })

      proc.on('error', (err) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        ctx.signal.removeEventListener('abort', onAbort)
        resolve({ success: false, output: `Error: ${err.message}` })
      })
    })
}

export const shellTool: Tool = {
  name: 'Shell',
  description:
    'Run a shell command in the workspace. Use for build, test, or git commands. ' +
    'Login/profile files (e.g. ~/.bash_profile, ~/.zshrc) are sourced automatically — do not prepend source yourself. ' +
    'Extra env comes from `.codex/agent.env` and any environment synced from the integrated Terminal.',
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
  preview: (ctx, args) => runShell(ctx, args, 'preview'),
  apply: (ctx, args) => runShell(ctx, args, 'apply'),
  execute: (ctx, args) => runShell(ctx, args, ctx.executeMode),
}
