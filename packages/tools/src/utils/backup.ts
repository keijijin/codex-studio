import { mkdir, writeFile } from 'fs/promises'
import { homedir } from 'os'
import { dirname, join } from 'path'

export async function backupFile(
  sessionId: string,
  absolutePath: string,
  content: string,
): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = join(
    homedir(),
    '.codex-studio',
    'backups',
    sessionId,
    timestamp,
    absolutePath.replace(/^\/+/, ''),
  )
  await mkdir(dirname(backupPath), { recursive: true })
  await writeFile(backupPath, content, 'utf-8')
  return backupPath
}
