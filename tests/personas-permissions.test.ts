import { describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  collectPersonas,
  findPersona,
  formatPersonaPrompt,
  parsePersonaInvocation,
} from '@codex/agent-core'
import {
  matchPermissionProfile,
  normalizePermissionProfile,
  PERMISSION_PROFILES,
} from '@codex/shared'

describe('personas loader', () => {
  it('loads workspace personas and parses /persona invocation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-persona-'))
    await mkdir(join(root, '.codex', 'personas'), { recursive: true })
    await writeFile(
      join(root, '.codex', 'personas', 'mentor.md'),
      `---
name: mentor
description: Mentors patiently
---
Explain step by step.
`,
      'utf-8',
    )

    const personas = await collectPersonas(root)
    expect(personas.map((p) => p.name)).toContain('mentor')
    const mentor = findPersona(personas, 'mentor')
    expect(mentor?.description).toContain('Mentors')

    const match = parsePersonaInvocation('/persona mentor この関数を説明して', personas)
    expect(match?.persona.name).toBe('mentor')
    expect(match?.args).toBe('この関数を説明して')
    expect(match?.clear).toBeFalsy()
    expect(formatPersonaPrompt(mentor!)).toContain('Active Persona: mentor')
    expect(formatPersonaPrompt(mentor!)).toContain('Explain step by step')
    expect(mentor?.scope).toBe('workspace')

    const clear = parsePersonaInvocation('/persona clear', personas)
    expect(clear?.clear).toBe(true)
    expect(parsePersonaInvocation('/persona off', personas)?.clear).toBe(true)
  })
})

describe('permission profiles', () => {
  it('normalizes legacy CLI aliases', () => {
    expect(normalizePermissionProfile('ask')).toBe('coding')
    expect(normalizePermissionProfile('allow')).toBe('yolo')
    expect(normalizePermissionProfile('coding')).toBe('coding')
    expect(normalizePermissionProfile('nope')).toBeNull()
  })

  it('matches presets including yoloMode', () => {
    expect(matchPermissionProfile(PERMISSION_PROFILES.readonly)).toBe('readonly')
    expect(matchPermissionProfile(PERMISSION_PROFILES.coding)).toBe('coding')
    expect(matchPermissionProfile(PERMISSION_PROFILES.yolo)).toBe('yolo')
    expect(matchPermissionProfile(PERMISSION_PROFILES.coding, true)).toBe('yolo')
    expect(
      matchPermissionProfile({
        ...PERMISSION_PROFILES.coding,
        network: 'deny',
      }),
    ).toBe('custom')
  })
})
