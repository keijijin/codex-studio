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

/** Loader / shell-hijack keys — never allowed from workspace overlays. */
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

/**
 * Exact keys allowed from `.codex/agent.env` and terminal sync (S3 allowlist).
 * Unknown keys are dropped (key names may be logged; values never).
 */
export const AGENT_ENV_ALLOWLIST_EXACT = new Set([
  'KUBECONFIG',
  'OC_TOKEN',
  'OC_NAMESPACE',
  'DOCKER_HOST',
  'DOCKER_CERT_PATH',
  'DOCKER_TLS_VERIFY',
  'NPM_TOKEN',
  'NPM_CONFIG_REGISTRY',
  'GH_TOKEN',
  'GITHUB_TOKEN',
  'GITLAB_TOKEN',
  'FFMPEG_PATH',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
  'ALL_PROXY',
  'SSL_CERT_FILE',
  'REQUESTS_CA_BUNDLE',
  'CURL_CA_BUNDLE',
  'NODE_EXTRA_CA_CERTS',
  'JAVA_HOME',
  'GOPATH',
  'GOROOT',
  'CARGO_HOME',
  'RUSTUP_HOME',
  'EDITOR',
  'VISUAL',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'TZ',
])

/** Prefixes allowed in addition to exact keys (e.g. AWS_*, OC_*). */
export const AGENT_ENV_ALLOWLIST_PREFIXES = [
  'OC_',
  'KUBE_',
  'AWS_',
  'AZURE_',
  'GOOGLE_',
  'GCP_',
  'DOCKER_',
  'GH_',
  'GITHUB_',
  'GITLAB_',
  'NPM_',
  'PNPM_',
  'YARN_',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
  'LC_',
  'SSL_CERT_',
] as const

/** Terminal sync may also set PATH (venv / toolchain). agent.env may not. */
export const TERMINAL_ENV_EXTRA_ALLOW = new Set(['PATH', 'Path'])

export function isAgentEnvKeyAllowed(key: string, options?: { allowPath?: boolean }): boolean {
  if (BLOCKED_LOADER_ENV_KEYS.has(key)) return false
  if (options?.allowPath && TERMINAL_ENV_EXTRA_ALLOW.has(key)) return true
  if (AGENT_ENV_ALLOWLIST_EXACT.has(key)) return true
  return AGENT_ENV_ALLOWLIST_PREFIXES.some((prefix) => key.startsWith(prefix))
}

export interface FilterEnvResult {
  env: Record<string, string>
  /** Dropped key names only (never values). */
  droppedKeys: string[]
}

export function filterEnvByAllowlist(
  env: Record<string, string>,
  options?: { allowPath?: boolean },
): FilterEnvResult {
  const out: Record<string, string> = {}
  const droppedKeys: string[] = []
  for (const [key, value] of Object.entries(env)) {
    if (isAgentEnvKeyAllowed(key, options)) {
      out[key] = value
    } else {
      droppedKeys.push(key)
    }
  }
  return { env: out, droppedKeys }
}

/** @deprecated Prefer filterEnvByAllowlist — kept for call-site compatibility. */
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

/** Terminal sync / captured: allowlist + PATH. */
export function scrubLoaderEnv(env: Record<string, string>): Record<string, string> {
  return filterEnvByAllowlist(env, { allowPath: true }).env
}

/** `.codex/agent.env`: allowlist without PATH. */
export function scrubAgentEnvFile(env: Record<string, string>): Record<string, string> {
  return filterEnvByAllowlist(env, { allowPath: false }).env
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
