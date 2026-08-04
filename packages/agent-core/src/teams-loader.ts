import { readdir, readFile, stat } from 'fs/promises'
import { basename, join, relative, resolve } from 'path'
import type { TeamDefinition, TeamPipelineConfig, TeamRole } from '@codex/shared'
import { builtinTeamDefinitions, materializeBuiltinTeams } from './builtin-teams'

function parseRole(raw: unknown): TeamRole | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const id = typeof obj.id === 'string' ? obj.id.trim() : ''
  const name = typeof obj.name === 'string' ? obj.name.trim() : id
  const goal = typeof obj.goal === 'string' ? obj.goal.trim() : ''
  if (!id || !goal) return null
  const tools = Array.isArray(obj.tools)
    ? obj.tools.filter((t): t is string => typeof t === 'string' && t.length > 0)
    : undefined
  return {
    id,
    name: name || id,
    goal,
    tools,
    skill: typeof obj.skill === 'string' ? obj.skill.trim().replace(/^\//, '') : undefined,
    persona: typeof obj.persona === 'string' ? obj.persona.trim().replace(/^\//, '') : undefined,
    synthesize: obj.synthesize === true,
    execute: obj.execute === true,
  }
}

function parsePipeline(raw: unknown): TeamPipelineConfig | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const obj = raw as Record<string, unknown>
  const pipeline: TeamPipelineConfig = {}
  if (typeof obj.requireCeoApproval === 'boolean') {
    pipeline.requireCeoApproval = obj.requireCeoApproval
  }
  if (typeof obj.executeAfterApprove === 'boolean') {
    pipeline.executeAfterApprove = obj.executeAfterApprove
  }
  return Object.keys(pipeline).length ? pipeline : undefined
}

async function loadTeamFile(
  absolutePath: string,
  workspaceRoot: string,
  fallbackId: string,
): Promise<TeamDefinition | null> {
  try {
    const raw = JSON.parse(await readFile(absolutePath, 'utf-8')) as unknown
    if (!raw || typeof raw !== 'object') return null
    const obj = raw as Record<string, unknown>
    const rolesRaw = obj.roles
    if (!Array.isArray(rolesRaw)) return null
    const roles = rolesRaw.map(parseRole).filter((r): r is TeamRole => r !== null)
    if (roles.length === 0) return null

    const id =
      (typeof obj.id === 'string' && obj.id.trim()) ||
      (typeof obj.name === 'string' && obj.name.trim()) ||
      fallbackId
    const name = typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim() : id
    const description = typeof obj.description === 'string' ? obj.description.trim() : ''
    const dir = join(absolutePath, '..')
    const boardName =
      typeof obj.board === 'string' && obj.board.trim() ? obj.board.trim() : 'BOARD.md'
    const boardAbs = boardName.startsWith('/')
      ? boardName
      : join(dir, boardName)

    const normalizedId = id.toLowerCase().replace(/[^a-z0-9_-]/g, '-')
    const wsRoot = resolve(workspaceRoot)
    const absResolved = resolve(absolutePath)
    const underWorkspace =
      absResolved === wsRoot || absResolved.startsWith(wsRoot + '/') || absResolved.startsWith(wsRoot + '\\')

    return {
      id: normalizedId,
      name,
      description,
      absolutePath,
      relativePath: underWorkspace
        ? relative(workspaceRoot, absolutePath).replace(/\\/g, '/')
        : `~/.codex-studio/teams/${normalizedId}/team.json`,
      roles,
      // Always keep the board inside the open workspace so path sandbox / UX stay consistent.
      boardRelativePath: underWorkspace
        ? relative(workspaceRoot, boardAbs).replace(/\\/g, '/')
        : `.codex/teams/${normalizedId}/BOARD.md`,
      pipeline: parsePipeline(obj.pipeline),
    }
  } catch {
    return null
  }
}

async function collectFromTeamsRoot(
  teamsRoot: string,
  workspaceRoot: string,
  out: TeamDefinition[],
): Promise<void> {
  let entries: string[]
  try {
    entries = await readdir(teamsRoot)
  } catch {
    return
  }

  for (const entry of entries) {
    const full = join(teamsRoot, entry)
    let st
    try {
      st = await stat(full)
    } catch {
      continue
    }
    if (st.isDirectory()) {
      const team = await loadTeamFile(join(full, 'team.json'), workspaceRoot, entry)
      if (team) out.push(team)
    } else if (st.isFile() && entry.endsWith('.json')) {
      const team = await loadTeamFile(full, workspaceRoot, basename(entry, '.json'))
      if (team) out.push(team)
    }
  }
}

export interface CollectTeamsOptions {
  /**
   * Extra team roots (e.g. ~/.codex-studio/teams).
   * Precedence on id clash: workspace > in-memory builtins > extra/global dirs.
   */
  extraTeamsDirs?: string[]
}

/** Load teams from `.codex/teams` plus optional global/bundled dirs + in-code builtins. */
export async function collectTeams(
  workspaceRoot: string,
  options?: CollectTeamsOptions,
): Promise<TeamDefinition[]> {
  // Always materialize built-ins to ~/.codex-studio (best-effort).
  await materializeBuiltinTeams().catch(() => undefined)

  const out: TeamDefinition[] = []
  // Global/extra first; builtins override stale copies; workspace wins last.
  for (const dir of options?.extraTeamsDirs ?? []) {
    if (dir?.trim()) await collectFromTeamsRoot(dir, workspaceRoot, out)
  }
  out.push(...builtinTeamDefinitions(workspaceRoot))
  await collectFromTeamsRoot(join(workspaceRoot, '.codex', 'teams'), workspaceRoot, out)

  const byId = new Map<string, TeamDefinition>()
  for (const team of out) byId.set(team.id, team)
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id))
}

export function findTeam(teams: TeamDefinition[], idOrName: string): TeamDefinition | undefined {
  const key = idOrName.toLowerCase().replace(/^\//, '')
  return teams.find((t) => t.id === key || t.name.toLowerCase() === key)
}

/**
 * Parse `/team name rest` or `/team:name rest` from user input.
 */
export function parseTeamInvocation(
  content: string,
  teams: TeamDefinition[],
): { team: TeamDefinition; args: string } | null {
  const match = content.match(/^\/team(?::|\s+)([a-zA-Z0-9_-]+)(?:\s+([\s\S]*))?$/)
  if (!match) return null
  const team = findTeam(teams, match[1])
  if (!team) return null
  return { team, args: (match[2] ?? '').trim() }
}
