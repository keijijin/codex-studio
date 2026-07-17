import { mkdir, mkdtemp, writeFile, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { describe, expect, it } from 'vitest'
import {
  collectSkills,
  parseSkillInvocation,
  formatSkillPrompt,
  formatSkillUserMessage,
} from '@codex/agent-core'

describe('skills-loader', () => {
  it('loads SKILL.md from .codex/skills', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-skills-'))
    try {
      const skillDir = join(root, '.codex', 'skills', 'review')
      await mkdir(skillDir, { recursive: true })
      await writeFile(
        join(skillDir, 'SKILL.md'),
        `---
name: review
description: Code review
argument-hint: focus
---

Review the code carefully.
`,
        'utf-8',
      )

      const skills = await collectSkills(root)
      expect(skills).toHaveLength(1)
      expect(skills[0].name).toBe('review')
      expect(skills[0].description).toBe('Code review')
      expect(skills[0].body).toContain('Review the code')
      expect(skills[0].argumentHint).toBe('focus')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('prefers .codex over .claude for the same skill name', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-skills-'))
    try {
      for (const [base, body] of [
        ['.codex', 'From codex'],
        ['.claude', 'From claude'],
      ] as const) {
        const dir = join(root, base, 'skills', 'review')
        await mkdir(dir, { recursive: true })
        await writeFile(
          join(dir, 'SKILL.md'),
          `---\nname: review\n---\n\n${body}\n`,
          'utf-8',
        )
      }

      const skills = await collectSkills(root)
      expect(skills).toHaveLength(1)
      expect(skills[0].body).toContain('From codex')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('parses /name invocations and formats prompts', async () => {
    const skill = {
      id: '/tmp/x',
      name: 'explain',
      description: 'Explain code',
      absolutePath: '/tmp/x',
      relativePath: '.codex/skills/explain/SKILL.md',
      body: 'Explain clearly.',
    }

    expect(parseSkillInvocation('/explain packages/app', [skill])).toEqual({
      skill,
      args: 'packages/app',
    })
    expect(parseSkillInvocation('not a skill', [skill])).toBeNull()
    expect(parseSkillInvocation('/missing', [skill])).toBeNull()

    expect(formatSkillUserMessage(skill, 'foo')).toBe('/explain foo')
    expect(formatSkillPrompt(skill, 'foo')).toContain('## Skill: /explain')
    expect(formatSkillPrompt(skill, 'foo')).toContain('## User arguments\nfoo')
  })
})
