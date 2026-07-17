import { readFile } from 'fs/promises'
import { join } from 'path'
import type { HookAction, HookDefinition, HooksConfig } from '@codex/shared'

function isHookEvent(value: unknown): value is HookDefinition['event'] {
  return value === 'onFileSave' || value === 'onAgentComplete'
}

function parseAction(raw: unknown): HookAction | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  if (obj.type === 'shell' && typeof obj.command === 'string' && obj.command.trim()) {
    return { type: 'shell', command: obj.command.trim() }
  }
  if (obj.type === 'skill' && typeof obj.skill === 'string' && obj.skill.trim()) {
    return {
      type: 'skill',
      skill: obj.skill.trim().replace(/^\//, ''),
      args: typeof obj.args === 'string' ? obj.args : undefined,
    }
  }
  return null
}

function parseHook(raw: unknown): HookDefinition | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  if (!isHookEvent(obj.event)) return null
  const action = parseAction(obj.action)
  if (!action) return null

  const paths = Array.isArray(obj.paths)
    ? obj.paths.filter((p): p is string => typeof p === 'string' && p.length > 0)
    : undefined
  const exclude = Array.isArray(obj.exclude)
    ? obj.exclude.filter((p): p is string => typeof p === 'string' && p.length > 0)
    : undefined
  const cooldownMs =
    typeof obj.cooldownMs === 'number' && obj.cooldownMs >= 0
      ? Math.floor(obj.cooldownMs)
      : undefined

  return {
    event: obj.event,
    paths,
    exclude,
    action,
    cooldownMs,
  }
}

/** Load and validate `.codex/hooks.json`. Missing file → empty config. */
export async function loadHooksConfig(workspaceRoot: string): Promise<HooksConfig> {
  const path = join(workspaceRoot, '.codex', 'hooks.json')
  try {
    const raw = await readFile(path, 'utf-8')
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return { hooks: [] }
    const hooksRaw = (parsed as { hooks?: unknown }).hooks
    if (!Array.isArray(hooksRaw)) return { hooks: [] }
    const hooks = hooksRaw.map(parseHook).filter((h): h is HookDefinition => h !== null)
    return { hooks }
  } catch {
    return { hooks: [] }
  }
}
