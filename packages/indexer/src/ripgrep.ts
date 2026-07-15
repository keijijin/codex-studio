import { spawn } from 'child_process'
import { createRequire } from 'module'
import { existsSync } from 'fs'
import { readFile } from 'fs/promises'
import { dirname, join, relative } from 'path'
import { fileURLToPath } from 'url'
import type { SearchResult } from '@codex/shared'

const MAX_SEARCH_RESULTS = 200
const TEXT_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.css', '.html', '.yaml', '.yml',
  '.py', '.rs', '.go', '.sql', '.sh', '.txt', '.xml', '.toml', '.vue', '.svelte',
])

let rgPathCache: string | null | undefined

function getRequireRoots(): string[] {
  const roots = new Set<string>([process.cwd()])

  try {
    let dir = dirname(fileURLToPath(import.meta.url))
    for (let i = 0; i < 10; i++) {
      roots.add(dir)
      dir = dirname(dir)
    }
  } catch {
    // ignore
  }

  for (const dir of [...roots]) {
    roots.add(join(dir, 'packages/indexer'))
    roots.add(join(dir, 'packages/app'))
  }

  return [...roots]
}

function resolveRgPath(): string | null {
  if (rgPathCache !== undefined) return rgPathCache

  for (const root of getRequireRoots()) {
    const manifest = join(root, 'package.json')
    if (!existsSync(manifest)) continue

    try {
      const req = createRequire(manifest)
      const p = (req('@vscode/ripgrep') as { rgPath: string }).rgPath
      if (p && existsSync(p)) {
        rgPathCache = p
        return p
      }
    } catch {
      // try next root
    }
  }

  rgPathCache = null
  return null
}

export async function searchWithRipgrep(root: string, query: string): Promise<SearchResult[]> {
  const rgPath = resolveRgPath()
  if (!rgPath) {
    console.warn('[indexer] ripgrep binary not found')
    return []
  }

  return new Promise((resolve) => {
    const args = [
      '--json',
      '-F',
      query,
      '--glob', '!.git/**',
      '--glob', '!node_modules/**',
      '--glob', '!dist/**',
      '--glob', '!out/**',
      '--glob', '!release/**',
      root,
    ]

    const proc = spawn(rgPath, args, { cwd: root })
    const results: SearchResult[] = []
    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    proc.on('close', (code) => {
      if (code !== 0 && code !== 1 && stderr) {
        console.warn('[indexer] ripgrep stderr:', stderr.trim())
      }
      for (const line of stdout.split('\n')) {
        if (!line.trim() || results.length >= MAX_SEARCH_RESULTS) continue
        try {
          const parsed = JSON.parse(line) as {
            type: string
            data: {
              path: { text: string }
              line_number: number
              lines: { text: string }
              submatches: { start: number }[]
            }
          }
          if (parsed.type !== 'match') continue
          results.push({
            path: parsed.data.path.text,
            relativePath: relative(root, parsed.data.path.text),
            line: parsed.data.line_number,
            column: parsed.data.submatches[0]?.start ?? 0,
            text: parsed.data.lines.text.trimEnd(),
          })
        } catch {
          // skip
        }
      }
      resolve(results)
    })

    proc.on('error', (err) => {
      console.warn('[indexer] ripgrep spawn error:', err.message)
      resolve([])
    })
  })
}

interface IndexedFile {
  path: string
  relativePath: string
}

/** Fallback when ripgrep is unavailable. */
export async function searchInFiles(
  root: string,
  query: string,
  files: IndexedFile[],
): Promise<SearchResult[]> {
  const lower = query.toLowerCase()
  const results: SearchResult[] = []

  for (const file of files) {
    if (results.length >= MAX_SEARCH_RESULTS) break
    const ext = file.relativePath.slice(file.relativePath.lastIndexOf('.'))
    if (ext && !TEXT_EXTENSIONS.has(ext.toLowerCase())) continue

    let content: string
    try {
      content = await readFile(file.path, 'utf-8')
    } catch {
      continue
    }

    const lines = content.split('\n')
    for (let i = 0; i < lines.length; i++) {
      if (results.length >= MAX_SEARCH_RESULTS) break
      if (lines[i].toLowerCase().includes(lower)) {
        results.push({
          path: file.path,
          relativePath: file.relativePath,
          line: i + 1,
          column: lines[i].toLowerCase().indexOf(lower),
          text: lines[i].trimEnd(),
        })
      }
    }
  }

  return results
}
