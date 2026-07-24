export interface Workspace {
  id: string
  rootPaths: string[]
  name: string
  openedAt: string
}

export interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileNode[]
}

export interface Session {
  id: string
  workspaceId: string
  /** Absolute workspace root path — used to restore chats per folder */
  workspaceRoot?: string
  title: string
  mode: 'ask' | 'agent' | 'plan'
  modelId: string
  createdAt: string
  updatedAt: string
}

import type { ToolCallRecord } from './agent'

export interface Message {
  id: string
  sessionId: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  attachments?: Attachment[]
  toolCalls?: ToolCallRecord[]
  createdAt: string
}

export interface Attachment {
  type: 'file' | 'folder' | 'selection'
  path: string
  name: string
  content?: string
}

export type LLMProviderId = 'openai' | 'anthropic' | 'ollama' | 'xai'

export const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434'
export const DEFAULT_XAI_BASE_URL = 'https://api.x.ai/v1'
export const DEFAULT_XAI_MODEL = 'grok-4.5'

export interface ModelInfo {
  id: string
  name: string
  provider: LLMProviderId
}

import type { AgentPermissions } from './permissions'
import { DEFAULT_AGENT_PERMISSIONS } from './permissions'
import { DEFAULT_ROUTING, type RoutingSettings } from './routing'

export interface CostSettings {
  /** Append LLM usage lines to logs/usage.jsonl (default true) */
  logUsage: boolean
  /** Cap completion tokens per Chat turn (default 4096) */
  maxOutputTokens: number
  /** Cap completion tokens per Agent LLM call (default 8192) */
  maxOutputTokensAgent: number
  /** Soft daily spend cap in USD; 0 = unlimited (default 5) */
  dailyBudgetUsd: number
  /** Enable Anthropic/OpenAI-style prompt caching when supported (default true) */
  enablePromptCache: boolean
}

export const DEFAULT_COST_SETTINGS: CostSettings = {
  logUsage: true,
  maxOutputTokens: 4096,
  maxOutputTokensAgent: 8192,
  dailyBudgetUsd: 5,
  enablePromptCache: true,
}

export interface AppSettings {
  general: {
    theme: 'dark' | 'light' | 'system'
    language: 'ja' | 'en'
  }
  models: {
    defaultProvider: LLMProviderId
    defaultChatModel: string
    defaultAgentModel: string
    openaiApiKey?: string
    anthropicApiKey?: string
    /** xAI (Grok) API key */
    xaiApiKey?: string
    ollamaBaseUrl?: string
    /** Override xAI OpenAI-compatible base (default https://api.x.ai/v1) */
    xaiBaseUrl?: string
  }
  /** Multi-model routing (fixed | auto | fallback-only). Default: fixed. */
  routing: RoutingSettings
  agent: {
    maxIterations: number
    yoloMode: boolean
    permissions: AgentPermissions
    /** Auto-compact when estimated history tokens exceed this (0 = off) */
    compactTokenThreshold: number
    /** Append session notes to .codex/memory/MEMORY.md after Agent completes */
    autoMemory: boolean
    /** Max concurrent Task subagents (1–8) */
    maxSubagents: number
  }
  /** Cost controls and usage logging */
  cost: CostSettings
}

export const DEFAULT_SETTINGS: AppSettings = {
  general: {
    theme: 'dark',
    language: 'ja',
  },
  models: {
    defaultProvider: 'openai',
    defaultChatModel: 'gpt-5.4-mini',
    defaultAgentModel: 'gpt-5.4-mini',
    ollamaBaseUrl: DEFAULT_OLLAMA_BASE_URL,
  },
  routing: { ...DEFAULT_ROUTING, fallbackChain: [...DEFAULT_ROUTING.fallbackChain] },
  agent: {
    maxIterations: 50,
    yoloMode: false,
    permissions: { ...DEFAULT_AGENT_PERMISSIONS },
    compactTokenThreshold: 40_000,
    autoMemory: false,
    maxSubagents: 3,
  },
  cost: { ...DEFAULT_COST_SETTINGS },
}

export type AgentEvent =
  | { type: 'text_delta'; content: string }
  | { type: 'tool_call_start'; tool: string; args: unknown }
  | { type: 'tool_call_result'; tool: string; result: unknown }
  | { type: 'done'; usage?: { totalTokens: number } }
  | { type: 'error'; message: string }

export interface IndexStatus {
  state: 'idle' | 'indexing' | 'ready' | 'error'
  totalFiles: number
  indexedFiles: number
  message?: string
}
