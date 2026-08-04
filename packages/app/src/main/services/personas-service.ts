import { mkdir, writeFile, unlink } from 'fs/promises'
import { basename, dirname, join, resolve } from 'path'
import { homedir } from 'os'
import {
  collectPersonas,
  findPersona,
  formatPersonaPrompt,
  formatPersonaUserMessage,
  parsePersonaInvocation,
  serializePersonaFile,
} from '@codex/agent-core'
import type { PersonaFile, PersonaMatch, PersonaSaveParams } from '@codex/shared'
import { isPathInsideRoot } from '@codex/shared'
import { workspaceService } from './workspace'

export function globalPersonasDir(): string {
  return join(homedir(), '.codex-studio', 'personas')
}

function assertSafePersonaName(name: string): string {
  const base = basename(name.trim().toLowerCase()).replace(/\.md$/i, '')
  if (!base || base.includes('..') || !/^[a-z0-9_-]+$/.test(base)) {
    throw new Error('Invalid persona name (use a-z, 0-9, _, -)')
  }
  return `${base}.md`
}

export class PersonasService {
  async list(): Promise<PersonaFile[]> {
    const root = workspaceService.getRoot()
    if (!root) return []
    return collectPersonas(root, { globalPersonasDir: globalPersonasDir() })
  }

  async matchInvocation(content: string): Promise<PersonaMatch | null> {
    const personas = await this.list()
    return parsePersonaInvocation(content, personas)
  }

  async resolveDefault(name: string | undefined): Promise<PersonaFile | null> {
    if (!name?.trim()) return null
    const personas = await this.list()
    return findPersona(personas, name.trim()) ?? null
  }

  formatPrompt(persona: PersonaFile): string {
    return formatPersonaPrompt(persona)
  }

  formatUserMessage(persona: PersonaFile, args: string): string {
    return formatPersonaUserMessage(persona, args)
  }

  async save(params: PersonaSaveParams): Promise<PersonaFile> {
    const fileName = assertSafePersonaName(params.name)
    const personaName = fileName.replace(/\.md$/i, '')
    const raw = serializePersonaFile(
      {
        name: personaName,
        description: params.description?.trim() || undefined,
      },
      params.content,
    )

    let absolutePath = params.absolutePath
    if (absolutePath) {
      const resolved = resolve(absolutePath)
      const allowedRoots = [resolve(globalPersonasDir())]
      const root = workspaceService.getRoot()
      if (root) allowedRoots.push(resolve(join(root, '.codex', 'personas')))
      if (!allowedRoots.some((dir) => isPathInsideRoot(dir, resolved))) {
        throw new Error('Cannot edit persona outside personas directories')
      }
      absolutePath = resolved
    } else if (params.scope === 'global') {
      absolutePath = join(globalPersonasDir(), fileName)
    } else {
      const root = workspaceService.getRoot()
      if (!root) throw new Error('Open a workspace to save project personas')
      absolutePath = join(root, '.codex', 'personas', fileName)
    }

    await mkdir(dirname(absolutePath), { recursive: true })
    await writeFile(absolutePath, raw, 'utf-8')

    const personas = await this.list()
    const saved = personas.find((p) => p.absolutePath === absolutePath)
    if (!saved) throw new Error('Persona saved but could not be reloaded')
    return saved
  }

  async remove(absolutePath: string): Promise<void> {
    const personas = await this.list()
    const target = personas.find((p) => p.absolutePath === absolutePath)
    if (!target) throw new Error('Persona not found')
    if (!target.editable) throw new Error('Persona is not editable')
    await unlink(absolutePath)
  }
}

export const personasService = new PersonasService()
