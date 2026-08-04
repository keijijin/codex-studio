import { readdir, readFile, stat } from 'fs/promises'
import { basename, join, relative } from 'path'
import type { PersonaFile, PersonaMatch, PersonaMeta } from '@codex/shared'

function parsePersonaFrontmatter(raw: string): { meta: Partial<PersonaMeta>; body: string } {
  const trimmed = raw.replace(/^\uFEFF/, '')
  if (!trimmed.startsWith('---\n') && !trimmed.startsWith('---\r\n')) {
    return { meta: {}, body: trimmed.trim() }
  }
  const end = trimmed.indexOf('\n---', 4)
  if (end === -1) {
    return { meta: {}, body: trimmed.trim() }
  }
  const fm = trimmed.slice(4, end).trim()
  const body = trimmed.slice(end + 4).replace(/^\r?\n/, '').trim()
  const meta: Partial<PersonaMeta> = {}
  for (const line of fm.split(/\r?\n/)) {
    const nameMatch = line.match(/^name:\s*(.+)\s*$/)
    if (nameMatch) {
      meta.name = nameMatch[1].replace(/^["']|["']$/g, '').trim()
      continue
    }
    const descMatch = line.match(/^description:\s*(.+)\s*$/)
    if (descMatch) {
      meta.description = descMatch[1].replace(/^["']|["']$/g, '').trim()
    }
  }
  return { meta, body }
}

export function serializePersonaFile(meta: PersonaMeta, body: string): string {
  const lines = ['---', `name: ${meta.name}`]
  if (meta.description?.trim()) {
    lines.push(`description: ${meta.description.trim()}`)
  }
  lines.push('---', '', body.trim(), '')
  return lines.join('\n')
}

async function loadPersonaFile(
  absolutePath: string,
  workspaceRoot: string,
  scope: 'workspace' | 'global',
): Promise<PersonaFile | null> {
  try {
    const raw = await readFile(absolutePath, 'utf-8')
    const { meta, body } = parsePersonaFrontmatter(raw)
    const fallbackName = basename(absolutePath, '.md')
    const name = (meta.name ?? fallbackName)
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-')
    if (!name || !body) return null
    return {
      id: absolutePath,
      name,
      description: meta.description ?? '',
      absolutePath,
      relativePath: relative(workspaceRoot, absolutePath).replace(/\\/g, '/'),
      body,
      scope,
      editable: true,
    }
  } catch {
    return null
  }
}

async function collectFromDir(
  dir: string,
  workspaceRoot: string,
  scope: 'workspace' | 'global',
  out: PersonaFile[],
): Promise<void> {
  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch {
    return
  }
  for (const entry of entries) {
    const full = join(dir, entry)
    let st
    try {
      st = await stat(full)
    } catch {
      continue
    }
    if (st.isFile() && entry.endsWith('.md')) {
      const persona = await loadPersonaFile(full, workspaceRoot, scope)
      if (persona) out.push(persona)
    }
  }
}

export async function collectPersonas(
  workspaceRoot: string,
  options?: { globalPersonasDir?: string },
): Promise<PersonaFile[]> {
  const out: PersonaFile[] = []
  if (options?.globalPersonasDir) {
    await collectFromDir(options.globalPersonasDir, workspaceRoot, 'global', out)
  }
  await collectFromDir(join(workspaceRoot, '.codex', 'personas'), workspaceRoot, 'workspace', out)
  const byName = new Map<string, PersonaFile>()
  for (const persona of out) {
    const existing = byName.get(persona.name)
    if (!existing || persona.scope === 'workspace') {
      byName.set(persona.name, persona)
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export function findPersona(personas: PersonaFile[], name: string): PersonaFile | undefined {
  const key = name.toLowerCase().replace(/^\//, '')
  return personas.find((p) => p.name === key)
}

const CLEAR_NAMES = new Set(['clear', 'off', 'none', 'reset'])

/**
 * Parse `/persona name rest` or `/persona clear` from user input.
 * Returns a clear match (without persona) when clearing.
 */
export function parsePersonaInvocation(
  content: string,
  personas: PersonaFile[],
): PersonaMatch | null {
  const match = content.match(/^\/persona(?:\s+([a-zA-Z0-9_-]+))?(?:\s+([\s\S]*))?$/i)
  if (!match) return null
  const name = match[1]
  if (!name) return null
  if (CLEAR_NAMES.has(name.toLowerCase())) {
    return {
      persona: {
        id: '',
        name: 'clear',
        description: '',
        absolutePath: '',
        relativePath: '',
        body: '',
        scope: 'workspace',
        editable: false,
      },
      args: (match[2] ?? '').trim(),
      clear: true,
    }
  }
  const persona = findPersona(personas, name)
  if (!persona) return null
  return { persona, args: (match[2] ?? '').trim() }
}

export function formatPersonaPrompt(persona: PersonaFile): string {
  return `## Active Persona: ${persona.name}
${persona.description ? `${persona.description}\n` : ''}
### Persona instructions
${persona.body}`
}

export function formatPersonaUserMessage(persona: PersonaFile, args: string): string {
  return args ? `/persona ${persona.name} ${args}` : `/persona ${persona.name}`
}
