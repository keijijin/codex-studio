import { mkdir, mkdtemp, writeFile, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { describe, expect, it } from 'vitest'
import { resolve } from 'path'
import {
  collectTeams,
  findTeam,
  parseTeamInvocation,
  collectSkills,
  collectPersonas,
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
      expect(findTeam(teams, 'demo')).toBeTruthy()
      expect(findTeam(teams, 'Demo')?.id).toBe('demo')
      expect(findTeam(teams, 'demo')?.roles).toHaveLength(2)
      // Built-ins are always present
      expect(findTeam(teams, 'virtual-company')).toBeTruthy()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('always exposes built-in virtual-company even on empty workspace', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-empty-ws-'))
    try {
      const teams = await collectTeams(root)
      const company = findTeam(teams, 'virtual-company')
      expect(company).toBeTruthy()
      expect(company!.pipeline?.requireCeoApproval).toBe(true)
      expect(company!.boardRelativePath).toBe('.codex/teams/virtual-company/BOARD.md')
      expect(findTeam(teams, 'review-squad')).toBeTruthy()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('prefers in-memory builtins over stale global team.json', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-stale-global-'))
    const globalTeams = join(root, 'global-teams')
    try {
      const staleDir = join(globalTeams, 'virtual-company')
      await mkdir(staleDir, { recursive: true })
      await writeFile(
        join(staleDir, 'team.json'),
        JSON.stringify({
          id: 'virtual-company',
          name: 'Stale Company',
          description: 'old',
          roles: [{ id: 'only', name: 'Only', goal: 'stale' }],
        }),
        'utf-8',
      )

      const teams = await collectTeams(root, { extraTeamsDirs: [globalTeams] })
      const company = findTeam(teams, 'virtual-company')
      expect(company).toBeTruthy()
      expect(company!.name).not.toBe('Stale Company')
      expect(company!.pipeline?.requireCeoApproval).toBe(true)
      expect(company!.roles.some((r) => r.execute)).toBe(true)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('loads workspace virtual-company with department personas and pipeline', async () => {
    const root = resolve(__dirname, '..')
    const teams = await collectTeams(root)
    const company = findTeam(teams, 'virtual-company')
    expect(company).toBeTruthy()
    expect(company!.pipeline?.requireCeoApproval).toBe(true)
    expect(company!.pipeline?.executeAfterApprove).toBe(true)
    expect(company!.roles.map((r) => r.id).sort()).toEqual([
      'ceo',
      'engineering',
      'executor',
      'legal',
      'marketing',
      'sales',
    ])
    expect(company!.roles.find((r) => r.synthesize)?.persona).toBe('ceo')
    expect(company!.roles.find((r) => r.execute)?.persona).toBe('eng-executor')
    expect(company!.roles.find((r) => r.id === 'sales')?.persona).toBe('sales-dept')
    expect(company!.roles.find((r) => r.id === 'marketing')?.persona).toBe('marketing-dept')

    const personas = await collectPersonas(root)
    for (const name of [
      'sales-dept',
      'marketing-dept',
      'legal-dept',
      'eng-dept',
      'ceo',
      'eng-executor',
    ]) {
      expect(personas.some((p) => p.name === name)).toBe(true)
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
