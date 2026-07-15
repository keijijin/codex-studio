import { describe, expect, it } from 'vitest'
import { ToolRegistry, readTool } from '@codex/tools'
import { resolveWithinWorkspace, type ToolContext } from '@codex/tools'

function createCtx(root: string): ToolContext {
  return {
    workspaceRoot: root,
    sessionId: 'test',
    signal: new AbortController().signal,
    executeMode: 'apply',
    resolvePath: (p) => resolveWithinWorkspace(root, p),
    getRelativePath: (p) => p.replace(`${root}/`, ''),
  }
}

describe('ToolRegistry', () => {
  it('lists all or filtered tools', () => {
    const registry = new ToolRegistry([readTool])
    expect(registry.list()).toHaveLength(1)
    expect(registry.list(['Read'])).toHaveLength(1)
    expect(registry.list(['Write'])).toHaveLength(0)
  })

  it('gets tools case-insensitively', () => {
    const registry = new ToolRegistry([readTool])
    expect(registry.get('read')?.name).toBe('Read')
    expect(registry.get('READ')?.name).toBe('Read')
    expect(registry.get('Missing')).toBeUndefined()
  })

  it('returns error for unknown tool', async () => {
    const registry = new ToolRegistry([readTool])
    const result = await registry.execute('Unknown', {}, createCtx('/tmp/ws'))
    expect(result.success).toBe(false)
    expect(result.output).toContain('unknown tool')
  })

  it('returns error when signal is aborted', async () => {
    const registry = new ToolRegistry([readTool])
    const controller = new AbortController()
    controller.abort()
    const ctx = { ...createCtx('/tmp/ws'), signal: controller.signal }
    const result = await registry.execute('Read', { path: 'a.txt' }, ctx)
    expect(result.success).toBe(false)
    expect(result.output).toContain('cancelled')
  })
})
