import { mkdir, mkdtemp, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { WorkspaceService } from '../packages/app/src/main/services/workspace'
import type { FileNode } from '@codex/shared'

function findNode(nodes: FileNode[], name: string): FileNode | undefined {
  for (const node of nodes) {
    if (node.name === name) return node
    if (node.children) {
      const found = findNode(node.children, name)
      if (found) return found
    }
  }
  return undefined
}

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

  it('uses a stable workspace id for the same path', async () => {
    const root = process.cwd()
    const first = await service.open(root)
    const second = await service.open(root)
    expect(first.id).toBe(second.id)
    expect(first.id).toHaveLength(24)
  })

  it('includes files nested deeper than 7 directory levels', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-deep-tree-'))
    let current = root
    for (let i = 1; i <= 12; i++) {
      current = join(current, `level${i}`)
      await mkdir(current)
    }
    await writeFile(join(current, 'deep.txt'), 'ok', 'utf-8')

    await service.open(root)
    const tree = await service.getFileTree()
    const deepFile = findNode(tree, 'deep.txt')
    expect(deepFile?.type).toBe('file')
    expect(deepFile?.path.endsWith(join('level12', 'deep.txt'))).toBe(true)
  })
})
