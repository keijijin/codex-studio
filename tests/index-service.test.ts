import { mkdtemp, writeFile, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { describe, expect, it } from 'vitest'
import { IndexService } from '../packages/indexer/src/index-service'

describe('IndexService incremental updates', () => {
  it('upserts and removes indexed files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-index-'))
    const filePath = join(root, 'sample.txt')

    try {
      await writeFile(filePath, 'hello', 'utf-8')

      const service = new IndexService()
      await service.scan(root)
      expect(service.getStatus().totalFiles).toBe(1)

      await service.upsertFile(root, filePath)
      expect(service.getStatus().totalFiles).toBe(1)

      service.removeFile(filePath)
      expect(service.getStatus().totalFiles).toBe(0)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
