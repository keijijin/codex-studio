import { readdir, readFile, stat } from 'fs/promises'
import { basename, join, relative } from 'path'
import type { Attachment } from '@codex/shared'
import { indexService } from '@codex/indexer'
import { pathIgnoreService } from './path-ignore-service'
import { workspaceService } from './workspace'

/** Soft char budgets (~3–4 chars/token for ASCII). */
const FOLDER_BUDGET = 12_000
const CODEBASE_BUDGET = 16_000
const MAX_FOLDER_FILES = 48
const MAX_CODEBASE_HITS = 40
const EXCERPT_CHARS = 700
const PRIORITY_NAMES = new Set([
  'readme.md',
  'readme',
  'package.json',
  'tsconfig.json',
  'cargo.toml',
  'go.mod',
  'pyproject.toml',
  'dockerfile',
  'makefile',
  'skill.md',
  'agents.md',
])

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, Math.max(0, max - 20))}\n...(truncated)`
}

function isProbablyText(name: string): boolean {
  return /\.(ts|tsx|js|jsx|mjs|cjs|json|md|txt|yml|yaml|toml|py|rs|go|java|kt|css|scss|html|xml|sh|sql|vue|svelte)$/i.test(
    name,
  )
}

async function collectFolderFiles(
  absDir: string,
  root: string,
  out: string[],
  depth: number,
): Promise<void> {
  if (out.length >= MAX_FOLDER_FILES || depth > 6) return
  const rules = pathIgnoreService.getRules()
  let entries: string[]
  try {
    entries = await readdir(absDir)
  } catch {
    return
  }
  entries.sort((a, b) => a.localeCompare(b))

  const files: string[] = []
  const dirs: string[] = []
  for (const entry of entries) {
    const full = join(absDir, entry)
    const rel = relative(root, full).replace(/\\/g, '/')
    if (rules.ignores(rel)) continue
    let st
    try {
      st = await stat(full)
    } catch {
      continue
    }
    if (st.isDirectory()) dirs.push(full)
    else if (st.isFile() && isProbablyText(entry)) files.push(full)
  }

  files.sort((a, b) => {
    const an = basename(a).toLowerCase()
    const bn = basename(b).toLowerCase()
    const ap = PRIORITY_NAMES.has(an) ? 0 : 1
    const bp = PRIORITY_NAMES.has(bn) ? 0 : 1
    if (ap !== bp) return ap - bp
    return an.localeCompare(bn)
  })

  for (const f of files) {
    if (out.length >= MAX_FOLDER_FILES) return
    out.push(f)
  }
  for (const d of dirs) {
    if (out.length >= MAX_FOLDER_FILES) return
    await collectFolderFiles(d, root, out, depth + 1)
  }
}

async function materializeFolder(absPath: string): Promise<string> {
  const root = workspaceService.getRoot()
  if (!root) throw new Error('ワークスペースが開かれていません')
  const resolved = workspaceService.resolveWithinWorkspace(absPath)
  const st = await stat(resolved)
  if (!st.isDirectory()) throw new Error('フォルダではありません')

  const files: string[] = []
  await collectFolderFiles(resolved, root, files, 0)
  const relDir = relative(root, resolved).replace(/\\/g, '/') || '.'

  const lines: string[] = [`Folder: ${relDir}`, `Files (up to ${MAX_FOLDER_FILES}):`]
  let budget = FOLDER_BUDGET - 200

  for (const abs of files) {
    const rel = relative(root, abs).replace(/\\/g, '/')
    lines.push(`- ${rel}`)
  }
  lines.push('', 'Excerpts:')

  for (const abs of files) {
    if (budget < 200) {
      lines.push('(budget reached; further excerpts omitted)')
      break
    }
    const rel = relative(root, abs).replace(/\\/g, '/')
    try {
      const raw = await readFile(abs, 'utf-8')
      const excerpt = truncate(raw, Math.min(EXCERPT_CHARS, budget))
      const block = `\n### ${rel}\n\`\`\`\n${excerpt}\n\`\`\`\n`
      lines.push(block)
      budget -= block.length
    } catch {
      // skip unreadable
    }
  }

  return truncate(lines.join('\n'), FOLDER_BUDGET)
}

function keywordsFromPrompt(prompt: string): string[] {
  const cleaned = prompt
    .replace(/@codebase\S*/gi, ' ')
    .replace(/@[^\s]+/g, ' ')
    .replace(/[^\p{L}\p{N}_./-]+/gu, ' ')
    .trim()
  const parts = cleaned.split(/\s+/).filter((w) => w.length >= 2)
  const uniq: string[] = []
  for (const p of parts) {
    if (!uniq.includes(p)) uniq.push(p)
    if (uniq.length >= 8) break
  }
  return uniq
}

