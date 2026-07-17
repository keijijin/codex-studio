import { mkdir, mkdtemp, writeFile, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { describe, expect, it } from 'vitest'
import {
  collectTeams,
  findTeam,
  parseTeamInvocation,
  collectSkills,
} from '@codex/agent-core'

describe('teams-loader', () => {
  it('loads team.json from .codex/teams', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-teams-'))
    try {
      const dir = join(root, '.codex', 'teams', 'demo')
      await mkdir(dir, { recursive: true })
      await writeFile(
        join(dir, 'team.json'),
        JSON.stringify({
          id: 'demo',
          name: 'Demo',
          description: 'Test team',
          roles: [
            { id: 'a', name: 'A', goal: 'Look around' },
            { id: 'lead', name: 'Lead', goal: 'Merge', synthesize: true },
          ],
        }),
        'utf-8',
      )

      const teams = await collectTeams(root)
      expect(teams).toHaveLength(1)
      expect(teams[0].id).toBe('demo')
      expect(teams[0].roles).toHaveLength(2)
      expect(findTeam(teams, 'Demo')?.id).toBe('demo')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('parses /team invocations', async () => {
    const team = {
      id: 'review-squad',
      name: 'Review Squad',
      description: '',
      absolutePath: '/x',
      relativePath: '.codex/teams/review-squad/team.json',
      roles: [],
      boardRelativePath: '.codex/teams/review-squad/BOARD.md',
    }
    expect(parseTeamInvocation('/team review-squad focus IPC', [team])).toEqual({
      team,
      args: 'focus IPC',
    })
    expect(parseTeamInvocation('/team:review-squad', [team])?.args).toBe('')
    expect(parseTeamInvocation('/team missing', [team])).toBeNull()
  })
})

describe('shared global skills', () => {
  it('loads global skills and prefers .codex', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-gskills-'))
    const globalDir = join(root, 'global-skills')
    try {
      await mkdir(join(globalDir, 'shared'), { recursive: true })
      await writeFile(
        join(globalDir, 'shared', 'SKILL.md'),
        '---\nname: shared\n---\n\nFrom global\n',
        'utf-8',
      )
      await mkdir(join(root, '.codex', 'skills', 'shared'), { recursive: true })
      await writeFile(
        join(root, '.codex', 'skills', 'shared', 'SKILL.md'),
        '---\nname: shared\n---\n\nFrom workspace\n',
        'utf-8',
      )

      const skills = await collectSkills(root, { globalSkillsDir: globalDir })
      expect(skills.find((s) => s.name === 'shared')?.body).toContain('From workspace')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
