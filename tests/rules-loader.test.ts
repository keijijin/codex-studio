import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { describe, expect, it } from 'vitest'
import {
  loadRules,
  parseRuleFrontmatter,
  matchGlob,
  ruleApplies,
  serializeRuleFile,
  collectRules,
} from '@codex/agent-core'

describe('parseRuleFrontmatter', () => {
  it('defaults to alwaysApply when no frontmatter', () => {
    const { meta, body } = parseRuleFrontmatter('- Use TypeScript')
    expect(meta.alwaysApply).toBe(true)
    expect(body).toBe('- Use TypeScript')
  })

  it('parses alwaysApply and globs', () => {
    const raw = `---
alwaysApply: false
globs:
  - "**/*.ts"
  - "**/*.tsx"
description: TS style
---

- Prefer interfaces
`
    const { meta, body } = parseRuleFrontmatter(raw)
    expect(meta.alwaysApply).toBe(false)
    expect(meta.globs).toEqual(['**/*.ts', '**/*.tsx'])
    expect(meta.description).toBe('TS style')
    expect(body).toContain('Prefer interfaces')
  })
})

describe('matchGlob / ruleApplies', () => {
  it('matches common globs', () => {
    expect(matchGlob('**/*.ts', 'src/app.ts')).toBe(true)
    expect(matchGlob('**/*.ts', 'src/app.tsx')).toBe(false)
    expect(matchGlob('*.md', 'README.md')).toBe(true)
  })

  it('applies alwaysApply and glob rules', () => {
    expect(ruleApplies({ alwaysApply: true, globs: [] }, [])).toBe(true)
    expect(ruleApplies({ alwaysApply: false, globs: ['**/*.ts'] }, ['src/a.ts'])).toBe(true)
    expect(ruleApplies({ alwaysApply: false, globs: ['**/*.ts'] }, ['src/a.md'])).toBe(false)
  })
})

describe('loadRules', () => {
  it('returns empty string when rules directory is missing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-rules-'))
    try {
      expect(await loadRules(root)).toBe('')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('loads .codex/rules and .cursor/rules', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-rules-'))
    try {
      await mkdir(join(root, '.codex', 'rules'), { recursive: true })
      await mkdir(join(root, '.cursor', 'rules'), { recursive: true })
      await writeFile(join(root, '.codex', 'rules', 'a.md'), '- Codex rule', 'utf-8')
      await writeFile(
        join(root, '.cursor', 'rules', 'b.mdc'),
        `---
alwaysApply: true
---

- Cursor rule
`,
        'utf-8',
      )

      const prompt = await loadRules(root)
      expect(prompt).toContain('## Project Rules')
      expect(prompt).toContain('Codex rule')
      expect(prompt).toContain('Cursor rule')
      expect(prompt).toContain('.cursor/rules')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('loads global rules directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-rules-ws-'))
    const globalDir = await mkdtemp(join(tmpdir(), 'codex-rules-global-'))
    try {
      await writeFile(join(globalDir, 'global.md'), '- Global rule', 'utf-8')
      const prompt = await loadRules(root, { globalRulesDir: globalDir })
      expect(prompt).toContain('Global rule')
      expect(prompt).toContain('global')
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(globalDir, { recursive: true, force: true })
    }
  })

  it('serializes and reloads frontmatter', async () => {
    const raw = serializeRuleFile(
      { alwaysApply: false, globs: ['**/*.java'], description: 'Java' },
      '- Use records',
    )
    const { meta, body } = parseRuleFrontmatter(raw)
    expect(meta.alwaysApply).toBe(false)
    expect(meta.globs).toEqual(['**/*.java'])
    expect(meta.description).toBe('Java')
    expect(body).toBe('- Use records')
  })

  it('collectRules marks sources', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-rules-'))
    try {
      await mkdir(join(root, '.codex', 'rules'), { recursive: true })
      await writeFile(join(root, '.codex', 'rules', 'x.md'), 'x', 'utf-8')
      const rules = await collectRules(root)
      expect(rules).toHaveLength(1)
      expect(rules[0].source).toBe('workspace-codex')
      expect(rules[0].editable).toBe(true)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
