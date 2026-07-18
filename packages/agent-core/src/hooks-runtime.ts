import { spawn } from 'child_process'
import { relative } from 'path'
import {
  DEFAULT_HOOK_COOLDOWN_MS,
  type HookDefinition,
  type HooksConfig,
} from '@codex/shared'
import { wrapShellCommand } from '@codex/tools'
import { matchGlob } from './rules-loader'
import { loadHooksConfig } from './hooks-loader'

export interface HookDispatchContext {
  workspaceRoot: string
  /** Absolute path (onFileSave) */
  filePath?: string
  relativePath?: string
  sessionId?: string
}

export interface HookShellResult {
  type: 'shell'
  command: string
  success: boolean
  output: string
}

export interface HookSkillResult {
  type: 'skill'
  skill: string
  args: string
  success: boolean
  output: string
}

export type HookRunResult = HookShellResult | HookSkillResult

export interface HookSkillRunner {
  (skill: string, args: string, ctx: HookDispatchContext): Promise<{ success: boolean; output: string }>
}

export interface HooksRuntimeOptions {
  /** Override config loader (tests) */
  loadConfig?: (workspaceRoot: string) => Promise<HooksConfig>
  /** Optional skill executor. Without it, skill hooks are skipped with a message. */
  runSkill?: HookSkillRunner
  /** Shell timeout ms (default 60s) */
  shellTimeoutMs?: number
}

function expandCommand(template: string, ctx: HookDispatchContext): string {
  const file = ctx.filePath ?? ''
  const rel = ctx.relativePath ?? ''
  const workspace = ctx.workspaceRoot
  const sessionId = ctx.sessionId ?? ''
  return template
    .replaceAll('${file}', file)
    .replaceAll('${relativePath}', rel)
    .replaceAll('${workspace}', workspace)
    .replaceAll('${sessionId}', sessionId)
}

function pathMatches(hook: HookDefinition, relativePath: string | undefined): boolean {
  if (!relativePath) {
    // onAgentComplete has no path — always match path filters
    return true
  }
  const normalized = relativePath.replace(/\\/g, '/')
  if (hook.exclude?.some((g) => matchGlob(g, normalized))) {
    return false
  }
  if (!hook.paths || hook.paths.length === 0) return true
  return hook.paths.some((g) => matchGlob(g, normalized))
}

function runShellCommand(
  command: string,
  cwd: string,
  timeoutMs: number,
): Promise<{ success: boolean; output: string }> {
  return new Promise((resolve) => {
    const wrapped = wrapShellCommand(command)
    const proc = spawn(wrapped.file, wrapped.args, {
      cwd,
      env: process.env,
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      proc.kill('SIGTERM')
      resolve({ success: false, output: `Error: hook shell timed out after ${timeoutMs}ms` })
    }, timeoutMs)

    proc.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    proc.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    proc.on('error', (err) => {
      clearTimeout(timer)
      resolve({ success: false, output: `Error: ${err.message}` })
    })
    proc.on('close', (code) => {
      clearTimeout(timer)
      const output = [stdout, stderr].filter(Boolean).join('\n').trim()
      resolve({
        success: code === 0,
        output: output || (code === 0 ? '' : `Exit code ${code}`),
      })
    })
  })
}

/**
 * Event-driven hooks runner (Electron-free).
 * Re-entrancy: nested dispatches while a hook is running are ignored.
 */
export class HooksRuntime {
  private depth = 0
  private lastFired = new Map<string, number>()
  private loadConfig: (workspaceRoot: string) => Promise<HooksConfig>
  private runSkill?: HookSkillRunner
  private shellTimeoutMs: number

  constructor(options: HooksRuntimeOptions = {}) {
    this.loadConfig = options.loadConfig ?? loadHooksConfig
    this.runSkill = options.runSkill
    this.shellTimeoutMs = options.shellTimeoutMs ?? 60_000
  }

  /** True while a hook action is executing (used by callers to skip nested saves). */
  get isRunning(): boolean {
    return this.depth > 0
  }

  async dispatch(event: HookDefinition['event'], ctx: HookDispatchContext): Promise<HookRunResult[]> {
    if (this.depth > 0) return []

    const config = await this.loadConfig(ctx.workspaceRoot)
    const relativePath =
      ctx.relativePath ??
      (ctx.filePath ? relative(ctx.workspaceRoot, ctx.filePath).replace(/\\/g, '/') : undefined)

    const dispatchCtx: HookDispatchContext = {
      ...ctx,
      relativePath,
    }

    const matching = config.hooks.filter((h) => {
      if (h.event !== event) return false
      return pathMatches(h, relativePath)
    })

    if (matching.length === 0) return []

    this.depth++
    const results: HookRunResult[] = []
    try {
      for (let i = 0; i < matching.length; i++) {
        const hook = matching[i]
        const cooldown = hook.cooldownMs ?? DEFAULT_HOOK_COOLDOWN_MS
        const key = `${event}:${i}:${relativePath ?? '*'}:${hook.action.type}`
        const now = Date.now()
        const prev = this.lastFired.get(key) ?? 0
        if (cooldown > 0 && now - prev < cooldown) continue
        this.lastFired.set(key, now)

        if (hook.action.type === 'shell') {
          const command = expandCommand(hook.action.command, dispatchCtx)
          const result = await runShellCommand(command, ctx.workspaceRoot, this.shellTimeoutMs)
          results.push({ type: 'shell', command, ...result })
        } else if (hook.action.type === 'skill') {
          const skill = hook.action.skill
          const args = expandCommand(hook.action.args ?? '', dispatchCtx)
          if (!this.runSkill) {
            results.push({
              type: 'skill',
              skill,
              args,
              success: false,
              output: 'Error: skill hooks require a skill runner',
            })
            continue
          }
          const result = await this.runSkill(skill, args, dispatchCtx)
          results.push({ type: 'skill', skill, args, ...result })
        }
      }
    } finally {
      this.depth--
    }

    return results
  }
}
