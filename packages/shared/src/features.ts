/** MCP server config (stdio). */
export interface McpServerConfig {
  id: string
  name: string
  enabled: boolean
  command: string
  args?: string[]
  env?: Record<string, string>
  /** Working directory; defaults to workspace root */
  cwd?: string
}

export interface TabCompletionSettings {
  enabled: boolean
  /** Debounce ms before requesting completion */
  debounceMs: number
  /** Max completion tokens */
  maxTokens: number
  /**
   * When false (default), skip Tab completion if the default provider is
   * Ollama / llama.cpp so Agent/Ask is not starved on a single local slot.
   */
  allowOnLocal?: boolean
}

export interface SemanticSearchSettings {
  enabled: boolean
  /** Prefer semantic over keyword for @codebase when enabled */
  preferSemantic: boolean
  embeddingModel: string
  maxChunks: number
}

export interface KeybindingMap {
  saveFile: string
  openFolder: string
  toggleAiPanel: string
  toggleTerminal: string
  toggleSidebarSearch: string
  compactChat: string
  checkUpdates: string
}

export const DEFAULT_KEYBINDINGS: KeybindingMap = {
  saveFile: 'Mod+S',
  openFolder: 'Mod+O',
  toggleAiPanel: 'Mod+Shift+A',
  toggleTerminal: 'Mod+`',
  toggleSidebarSearch: 'Mod+Shift+F',
  compactChat: 'Mod+Shift+C',
  checkUpdates: 'Mod+Shift+U',
}

export const DEFAULT_TAB_COMPLETION: TabCompletionSettings = {
  enabled: true,
  debounceMs: 400,
  maxTokens: 64,
  allowOnLocal: false,
}

export const DEFAULT_SEMANTIC_SEARCH: SemanticSearchSettings = {
  enabled: false,
  preferSemantic: true,
  embeddingModel: 'text-embedding-3-small',
  maxChunks: 24,
}

/** Langfuse LLM observability (self-host or Cloud). */
export interface LangfuseSettings {
  enabled: boolean
  /** Project public key (pk-…) */
  publicKey: string
  /** Project secret key (sk-…) — stored in OS secret store when available */
  secretKey: string
  /** API / UI base URL (default local self-host) */
  baseUrl: string
}

export const DEFAULT_LANGFUSE: LangfuseSettings = {
  enabled: false,
  publicKey: '',
  secretKey: '',
  baseUrl: 'http://localhost:3000',
}
