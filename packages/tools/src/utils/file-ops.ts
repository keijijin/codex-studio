import type { ToolContext } from '../types'
import { backupFile } from './backup'

export async function readTextFile(
  ctx: ToolContext,
  pathArg: string,
): Promise<{ resolved: string; content: string }> {
  const resolved = ctx.fs.resolve(pathArg)
  let content = ''
  try {
    content = await ctx.fs.readText(pathArg)
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
  await ctx.fs.writeText(resolved, newContent)
  ctx.onFileChanged?.(resolved)
}

export async function applyDelete(
  ctx: ToolContext,
  resolved: string,
  oldContent: string,
): Promise<void> {
  if (oldContent !== '') {
    await backupFile(ctx.sessionId, resolved, oldContent)
  }
  await ctx.fs.unlink(resolved)
  ctx.onFileChanged?.(resolved)
}
