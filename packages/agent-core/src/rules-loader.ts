import { readdir, readFile } from 'fs/promises'
import { basename, join, relative } from 'path'
import type { RuleFile, RuleMeta, RuleSource } from '@codex/shared'

const RULE_EXTENSIONS = ['.md', '.mdc']

export interface LoadRulesOptions {
  globalRulesDir?: string
  /** Workspace-relative or absolute paths that influence glob matching */
  contextPaths?: string[]
}

export function parseRuleFrontmatter(raw: string): { meta: RuleMeta; body: string } {
  const defaults: RuleMeta = { alwaysApply: true, globs: [] }
  const trimmed = raw.replace(/^\uFEFF/, '')
  if (!trimmed.startsWith('---\n') && !trimmed.startsWith('---\r\n')) {
    return { meta: defaults, body: trimmed.trim() }
  }

  const end = trimmed.indexOf('\n---', 4)
  if (end === -1) {
    return { meta: defaults, body: trimmed.trim() }
  }

  const fm = trimmed.slice(4, end).trim()
  const body = trimmed.slice(end + 4).replace(/^\r?\n/, '').trim()

  const meta: RuleMeta = { ...defaults }
  const lines = fm.split(/\r?\n/)
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const alwaysMatch = line.match(/^alwaysApply:\s*(true|false)\s*$/i)
    if (alwaysMatch) {
      meta.alwaysApply = alwaysMatch[1].toLowerCase() === 'true'
      i++
      continue
    }
    const descMatch = line.match(/^description:\s*(.+)\s*$/)
    if (descMatch) {
      meta.description = descMatch[1].replace(/^["']|["']$/g, '').trim()
      i++
      continue
    }
    if (/^globs:\s*$/.test(line)) {
      const globs: string[] = []
      i++
      while (i < lines.length && /^\s*-\s+/.test(lines[i])) {
        globs.push(lines[i].replace(/^\s*-\s+/, '').replace(/^["']|["']$/g, '').trim())
        i++
      }
      meta.globs = globs
      if (globs.length > 0 && !fm.includes('alwaysApply:')) {
        meta.alwaysApply = false
      }
      continue
    }
    const inlineGlobs = line.match(/^globs:\s*\[(.*)\]\s*$/)
    if (inlineGlobs) {
      meta.globs = inlineGlobs[1]
        .split(',')
        .map((s) => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean)
      if (meta.globs.length > 0 && !fm.includes('alwaysApply:')) {
        meta.alwaysApply = false
      }
      i++
      continue
    }
    i++
  }

  return { meta, body }
}

/** Minimal glob matcher for patterns such as `**`/`*.ts`, `src/**`, `*.md`. */
export function matchGlob(pattern: string, filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/')
  const pat = pattern.replace(/\\/g, '/').replace(/^\.\//, '')
  const escaped = pat
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '§§')
    .replace(/\*/g, '[^/]*')
    .replace(/§§/g, '.*')
  const re = new RegExp(`^${escaped}$`, 'i')
  if (re.test(normalized)) return true
  // also match against basename for patterns like *.ts
  if (!pat.includes('/')) {
    return re.test(basename(normalized))
  }
  return false
}

export function ruleApplies(meta: RuleMeta, contextPaths: string[] = []): boolean {
  if (meta.alwaysApply) return true
  if (meta.globs.length === 0) return true
  if (contextPaths.length === 0) {
    // No editor context → still include glob rules so Ask/Agent see project conventions
    return true
  }
  return contextPaths.some((p) => meta.globs.some((g) => matchGlob(g, p)))
}

export function serializeRuleFile(meta: RuleMeta, body: string): string {
  const lines = ['---']
  lines.push(`alwaysApply: ${meta.alwaysApply}`)
  if (meta.description) {
    lines.push(`description: ${meta.description}`)
  }
  if (meta.globs.length > 0) {
    lines.push('globs:')
    for (const g of meta.globs) {
      lines.push(`  - ${g}`)
    }
  }
  lines.push('---', '', body.trim(), '')
  return lines.join('\n')
}

async function readRulesDir(
  dir: string,
  source: RuleSource,
  editable: boolean,
): Promise<RuleFile[]> {
  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch {
    return []
  }

  const rules: RuleFile[] = []
  for (const entry of entries.sort()) {
    if (!RULE_EXTENSIONS.some((ext) => entry.endsWith(ext))) continue
    const absolutePath = join(dir, entry)
    try {
      const raw = await readFile(absolutePath, 'utf-8')
      const { meta, body } = parseRuleFrontmatter(raw)
      rules.push({
        id: absolutePath,
        name: entry,
        source,
        absolutePath,
        relativePath: entry,
        content: body,
        raw,
        meta,
        editable,
      })
    } catch {
      // skip unreadable
    }
  }
  return rules
}

export async function collectRules(
  workspaceRoot: string | null | undefined,
  options: LoadRulesOptions = {},
): Promise<RuleFile[]> {
  const dirs: Array<{ path: string; source: RuleSource; editable: boolean }> = []
  if (options.globalRulesDir) {
    dirs.push({ path: options.globalRulesDir, source: 'global', editable: true })
  }
  if (workspaceRoot) {
    dirs.push(
      { path: join(workspaceRoot, '.codex', 'rules'), source: 'workspace-codex', editable: true },
      { path: join(workspaceRoot, '.cursor', 'rules'), source: 'workspace-cursor', editable: true },
    )
  }

  const all: RuleFile[] = []
  for (const d of dirs) {
    all.push(...(await readRulesDir(d.path, d.source, d.editable)))
  }
  return all
}

export function formatRulesPrompt(rules: RuleFile[]): string {
  if (rules.length === 0) return ''
  const parts = rules.map((r) => {
    const origin =
      r.source === 'global' ? 'global' : r.source === 'workspace-cursor' ? '.cursor/rules' : '.codex/rules'
    return `### Rule: ${r.name} (${origin})\n${r.content.trim()}`
  })
  return `\n\n## Project Rules\n${parts.join('\n\n')}`
}

export async function loadRules(
  workspaceRoot: string | null | undefined,
  options: LoadRulesOptions = {},
): Promise<string> {
  const all = await collectRules(workspaceRoot, options)
  const rootNorm = workspaceRoot?.replace(/\\/g, '/') ?? ''
  const contextPaths = (options.contextPaths ?? []).map((p) => {
    const norm = p.replace(/\\/g, '/')
    if (rootNorm && (norm.startsWith(rootNorm + '/') || norm === rootNorm)) {
      return relative(workspaceRoot!, p).replace(/\\/g, '/') || basename(p)
    }
    return norm
  })
  const applicable = all.filter((r) => ruleApplies(r.meta, contextPaths))
  return formatRulesPrompt(applicable)
}
