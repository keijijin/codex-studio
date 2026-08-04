/** Persona definition — voice and priorities (separate from Rules / Skills). */

export interface PersonaMeta {
  name: string
  description?: string
}

export interface PersonaFile {
  id: string
  name: string
  description: string
  absolutePath: string
  relativePath: string
  /** Body injected into the system prompt */
  body: string
  /** Workspace vs global (for Settings CRUD) */
  scope: 'workspace' | 'global'
  editable: boolean
}

export interface PersonaMatch {
  persona: PersonaFile
  /** Remaining user text after `/persona name` */
  args: string
  /** True when `/persona clear` or `/persona off` */
  clear?: boolean
}

export interface PersonaSaveParams {
  /** Persona id / file stem, e.g. mentor */
  name: string
  description?: string
  content: string
  scope: 'workspace' | 'global'
  /** When updating an existing persona */
  absolutePath?: string
}

export interface TurnTrace {
  personaId?: string
  personaName?: string
  provider?: string
  model?: string
  routeReason?: string
  usage?: {
    inputTokens: number
    outputTokens: number
    cachedInputTokens: number
    latencyMs: number
    estimatedCostUsd: number
  }
  toolCount?: number
}
