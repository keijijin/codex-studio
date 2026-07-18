import { mkdir, writeFile } from 'fs/promises'
import { homedir } from 'os'
import { dirname, join } from 'path'

/**
 * Convert an absolute filesystem path into a backup-safe relative path.
 * Windows drive letters (`C:\...`) and UNC roots must not be joined as-is,
 * because `:` / leading `\\` break mkdir under `.codex-studio/backups`.
 */
export function toBackupRelativePath(absolutePath: string): string {
  return absolutePath
    .replace(/\\/g, '/')
    // Windows drive letter: C:/foo -> C/foo
    .replace(/^([A-Za-z]):(?:\/|$)/, '$1/')
    // UNC: //server/share/foo -> UNC/server/share/foo
    .replace(/^\/\/+/, 'UNC/')
    // Unix absolute
    .replace(/^\/+/, '')
    // Remaining Windows-invalid filename characters
    .replace(/[<>:"|?*]/g, '_')
}

export async function backupFile(
  sessionId: string,
  absolutePath: string,
  content: string,
): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const relative = toBackupRelativePath(absolutePath)
  // Split into segments so path.join never treats a drive letter as absolute.
  const segments = relative.split('/').filter(Boolean)
  const backupPath = join(
    homedir(),
    '.codex-studio',
    'backups',
    sessionId,
    timestamp,
    ...segments,
  )
  await mkdir(dirname(backupPath), { recursive: true })
  await writeFile(backupPath, content, 'utf-8')
  return backupPath
}
