import { describe, expect, it } from 'vitest'
import { createWorkspaceFs, teamTool } from '@codex/tools'

describe('S-TEAM-01 Team approval gate', () => {
  it('requires approval so edit:ask cannot bypass the orchestrator gate', () => {
    expect(teamTool.requiresApproval).toBe(true)
  })

  it('preview returns metadata for the approval UI', async () => {
    const fs = createWorkspaceFs('/tmp')
    const result = await teamTool.execute(
      {
        workspaceRoot: '/tmp',
        sessionId: 's',
        signal: new AbortController().signal,
        executeMode: 'preview',
        fs,
        resolvePath: (p) => fs.resolve(p),
        getRelativePath: (p) => p,
      },
      { team: 'review-squad', prompt: 'review this' },
    )
    expect(result.success).toBe(true)
    expect(result.metadata?.relativePath).toBe('team:review-squad')
    expect(result.metadata?.action).toBe('edit')
  })
})
