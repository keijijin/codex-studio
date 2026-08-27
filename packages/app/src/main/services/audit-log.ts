import { appendFile, mkdir, readFile, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

let logDirReady = false

async function ensureLogDir(): Promise<string> {
  const dir = join(app.getPath('userData'), 'logs')
  if (!logDirReady) {
    await mkdir(dir, { recursive: true })
    logDirReady = true
  }
  return dir
}

export function auditLogPath(): string {
  return join(app.getPath('userData'), 'logs', 'audit.jsonl')
}

export async function auditLog(event: string, detail: Record<string, unknown>): Promise<void> {
  try {
    const dir = await ensureLogDir()
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      event,
      ...detail,
    })
    await appendFile(join(dir, 'audit.jsonl'), `${line}\n`, 'utf-8')
  } catch {
    // audit must not break main flow
  }
}

/** Export recent audit lines to a timestamped JSONL copy under userData/exports. */
export async function exportAuditLog(limit = 5000): Promise<{ path: string; lines: number }> {
  const src = auditLogPath()
  const exportDir = join(app.getPath('userData'), 'exports')
  await mkdir(exportDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dest = join(exportDir, `audit-${stamp}.jsonl`)

  if (!existsSync(src)) {
    await writeFile(dest, '', 'utf-8')
    return { path: dest, lines: 0 }
  }

  const raw = await readFile(src, 'utf-8')
  const lines = raw.split('\n').filter(Boolean)
  const slice = lines.slice(-Math.max(1, limit))
  await writeFile(dest, `${slice.join('\n')}\n`, 'utf-8')
  return { path: dest, lines: slice.length }
}
