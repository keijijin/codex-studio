import type { LLMProviderId } from '../types'
import type { CostTier, ModelCatalogSnapshot } from './catalog'

export type RoutingMode = 'fixed' | 'auto' | 'fallback-only'

export type TaskKind =
  | 'chat_simple'
  | 'chat_long'
  | 'agent_code'
  | 'agent_explore'
  | 'agent_hard'
  | 'team'
  | 'unknown'

export interface ModelCandidate {
  provider: LLMProviderId
  model: string
}

export interface RoutingDecision {
  mode: RoutingMode
  selected: ModelCandidate
  reason: string
  queue: ModelCandidate[]
  taskKind?: TaskKind
  tier?: CostTier
  complexityScore?: number
}

export interface DecideRoutingInput {
  mode: RoutingMode
  primary: ModelCandidate
  fallbackChain: ModelCandidate[]
  profiles?: Partial<Record<TaskKind, ModelCandidate[]>>
  maxAttempts: number
  /** Return false to skip (missing key, etc.). */
  isAvailable: (candidate: ModelCandidate) => boolean
  prompt?: string
  runMode: 'chat' | 'agent'
  isTeam?: boolean
  /** Resolved / refreshed model catalog for Auto profiles */
  catalog?: ModelCatalogSnapshot
}
