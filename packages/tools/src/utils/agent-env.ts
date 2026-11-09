import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

/** Workspace file for durable Agent Shell env overrides (KEY=VALUE). */
export const AGENT_ENV_FILENAME = 'agent.env'
/** Snapshot written when syncing from the integrated terminal (gitignored). */
export const AGENT_ENV_CAPTURED_FILENAME = '.agent-env.captured'

export function agentEnvFilePath(workspaceRoot: string): string {
  return join(workspaceRoot, '.codex', AGENT_ENV_FILENAME)
}

export function agentEnvCapturedPath(workspaceRoot: string): string {
  return join(workspaceRoot, '.codex', AGENT_ENV_CAPTURED_FILENAME)
}

/**
 * Parse dotenv-style KEY=VALUE lines (also accepts `export KEY=VALUE`).
 * Does not expand shell variables.
 */
export function parseEnvFile(content: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const body = line.startsWith('export ') ? line.slice(7).trim() : line
    const eq = body.indexOf('=')
    if (eq <= 0) continue
    const key = body.slice(0, eq).trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue
    let value = body.slice(eq + 1)
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (value === '') continue
    out[key] = value
  }
  return out
}

export function loadEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {}
  try {
    return parseEnvFile(readFileSync(path, 'utf-8'))
  } catch {
    return {}
  }
}

/** Loader / shell-hijack keys never accepted from workspace overlays. */
export const BLOCKED_LOADER_ENV_KEYS = new Set([
  'BASH_ENV',
  'ENV',
  'SHELL',
  'HOME',
  'USERPROFILE',
  'ZDOTDIR',
  'LD_PRELOAD',
  'DYLD_INSERT_LIBRARIES',
  'DYLD_LIBRARY_PATH',
  'LD_LIBRARY_PATH',
  'NODE_OPTIONS',
  'PYTHONPATH',
  'PERL5OPT',
  'RUBYOPT',
])

/** Additional keys blocked only for `.codex/agent.env` (not terminal sync). */
export const BLOCKED_AGENT_ENV_FILE_KEYS = new Set([
  ...BLOCKED_LOADER_ENV_KEYS,
  'PATH',
  'Path',
])

export function scrubEnvKeys(
  env: Record<string, string>,
  blocked: Set<string>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(env)) {
    if (blocked.has(key)) continue
    out[key] = value
  }
  return out
}

/** Scrub loader hijacks; PATH from terminal sync is allowed. */
export function scrubLoaderEnv(env: Record<string, string>): Record<string, string> {
  return scrubEnvKeys(env, BLOCKED_LOADER_ENV_KEYS)
}

/** Scrub `.codex/agent.env` including PATH overrides. */
export function scrubAgentEnvFile(env: Record<string, string>): Record<string, string> {
  return scrubEnvKeys(env, BLOCKED_AGENT_ENV_FILE_KEYS)
}

/** Load `.codex/agent.env` then `.codex/.agent-env.captured` (captured wins on conflict). */
export function loadWorkspaceAgentEnv(workspaceRoot: string): Record<string, string> {
  return {
    ...scrubAgentEnvFile(loadEnvFile(agentEnvFilePath(workspaceRoot))),
    ...scrubLoaderEnv(loadEnvFile(agentEnvCapturedPath(workspaceRoot))),
  }
}

/**
 * Merge env layers. Later layers override earlier ones.
 * Empty string values are skipped so callers can omit without clearing.
 */
export function mergeShellEnv(
  ...layers: Array<NodeJS.ProcessEnv | Record<string, string | undefined> | undefined>
): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {}
  for (const layer of layers) {
    if (!layer) continue
    for (const [key, value] of Object.entries(layer)) {
      if (value === undefined || value === '') continue
      out[key] = value
    }
  }
  return out
}

/** Resolve env for Agent Shell / Hooks: process → workspace files → optional overlay. */
export function resolveAgentShellEnv(
  workspaceRoot: string,
  overlay?: Record<string, string>,
  base: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  return mergeShellEnv(
    base,
    loadWorkspaceAgentEnv(workspaceRoot),
    overlay ? scrubLoaderEnv(overlay) : undefined,
  )
}
