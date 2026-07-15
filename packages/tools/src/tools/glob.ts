import { readdir, stat } from 'fs/promises'
import { join, relative } from 'path'
import type { Tool, ToolContext, ToolResult } from '../types'

const MAX_RESULTS = 200
const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'out', 'release', '.codex-studio'])

function globToRegExp(pattern: string): RegExp {
  const normalized = pattern.replace(/\\/g, '/')
  let regex = '^'
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i]
    if (ch === '*') {
      if (normalized[i + 1] === '*') {
        regex += '.*'
        i++
      } else {
        regex += '[^/]*'
      }
    } else if (ch === '?') {
      regex += '.'
    } else if (/[.+^${}()|[\]\\]/.test(ch)) {
      regex += `\\${ch}`
    } else {
      regex += ch
    }
  }
  regex += '$'
  return new RegExp(regex)
}

async function walkFiles(
  root: string,
  dir: string,
  depth: number,
  results: string[],
): Promise<void> {
  if (depth > 8 || results.length >= MAX_RESULTS * 2) return

  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch {
    return
  }

  for (const entry of entries) {
    if (results.length >= MAX_RESULTS * 2) break
    const fullPath = join(dir, entry)
    let entryStat
    try {
      entryStat = await stat(fullPath)
    } catch {
      continue
    }

    if (entryStat.isDirectory()) {
      if (IGNORED_DIRS.has(entry)) continue
      await walkFiles(root, fullPath, depth + 1, results)
    } else if (entryStat.isFile()) {
      results.push(fullPath)
    }
  }
}

export const globTool: Tool = {
  name: 'Glob',
  description: 'Find files matching a glob pattern in the workspace (e.g. **/*.ts)',
  requiresApproval: false,
  parameters: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Glob pattern such as **/*.ts or src/**/*.tsx' },
    },
    required: ['pattern'],
  },
  async execute(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
    const pattern = String(args.pattern ?? '').trim()
    if (!pattern) {
      return { success: false, output: 'Error: pattern is required' }
    }

    try {
      const regex = globToRegExp(pattern.replace(/^\*\*\//, ''))
      const allFiles: string[] = []
      await walkFiles(ctx.workspaceRoot, ctx.workspaceRoot, 0, allFiles)

      const matched = allFiles
        .map((abs) => relative(ctx.workspaceRoot, abs))
        .filter((rel) => regex.test(rel.replace(/\\/g, '/')))
        .sort()
        .slice(0, MAX_RESULTS)

      if (matched.length === 0) {
        return { success: true, output: 'No files matched the pattern.' }
      }

      return {
        success: true,
        output: matched.join('\n'),
        metadata: { count: matched.length },
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Glob failed'
      return { success: false, output: `Error: ${message}` }
    }
  },
}
