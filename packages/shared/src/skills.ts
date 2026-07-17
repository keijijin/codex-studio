/** Skill definition (Claude Code–style reusable workflow). */
export interface SkillMeta {
  name: string
  description?: string
  /** Optional argument hint shown in UI */
  argumentHint?: string
}

export interface SkillFile {
  id: string
  name: string
  description: string
  absolutePath: string
  relativePath: string
  /** Instruction body injected when the skill is invoked */
  body: string
  argumentHint?: string
}

export interface SkillMatch {
  skill: SkillFile
  /** Remaining user text after `/name` */
  args: string
}
