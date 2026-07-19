export { isRetryableError, isConnectionError } from './errors'
export { classifyTaskKind, classifyTask } from './classify'
export { decideRouting, BUILTIN_AUTO_PROFILES, builtinProfileFor } from './decide'
export {
  buildCatalogFromAvailability,
  buildCostOptimizedProfile,
  cascadeTiers,
  createDefaultCatalog,
  CATALOG_TTL_MS,
  DEFAULT_PROVIDER_TIERS,
  isCatalogExpired,
  PREFERRED_MODEL_ALIASES,
  resolveModelId,
  resolveProviderTiers,
  type CostTier,
  type ModelCatalogSnapshot,
  type ProviderTier,
} from './catalog'
export type {
  RoutingMode,
  TaskKind,
  ModelCandidate,
  RoutingDecision,
  DecideRoutingInput,
} from './types'
