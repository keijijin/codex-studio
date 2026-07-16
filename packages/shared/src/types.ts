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

export type LLMProviderId = 'openai' | 'anthropic' | 'ollama'

export const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434'

export interface ModelInfo {
  id: string
  name: string
  provider: LLMProviderId
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
    ollamaBaseUrl?: string
  }
  agent: {
    maxIterations: number
    yoloMode: boolean
  }
}

export const DEFAULT_SETTINGS: AppSettings = {
  general: {
    theme: 'dark',
    language: 'ja',
  },
  models: {
    defaultProvider: 'openai',
    defaultChatModel: 'gpt-4o',
    defaultAgentModel: 'gpt-4o',
    ollamaBaseUrl: DEFAULT_OLLAMA_BASE_URL,
  },
  agent: {
    maxIterations: 100,
    yoloMode: false,
  },
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
