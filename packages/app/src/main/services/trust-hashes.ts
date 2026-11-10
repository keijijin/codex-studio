import { createHash } from 'crypto'
import { existsSync, readFileSync } from 'fs'
import { join, resolve } from 'path'

export interface TrustContentHashes {
  hooksJson?: string
  agentEnv?: string
}

function hashFile(absolutePath: string): string | undefined {
  if (!existsSync(absolutePath)) return undefined
  try {
    const body = readFileSync(absolutePath)
    return createHash('sha256').update(body).digest('hex')
  } catch {
    return undefined
  }
}

/** Content hashes for trust-sensitive workspace files. */
export function computeTrustContentHashes(root: string): TrustContentHashes {
  const base = resolve(root)
  return {
    hooksJson: hashFile(join(base, '.codex', 'hooks.json')),
    agentEnv: hashFile(join(base, '.codex', 'agent.env')),
  }
}

export function trustHashesEqual(a: TrustContentHashes, b: TrustContentHashes): boolean {
  return (a.hooksJson ?? '') === (b.hooksJson ?? '') && (a.agentEnv ?? '') === (b.agentEnv ?? '')
}
