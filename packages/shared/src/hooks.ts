/** Hooks configuration (`.codex/hooks.json`). */

export type HookEvent = 'onFileSave' | 'onAgentComplete'

export type HookActionType = 'shell' | 'skill'

export interface HookShellAction {
  type: 'shell'
  /** Shell command. Supports ${file}, ${relativePath}, ${workspace}, ${sessionId} */
  command: string
}

export interface HookSkillAction {
  type: 'skill'
  /** Skill name without leading slash */
  skill: string
  /** Optional args passed to the skill */
  args?: string
}

export type HookAction = HookShellAction | HookSkillAction

export interface HookDefinition {
  event: HookEvent
  /** Include globs (relative to workspace). Empty = all paths for onFileSave */
  paths?: string[]
  /** Exclude globs */
  exclude?: string[]
  action: HookAction
  /** Minimum ms between fires for the same hook+path key (default 1000) */
  cooldownMs?: number
}

export interface HooksConfig {
  hooks: HookDefinition[]
}

export const DEFAULT_HOOK_COOLDOWN_MS = 1000

/** Named permission profiles for headless / CLI. */
export type PermissionProfile = 'readonly' | 'ask' | 'allow'

export const PERMISSION_PROFILES = {
  readonly: { read: 'allow', edit: 'deny', shell: 'deny', network: 'allow' },
  ask: { read: 'allow', edit: 'ask', shell: 'ask', network: 'ask' },
  allow: { read: 'allow', edit: 'allow', shell: 'allow', network: 'allow' },
} as const satisfies Record<
  PermissionProfile,
  {
    read: 'allow' | 'ask' | 'deny'
    edit: 'allow' | 'ask' | 'deny'
    shell: 'allow' | 'ask' | 'deny'
    network: 'allow' | 'ask' | 'deny'
  }
>
