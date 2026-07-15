import { describe, expect, it } from 'vitest'
import { WorkspaceService } from '../packages/app/src/main/services/workspace'

describe('WorkspaceService path sandbox', () => {
  const service = new WorkspaceService()

  it('rejects paths outside workspace after open', async () => {
    await service.open(process.cwd())
    expect(() => service.resolveWithinWorkspace('/etc/passwd')).toThrow(/outside workspace/)
  })

  it('resolves relative paths within workspace', async () => {
    const root = process.cwd()
    await service.open(root)
    const resolved = service.resolveWithinWorkspace('README.md')
    expect(resolved.startsWith(root)).toBe(true)
  })
})
