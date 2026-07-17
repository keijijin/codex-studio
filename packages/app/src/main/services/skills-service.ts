import { join } from 'path'
import { homedir } from 'os'
import { collectSkills, parseSkillInvocation } from '@codex/agent-core'
import type { SkillFile, SkillMatch } from '@codex/shared'
import { workspaceService } from './workspace'

/** Shared skills across projects (Phase D). */
export function globalSkillsDir(): string {
  return join(homedir(), '.codex-studio', 'skills')
}

export class SkillsService {
  async list(): Promise<SkillFile[]> {
    const root = workspaceService.getRoot()
    if (!root) return []
    return collectSkills(root, { globalSkillsDir: globalSkillsDir() })
  }

  async matchInvocation(content: string): Promise<SkillMatch | null> {
    const skills = await this.list()
    if (skills.length === 0) return null
    return parseSkillInvocation(content, skills)
  }
}

export const skillsService = new SkillsService()
