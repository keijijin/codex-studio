import { readdir, readFile, stat } from 'fs/promises'
import { basename, join, relative } from 'path'
import type { SkillFile, SkillMatch, SkillMeta } from '@codex/shared'

function parseSkillFrontmatter(raw: string): { meta: Partial<SkillMeta>; body: string } {
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
  const meta: Partial<SkillMeta> = {}
  for (const line of fm.split(/\r?\n/)) {
    const nameMatch = line.match(/^name:\s*(.+)\s*$/)
    if (nameMatch) {
      meta.name = nameMatch[1].replace(/^["']|["']$/g, '').trim()
      continue
    }
    const descMatch = line.match(/^description:\s*(.+)\s*$/)
    if (descMatch) {
      meta.description = descMatch[1].replace(/^["']|["']$/g, '').trim()
      continue
    }
    const hintMatch = line.match(/^argument-hint:\s*(.+)\s*$/i)
    if (hintMatch) {
      meta.argumentHint = hintMatch[1].replace(/^["']|["']$/g, '').trim()
    }
  }
  return { meta, body }
}

async function loadSkillFile(absolutePath: string, workspaceRoot: string): Promise<SkillFile | null> {
  try {
    const raw = await readFile(absolutePath, 'utf-8')
    const { meta, body } = parseSkillFrontmatter(raw)
    const fallbackName = basename(absolutePath, '.md')
    const dirName = basename(join(absolutePath, '..'))
    const name = (meta.name ?? (fallbackName === 'SKILL' ? dirName : fallbackName))
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
      argumentHint: meta.argumentHint,
    }
  } catch {
    return null
  }
}

async function collectFromDir(dir: string, workspaceRoot: string, out: SkillFile[]): Promise<void> {
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
    if (st.isDirectory()) {
      const skillMd = join(full, 'SKILL.md')
      const skill = await loadSkillFile(skillMd, workspaceRoot)
      if (skill) out.push(skill)
    } else if (st.isFile() && entry.endsWith('.md') && entry !== 'SKILL.md') {
      const skill = await loadSkillFile(full, workspaceRoot)
      if (skill) out.push(skill)
    }
  }
}

/** Load skills from workspace + optional global shared dir. */
export async function collectSkills(
  workspaceRoot: string,
  options?: { globalSkillsDir?: string },
): Promise<SkillFile[]> {
  const out: SkillFile[] = []
  if (options?.globalSkillsDir) {
    await collectFromDir(options.globalSkillsDir, workspaceRoot, out)
  }
  await collectFromDir(join(workspaceRoot, '.codex', 'skills'), workspaceRoot, out)
  await collectFromDir(join(workspaceRoot, '.claude', 'skills'), workspaceRoot, out)
  // Prefer .codex over .claude / global for same name
  const byName = new Map<string, SkillFile>()
  for (const skill of out) {
    const existing = byName.get(skill.name)
    if (!existing) {
      byName.set(skill.name, skill)
      continue
    }
    if (skill.relativePath.startsWith('.codex/')) {
      byName.set(skill.name, skill)
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export function findSkill(skills: SkillFile[], name: string): SkillFile | undefined {
  const key = name.toLowerCase()
  return skills.find((s) => s.name === key)
}

/**
 * Parse `/skillname rest of message` from user input.
 * Returns null if the message is not a skill invocation.
 */
export function parseSkillInvocation(
  content: string,
  skills: SkillFile[],
): SkillMatch | null {
  const match = content.match(/^\/([a-zA-Z0-9_-]+)(?:\s+([\s\S]*))?$/)
  if (!match) return null
  const skill = findSkill(skills, match[1])
  if (!skill) return null
  return { skill, args: (match[2] ?? '').trim() }
}

export function formatSkillPrompt(skill: SkillFile, args: string): string {
  const argBlock = args
    ? `\n\n## User arguments\n${args}`
    : '\n\n## User arguments\n(none — follow the skill instructions using workspace context)'
  return `## Skill: /${skill.name}
${skill.description ? `${skill.description}\n` : ''}
### Instructions
${skill.body}${argBlock}`
}

/** User-visible message after skill expansion (keeps chat readable). */
export function formatSkillUserMessage(skill: SkillFile, args: string): string {
  return args
    ? `/${skill.name} ${args}`
    : `/${skill.name}`
}
