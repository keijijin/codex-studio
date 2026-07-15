import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { describe, expect, it } from 'vitest'
import { loadRules } from '@codex/agent-core'

describe('loadRules', () => {
  it('returns empty string when rules directory is missing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-rules-'))
    try {
      expect(await loadRules(root)).toBe('')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('loads markdown rules in sorted order', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-rules-'))
    const rulesDir = join(root, '.codex', 'rules')
    try {
      await mkdir(rulesDir, { recursive: true })
      await writeFile(join(rulesDir, 'b-style.md'), 'Use tabs.', 'utf-8')
      await writeFile(join(rulesDir, 'a-first.md'), 'Always test.', 'utf-8')
      await writeFile(join(rulesDir, 'ignore.txt'), 'skip me', 'utf-8')

      const rules = await loadRules(root)

      expect(rules).toContain('## Project Rules')
      expect(rules.indexOf('a-first.md')).toBeLessThan(rules.indexOf('b-style.md'))
      expect(rules).toContain('Always test.')
      expect(rules).toContain('Use tabs.')
      expect(rules).not.toContain('skip me')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