async function materializeCodebase(prompt: string, hint?: string): Promise<string> {
  const queries = hint?.trim()
    ? [hint.trim(), ...keywordsFromPrompt(prompt)]
    : keywordsFromPrompt(prompt)
  if (queries.length === 0) {
    return 'No search keywords found for @codebase. Mention symbols or file names in your message.'
  }

  const { settingsService } = await import('./settings')
  const settings = settingsService.get()
  const useSemantic =
    settings.semanticSearch?.enabled && settings.semanticSearch?.preferSemantic

  const seen = new Set<string>()
  const blocks: string[] = [
    `Codebase search (${useSemantic ? 'semantic' : 'keyword'}): ${queries.join(', ')}`,
  ]
  let budget = CODEBASE_BUDGET - 200
  let hits = 0

  for (const q of queries) {
    if (hits >= MAX_CODEBASE_HITS || budget < 200) break
    let results
    try {
      if (useSemantic) {
        const { semanticSearch } = await import('./semantic-index')
        results = await semanticSearch(q)
      } else {
        results = await indexService.search(q)
      }
    } catch {
      continue
    }
    for (const r of results.slice(0, 12)) {
      if (hits >= MAX_CODEBASE_HITS || budget < 200) break
      const key = `${r.relativePath}:${r.line}`
      if (seen.has(key)) continue
      seen.add(key)
      hits += 1
      const line = `${r.relativePath}:${r.line}: ${r.text.trim()}`
      blocks.push(line)
      budget -= line.length + 1
    }
  }

  if (hits === 0) {
    blocks.push('No matches found.')
  }

  return truncate(blocks.join('\n'), CODEBASE_BUDGET)
}

/**
 * Fill attachment.content for folder / codebase (and leave file content as-is).
 * `prompt` is used as keyword source for @codebase.
 */
export async function materializeAttachments(
  attachments: Attachment[],
  prompt = '',
): Promise<Attachment[]> {
  const out: Attachment[] = []
  for (const a of attachments) {
    if (a.type === 'file') {
      if (a.content) {
        out.push({ ...a, content: truncate(a.content, 40_000) })
        continue
      }
      try {
        const resolved = workspaceService.resolveWithinWorkspace(a.path)
        const content = truncate(await readFile(resolved, 'utf-8'), 40_000)
        out.push({ ...a, content })
      } catch (err) {
        out.push({
          ...a,
          content: `Error reading file: ${err instanceof Error ? err.message : 'failed'}`,
        })
      }
      continue
    }

    if (a.type === 'folder') {
      try {
        const content = await materializeFolder(a.path)
        out.push({ ...a, content })
      } catch (err) {
        out.push({
          ...a,
          content: `Error reading folder: ${err instanceof Error ? err.message : 'failed'}`,
        })
      }
      continue
    }

    if (a.type === 'codebase') {
      try {
        const hint = a.name !== 'codebase' ? a.name : undefined
        const content = await materializeCodebase(prompt, hint)
        out.push({ ...a, path: a.path || 'codebase', content })
      } catch (err) {
        out.push({
          ...a,
          content: `Error building codebase context: ${err instanceof Error ? err.message : 'failed'}`,
        })
      }
      continue
    }

    if (a.type === 'image') {
      if (a.content?.startsWith('data:')) {
        out.push(a)
        continue
      }
      try {
        const resolved = workspaceService.resolveWithinWorkspace(a.path)
        const buf = await readFile(resolved)
        const mime = a.mimeType || guessImageMime(a.name)
        const content = `data:${mime};base64,${buf.toString('base64')}`
        out.push({ ...a, content, mimeType: mime })
      } catch (err) {
        out.push({
          ...a,
          content: undefined,
          name: `${a.name} (failed: ${err instanceof Error ? err.message : 'read error'})`,
        })
      }
      continue
    }

    out.push(a)
  }
  return out
}

function guessImageMime(name: string): string {
  const lower = name.toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.gif')) return 'image/gif'
  return 'image/jpeg'
}

export function formatAttachmentBlock(a: Attachment): string {
  if (!a.content && a.type !== 'image') return ''
  if (a.type === 'image') {
    return `\n\n--- Attached image: ${a.name} (${a.mimeType ?? 'image'}) ---\n[image data attached for vision models]\n--- End ---`
  }
  const label =
    a.type === 'folder'
      ? 'Attached folder'
      : a.type === 'codebase'
        ? 'Codebase context'
        : a.type === 'selection'
          ? 'Attached selection'
          : 'Attached file'
  return `\n\n--- ${label}: ${a.name} (${a.path}) ---\n${a.content}\n--- End ---`
}

export function formatAttachments(attachments: Attachment[]): string {
  return attachments
    .filter((a) => a.content)
    .map(formatAttachmentBlock)
    .join('')
}
