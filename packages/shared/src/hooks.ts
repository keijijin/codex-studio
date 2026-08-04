/** Hooks configuration (`.codex/hooks.json`). */

import type { AgentPermissions } from './permissions'

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

/** Named permission profiles for UI / headless / CLI. */
export type PermissionProfile = 'readonly' | 'coding' | 'yolo'

/** Legacy CLI aliases accepted and normalized to PermissionProfile. */
export type LegacyPermissionProfile = 'ask' | 'allow'

export const PERMISSION_PROFILES = {
  readonly: {
    read: 'allow',
    edit: 'deny',
    shell: 'deny',
    network: 'allow',
    media: 'deny',
  },
  coding: {
    read: 'allow',
    edit: 'ask',
    shell: 'ask',
    network: 'allow',
    media: 'ask',
  },
  yolo: {
    read: 'allow',
    edit: 'allow',
    shell: 'allow',
    network: 'allow',
    media: 'allow',
  },
} as const satisfies Record<PermissionProfile, AgentPermissions>

export function normalizePermissionProfile(
  name: string,
): PermissionProfile | null {
  if (name === 'readonly' || name === 'coding' || name === 'yolo') return name
  if (name === 'ask') return 'coding'
  if (name === 'allow') return 'yolo'
  return null
}

/** Detect which preset matches current permissions (+ yoloMode). */
export function matchPermissionProfile(
  permissions: AgentPermissions,
  yoloMode = false,
): PermissionProfile | 'custom' {
  if (yoloMode) return 'yolo'
  for (const id of ['readonly', 'coding', 'yolo'] as const) {
    const preset = PERMISSION_PROFILES[id]
    if (
      permissions.read === preset.read &&
      permissions.edit === preset.edit &&
      permissions.shell === preset.shell &&
      permissions.network === preset.network &&
      permissions.media === preset.media
    ) {
      return id
    }
  }
  return 'custom'
}
