import { mkdtemp, writeFile, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { describe, expect, it } from 'vitest'
import { runHeadlessAgent } from '@codex/agent-core'
import { PERMISSION_PROFILES } from '@codex/shared'
import { createMockProvider } from './helpers/agent-test-utils'

describe('runHeadlessAgent', () => {
  it('runs a read-only agent turn with injected LLM', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-headless-'))
    try {
      await writeFile(join(root, 'README.md'), '# Hello', 'utf-8')
      const llm = createMockProvider([
        [
          {
            type: 'tool_calls',
            calls: [{ id: 'tc1', name: 'Read', arguments: { path: 'README.md' } }],
          },
        ],
        [{ type: 'text', delta: 'README says Hello.' }],
      ])

      const result = await runHeadlessAgent({
        workspaceRoot: root,
        prompt: 'Read README.md',
        model: 'test',
        apiKey: 'test',
        permissionProfile: 'readonly',
        llm,
        maxIterations: 5,
      })

      expect(result.success).toBe(true)
      expect(result.text).toContain('Hello')
      expect(PERMISSION_PROFILES.readonly.edit).toBe('deny')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('denies edit tools under readonly profile', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-headless-'))
    try {
      const llm = createMockProvider([
        [
          {
            type: 'tool_calls',
            calls: [{ id: 'tc1', name: 'Write', arguments: { path: 'x.txt', content: 'no' } }],
          },
        ],
        [{ type: 'text', delta: 'Blocked.' }],
      ])

      const result = await runHeadlessAgent({
        workspaceRoot: root,
        prompt: 'Write x.txt',
        model: 'test',
        apiKey: 'test',
        permissionProfile: 'readonly',
        llm,
        maxIterations: 5,
      })

      const denied = result.events.find((e) => e.type === 'tool_call_result')
      expect(denied && denied.type === 'tool_call_result' && denied.success).toBe(false)
      expect(result.success).toBe(true)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
