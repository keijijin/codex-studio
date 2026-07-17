import { readdir, readFile, stat } from 'fs/promises'
import { basename, join, relative } from 'path'
import type { TeamDefinition, TeamRole } from '@codex/shared'

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
    synthesize: obj.synthesize === true,
  }
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

    return {
      id: id.toLowerCase().replace(/[^a-z0-9_-]/g, '-'),
      name,
      description,
      absolutePath,
      relativePath: relative(workspaceRoot, absolutePath).replace(/\\/g, '/'),
      roles,
      boardRelativePath: relative(workspaceRoot, boardAbs).replace(/\\/g, '/'),
    }
  } catch {
    return null
  }
}

/** Load teams from `.codex/teams/<id>/team.json` (or `*.json` files). */
export async function collectTeams(workspaceRoot: string): Promise<TeamDefinition[]> {
  const root = join(workspaceRoot, '.codex', 'teams')
  const out: TeamDefinition[] = []
  let entries: string[]
  try {
    entries = await readdir(root)
  } catch {
    return []
  }

  for (const entry of entries) {
    const full = join(root, entry)
    let st
    try {
      st = await stat(full)
    } catch {
      continue
    }
    if (st.isDirectory()) {
      const teamJson = join(full, 'team.json')
      const team = await loadTeamFile(teamJson, workspaceRoot, entry)
      if (team) out.push(team)
    } else if (st.isFile() && entry.endsWith('.json')) {
      const team = await loadTeamFile(full, workspaceRoot, basename(entry, '.json'))
      if (team) out.push(team)
    }
  }

  const byId = new Map<string, TeamDefinition>()
  for (const team of out) byId.set(team.id, team)
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id))
}

export function findTeam(teams: TeamDefinition[], idOrName: string): TeamDefinition | undefined {
  const key = idOrName.toLowerCase()
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
