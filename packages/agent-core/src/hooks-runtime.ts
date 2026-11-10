import { spawn } from 'child_process'
import { relative } from 'path'
import {
  DEFAULT_HOOK_COOLDOWN_MS,
  type HookDefinition,
  type HooksConfig,
} from '@codex/shared'
import { wrapShellCommand, resolveAgentShellEnv, defaultShell, isPowerShell } from '@codex/tools'
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
  /** Env for hook shell commands (defaults to workspace agent.env merge). */
  getShellEnv?: (workspaceRoot: string) => NodeJS.ProcessEnv
}

const PLACEHOLDER_NAMES = ['file', 'relativePath', 'workspace', 'sessionId'] as const
type PlaceholderName = (typeof PLACEHOLDER_NAMES)[number]

const PLACEHOLDER_PATTERN = /\$\{(file|relativePath|workspace|sessionId)\}/g

/** Command position before a quoted string whose content a second shell will parse. */
const POSIX_NESTED_SHELL =
  /(?:^|[\s;&|(])(?:(?:[^\s;&|(]*[\\/])?(?:sh|bash|zsh|dash|ksh)(?:\.exe)?\s+(?:(?:-o\s+\S+|[-+][a-zA-Z]+)\s+)*-[a-zA-Z]*c|eval)\s+$/
const POWERSHELL_NESTED_SHELL =
  /(?:^|[\s;&|(])(?:(?:[^\s;&|(]*[\\/])?(?:powershell|pwsh)(?:\.exe)?\s+(?:-[a-zA-Z]+\s+)*-c(?:ommand)?|iex|invoke-expression)\s+$/i

interface ShellSegment {
  kind: 'bare' | 'single' | 'double'
  /** Text including its surrounding quotes. */
  raw: string
  /** Text without its surrounding quotes. */
  inner: string
  start: number
}

/** Split a command into unquoted, single-quoted and double-quoted segments. */
function scanShellSegments(command: string, powershell: boolean): ShellSegment[] {
  const escapeChar = powershell ? '`' : '\\'
  const segments: ShellSegment[] = []
  let bareStart = 0
  let i = 0

  const flushBare = (end: number) => {
    if (end > bareStart) {
      const raw = command.slice(bareStart, end)
      segments.push({ kind: 'bare', raw, inner: raw, start: bareStart })
    }
  }

  while (i < command.length) {
    const ch = command.charAt(i)
    if (ch === escapeChar) {
      i += 2
    } else if (ch === "'") {
      flushBare(i)
      const close = command.indexOf("'", i + 1)
      const end = close === -1 ? command.length : close + 1
      const innerEnd = close === -1 ? command.length : close
      segments.push({
        kind: 'single',
        raw: command.slice(i, end),
        inner: command.slice(i + 1, innerEnd),
        start: i,
      })
      i = end
      bareStart = end
    } else if (ch === '"') {
      flushBare(i)
      let j = i + 1
      while (j < command.length && command.charAt(j) !== '"') {
        j += command.charAt(j) === escapeChar ? 2 : 1
      }
      const closed = j < command.length
      const end = closed ? j + 1 : command.length
      segments.push({
        kind: 'double',
        raw: command.slice(i, end),
        inner: command.slice(i + 1, closed ? j : command.length),
        start: i,
      })
      i = end
      bareStart = end
    } else {
      i += 1
    }
  }
  flushBare(command.length)
  return segments
}

function placeholderAt(text: string, index: number): PlaceholderName | null {
  for (const name of PLACEHOLDER_NAMES) {
    if (text.startsWith(`\${${name}}`, index)) return name
  }
  return null
}

function replacePlaceholders(text: string, ref: (name: PlaceholderName) => string): string {
  return text.replace(PLACEHOLDER_PATTERN, (_match, name: PlaceholderName) => ref(name))
}

/**
 * Double-quoted argument of `bash -c` / `eval`: the outer shell must not expand
 * the value, or the inner shell would parse it as code. Emit an escaped reference
 * so only the inner shell expands it.
 */
function expandNestedDoubleQuoted(inner: string, powershell: boolean): string {
  if (powershell) {
    return replacePlaceholders(inner, (name) => `\`${envRef(name, true)}`)
  }

  let out = ''
  let state: 'none' | 'double' | 'single' = 'none'
  let i = 0
  while (i < inner.length) {
    const name = placeholderAt(inner, i)
    if (name) {
      const escaped = `\\${envRef(name, false)}`
      if (state === 'double') out += escaped
      else if (state === 'single') out += `'\\"${escaped}\\"'`
      else out += `\\"${escaped}\\"`
      i += name.length + 3
    } else if (inner.startsWith('\\"', i)) {
      if (state !== 'single') state = state === 'double' ? 'none' : 'double'
      out += '\\"'
      i += 2
    } else if (inner.charAt(i) === '\\') {
      out += inner.slice(i, i + 2)
      i += 2
    } else {
      if (inner.charAt(i) === "'" && state !== 'double') {
        state = state === 'single' ? 'none' : 'single'
      }
      out += inner.charAt(i)
      i += 1
    }
  }
  return out
}

/** Keep a single-quoted literal's meaning after moving it into double quotes. */
function escapeForDoubleQuotes(text: string, powershell: boolean): string {
  return powershell ? text.replace(/[`$"]/g, '`$&') : text.replace(/[\\`$"]/g, '\\$&')
}

function expandSingleQuotedAsDouble(inner: string, powershell: boolean): string {
  let out = ''
  let last = 0
  for (const match of inner.matchAll(PLACEHOLDER_PATTERN)) {
    const index = match.index ?? 0
    out += escapeForDoubleQuotes(inner.slice(last, index), powershell)
    out += envRef(match[1] as PlaceholderName, powershell)
    last = index + match[0].length
  }
  return out + escapeForDoubleQuotes(inner.slice(last), powershell)
}

function envRef(name: PlaceholderName, powershell: boolean): string {
  const envName =
    name === 'file'
      ? 'CODEX_FILE'
      : name === 'relativePath'
        ? 'CODEX_RELATIVE_PATH'
        : name === 'workspace'
          ? 'CODEX_WORKSPACE'
          : 'CODEX_SESSION_ID'
  return powershell ? `$env:${envName}` : `$${envName}`
}

/**
 * Map legacy `${file}` placeholders to shell env var references.
 * Values are never interpolated into the command string (avoids quote/`$()` injection).
 * Handles partial embedding: `"src/${relativePath}"` → `"src/$CODEX_RELATIVE_PATH"`.
 * Strings passed to a nested shell (`bash -c`, `eval`) are expanded by that inner
 * shell only, so a value is never parsed as code.
 */
export function expandHookCommand(template: string, powershell = false): string {
  const nestedShell = powershell ? POWERSHELL_NESTED_SHELL : POSIX_NESTED_SHELL

  return scanShellSegments(template, powershell)
    .map((segment) => {
      if (!placeholderPresent(segment.inner)) return segment.raw

      if (segment.kind === 'bare') {
        return replacePlaceholders(segment.inner, (name) =>
          powershell ? envRef(name, true) : `"${envRef(name, false)}"`,
        )
      }

      const nested = nestedShell.test(template.slice(0, segment.start))
      if (segment.kind === 'single') {
        if (!nested) return `"${expandSingleQuotedAsDouble(segment.inner, powershell)}"`
        const inner = powershell
          ? replacePlaceholders(segment.inner, (name) => envRef(name, true))
          : expandHookCommand(segment.inner, false)
        return `'${inner}'`
      }

      if (nested) return `"${expandNestedDoubleQuoted(segment.inner, powershell)}"`
      return `"${replacePlaceholders(segment.inner, (name) => envRef(name, powershell))}"`
    })
    .join('')
}

function placeholderPresent(text: string): boolean {
  return PLACEHOLDER_NAMES.some((name) => text.includes(`\${${name}}`))
}

function hookEnvVars(ctx: HookDispatchContext): Record<string, string> {
  return {
    CODEX_FILE: ctx.filePath ?? '',
    CODEX_RELATIVE_PATH: ctx.relativePath ?? '',
    CODEX_WORKSPACE: ctx.workspaceRoot,
    CODEX_SESSION_ID: ctx.sessionId ?? '',
  }
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
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ success: boolean; output: string }> {
  return new Promise((resolve) => {
    const wrapped = wrapShellCommand(command)
    const proc = spawn(wrapped.file, wrapped.args, {
      cwd,
      env,
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
  private getShellEnv: (workspaceRoot: string) => NodeJS.ProcessEnv

  constructor(options: HooksRuntimeOptions = {}) {
    this.loadConfig = options.loadConfig ?? loadHooksConfig
    this.runSkill = options.runSkill
    this.shellTimeoutMs = options.shellTimeoutMs ?? 60_000
    this.getShellEnv =
      options.getShellEnv ?? ((root) => resolveAgentShellEnv(root))
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

    const powershell = isPowerShell(defaultShell())
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
          const command = expandHookCommand(hook.action.command, powershell)
          const env = {
            ...this.getShellEnv(ctx.workspaceRoot),
            ...hookEnvVars(dispatchCtx),
          }
          const result = await runShellCommand(
            command,
            ctx.workspaceRoot,
            this.shellTimeoutMs,
            env,
          )
          results.push({ type: 'shell', command, ...result })
        } else if (hook.action.type === 'skill') {
          const skill = hook.action.skill
          // Skill args are not shell-executed — substitute literal values.
          const args = (hook.action.args ?? '')
            .replaceAll('${file}', dispatchCtx.filePath ?? '')
            .replaceAll('${relativePath}', dispatchCtx.relativePath ?? '')
            .replaceAll('${workspace}', dispatchCtx.workspaceRoot)
            .replaceAll('${sessionId}', dispatchCtx.sessionId ?? '')
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
