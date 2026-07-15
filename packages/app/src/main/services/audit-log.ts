import { appendFile, mkdir } from 'fs/promises'
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
