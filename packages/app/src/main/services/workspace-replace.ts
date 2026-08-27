import { readFile } from 'fs/promises'
import { relative } from 'path'
import type { SearchResult } from '@codex/shared'
import { isPathInsideRoot } from '@codex/shared'
import { indexService } from '@codex/indexer'
import { pathIgnoreService } from './path-ignore-service'
import { workspaceService } from './workspace'

export interface WorkspaceReplaceParams {
  query: string
  replacement: string
  /** Absolute paths to modify. Empty = all current search matches for query. */
  paths?: string[]
}

export interface WorkspaceReplaceResult {
  filesChanged: number
  occurrences: number
  files: string[]
  errors: string[]
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0
  let count = 0
  let from = 0
  while (from <= haystack.length) {
    const idx = haystack.indexOf(needle, from)
    if (idx === -1) break
    count += 1
    from = idx + needle.length
  }
  return count
}

function replaceAll(haystack: string, needle: string, replacement: string): string {
  if (!needle) return haystack
  return haystack.split(needle).join(replacement)
}

export async function replaceInWorkspace(
  params: WorkspaceReplaceParams,
): Promise<WorkspaceReplaceResult> {
  const query = params.query.trim()
  const replacement = params.replacement
  if (!query) {
    throw new Error('検索語が空です')
  }

  const root = workspaceService.getRoot()
  if (!root) {
    throw new Error('ワークスペースが開かれていません')
  }

  const hits = await indexService.search(query)
  const pathFilter =
    params.paths && params.paths.length > 0
      ? new Set(params.paths.map((p) => workspaceService.resolveWithinWorkspace(p)))
      : null

  const byFile = new Map<string, SearchResult[]>()
  for (const hit of hits) {
    const abs = workspaceService.resolveWithinWorkspace(hit.path)
    if (pathFilter && !pathFilter.has(abs)) continue
    if (!isPathInsideRoot(root, abs)) continue
    const rel = relative(root, abs).replace(/\\/g, '/')
    if (pathIgnoreService.getRules().ignores(rel)) continue
    const list = byFile.get(abs) ?? []
    list.push(hit)
    byFile.set(abs, list)
  }

  let filesChanged = 0
  let occurrences = 0
  const files: string[] = []
  const errors: string[] = []

  for (const [abs] of byFile) {
    try {
      const original = await readFile(abs, 'utf-8')
      const count = countOccurrences(original, query)
      if (count === 0) continue
      const next = replaceAll(original, query, replacement)
      if (next === original) continue
      await workspaceService.writeFile(abs, next)
      filesChanged += 1
      occurrences += count
      files.push(relative(root, abs).replace(/\\/g, '/'))
    } catch (err) {
      errors.push(
        `${relative(root, abs).replace(/\\/g, '/')}: ${
          err instanceof Error ? err.message : 'replace failed'
        }`,
      )
    }
  }

  return { filesChanged, occurrences, files, errors }
}
