import { describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { workspaceIdFromPath, normalizeWorkspaceRoot } from '../packages/app/src/main/services/workspace'

describe('workspace session keys', () => {
  it('produces the same id for the same normalized path', () => {
    const a = workspaceIdFromPath('/Users/dev/project')
    const b = workspaceIdFromPath('/Users/dev/project')
    expect(a).toBe(b)
  })

  it('produces different ids for different paths', () => {
    const a = workspaceIdFromPath('/Users/dev/project-a')
    const b = workspaceIdFromPath('/Users/dev/project-b')
    expect(a).not.toBe(b)
  })

  it('normalizeWorkspaceRoot resolves relative paths stably', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-ws-'))
    try {
      const first = await normalizeWorkspaceRoot(root)
      const second = await normalizeWorkspaceRoot(root)
      expect(first).toBe(second)
      expect(workspaceIdFromPath(first)).toBe(workspaceIdFromPath(second))
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
