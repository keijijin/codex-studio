import { readFile, writeFile, unlink, mkdir } from 'fs/promises'
import { dirname } from 'path'
import type { ToolContext } from '../types'
import { backupFile } from './backup'

export async function readTextFile(ctx: ToolContext, pathArg: string): Promise<{ resolved: string; content: string }> {
  const resolved = ctx.resolvePath(pathArg)
  let content = ''
  try {
    content = await readFile(resolved, 'utf-8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
  }
  return { resolved, content }
}

export async function applyWrite(
  ctx: ToolContext,
  resolved: string,
  oldContent: string,
  newContent: string,
): Promise<void> {
  if (oldContent !== '') {
    await backupFile(ctx.sessionId, resolved, oldContent)
  }
  await mkdir(dirname(resolved), { recursive: true })
  await writeFile(resolved, newContent, 'utf-8')
  ctx.onFileChanged?.(resolved)
}

export async function applyDelete(ctx: ToolContext, resolved: string, oldContent: string): Promise<void> {
  if (oldContent !== '') {
    await backupFile(ctx.sessionId, resolved, oldContent)
  }
  await unlink(resolved)
  ctx.onFileChanged?.(resolved)
}
