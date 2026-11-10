import { describe, expect, it } from 'vitest'
import { createHash } from 'crypto'
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { computeTrustContentHashes } from '../../packages/app/src/main/services/trust-hashes'

describe('S-TRUST-01 content hashes', () => {
  it('hashes hooks.json and agent.env; missing files are undefined', () => {
    const root = mkdtempSync(join(tmpdir(), 'codex-trust-hash-'))
    try {
      mkdirSync(join(root, '.codex'), { recursive: true })
      const hooks = '{"version":1}\n'
      const agentEnv = 'KUBECONFIG=/tmp/kube\n'
      writeFileSync(join(root, '.codex', 'hooks.json'), hooks)
      writeFileSync(join(root, '.codex', 'agent.env'), agentEnv)

      const hashes = computeTrustContentHashes(root)
      expect(hashes.hooksJson).toBe(createHash('sha256').update(hooks).digest('hex'))
      expect(hashes.agentEnv).toBe(createHash('sha256').update(agentEnv).digest('hex'))

      const empty = mkdtempSync(join(tmpdir(), 'codex-trust-empty-'))
      try {
        const none = computeTrustContentHashes(empty)
        expect(none.hooksJson).toBeUndefined()
        expect(none.agentEnv).toBeUndefined()
      } finally {
        rmSync(empty, { recursive: true, force: true })
      }
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('detects content change when agent.env is edited', () => {
    const root = mkdtempSync(join(tmpdir(), 'codex-trust-change-'))
    try {
      mkdirSync(join(root, '.codex'), { recursive: true })
      writeFileSync(join(root, '.codex', 'agent.env'), 'OC_TOKEN=one\n')
      const before = computeTrustContentHashes(root)
      writeFileSync(join(root, '.codex', 'agent.env'), 'OC_TOKEN=two\n')
      const after = computeTrustContentHashes(root)
      expect(before.agentEnv).not.toBe(after.agentEnv)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
