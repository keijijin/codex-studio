import type {
  AppSettings,
  FileNode,
  IndexStatus,
  Message,
  Session,
  Workspace,
} from './types'
import type { ChatSendParams, SearchResult } from './chat'
import type { ChatStreamEvent } from './chat'
import type { LLMProviderId, ModelInfo } from './types'
import type { SessionMode } from './agent'
import type { RuleFile, RuleSaveParams } from './rules'
import type { SkillFile } from './skills'

/** IPC channel names (invoke) */
export const IPC_CHANNELS = {
  WORKSPACE_OPEN: 'workspace:open',
  WORKSPACE_CLOSE: 'workspace:close',
  WORKSPACE_GET: 'workspace:get',
  WORKSPACE_GET_TREE: 'workspace:getTree',
  WORKSPACE_RECENT_LIST: 'workspace:recentList',
  FILE_READ: 'file:read',
  FILE_WRITE: 'file:write',
  FILE_RESOLVE: 'file:resolve',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SESSION_LIST: 'session:list',
  SESSION_CREATE: 'session:create',
  SESSION_SELECT: 'session:select',
  SESSION_GET_MESSAGES: 'session:getMessages',
  DIALOG_OPEN_DIRECTORY: 'dialog:openDirectory',
  INDEX_STATUS: 'index:status',
  INDEX_SEARCH: 'index:search',
  CHAT_SEND: 'chat:send',
  CHAT_CANCEL: 'chat:cancel',
  MODELS_LIST: 'models:list',
  MODEL_CATALOG_GET: 'models:catalogGet',
  MODEL_CATALOG_REFRESH: 'models:catalogRefresh',
  SESSION_SET_MODE: 'session:setMode',
  AGENT_APPROVAL_RESPOND: 'agent:approvalRespond',
  TERMINAL_CREATE: 'terminal:create',
  TERMINAL_WRITE: 'terminal:write',
  TERMINAL_RESIZE: 'terminal:resize',
  TERMINAL_DESTROY: 'terminal:destroy',
  TERMINAL_CAPTURE_ENV: 'terminal:captureEnv',
  AGENT_ENV_STATUS: 'agentEnv:status',
  AGENT_ENV_CLEAR: 'agentEnv:clear',
  RULES_LIST: 'rules:list',
  RULES_SAVE: 'rules:save',
  RULES_DELETE: 'rules:delete',
  SKILLS_LIST: 'skills:list',
  CHAT_COMPACT: 'chat:compact',
} as const

/** IPC event names (push) */
export const IPC_EVENTS = {
  CHAT_STREAM: 'chat:stream',
  INDEX_PROGRESS: 'index:progress',
  FILE_CHANGED: 'file:changed',
  WORKSPACE_TREE_CHANGED: 'workspace:treeChanged',
  TERMINAL_OUTPUT: 'terminal:output',
  TERMINAL_EXIT: 'terminal:exit',
  MENU_OPEN_FOLDER: 'menu:openFolder',
  MENU_CLOSE_FOLDER: 'menu:closeFolder',
  MENU_CLOSE_ALL_TABS: 'menu:closeAllTabs',
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
export type IpcEvent = (typeof IPC_EVENTS)[keyof typeof IPC_EVENTS]

/** Request/response types per channel */
export interface IpcInvokeMap {
  [IPC_CHANNELS.WORKSPACE_OPEN]: { args: [path: string]; result: Workspace }
  [IPC_CHANNELS.WORKSPACE_CLOSE]: { args: []; result: void }
  [IPC_CHANNELS.WORKSPACE_GET]: { args: []; result: Workspace | null }
  [IPC_CHANNELS.WORKSPACE_GET_TREE]: { args: []; result: FileNode[] }
  [IPC_CHANNELS.WORKSPACE_RECENT_LIST]: { args: []; result: string[] }
  [IPC_CHANNELS.FILE_READ]: { args: [path: string]; result: string }
  [IPC_CHANNELS.FILE_WRITE]: { args: [path: string, content: string]; result: void }
  [IPC_CHANNELS.FILE_RESOLVE]: { args: [href: string, baseFilePath?: string]; result: string }
  [IPC_CHANNELS.SETTINGS_GET]: { args: []; result: AppSettings }
  [IPC_CHANNELS.SETTINGS_SET]: { args: [partial: Partial<AppSettings>]; result: AppSettings }
  [IPC_CHANNELS.SESSION_LIST]: { args: []; result: Session[] }
  [IPC_CHANNELS.SESSION_CREATE]: { args: []; result: Session }
  [IPC_CHANNELS.SESSION_SELECT]: { args: [sessionId: string]; result: Message[] }
  [IPC_CHANNELS.SESSION_GET_MESSAGES]: { args: [sessionId: string]; result: Message[] }
  [IPC_CHANNELS.DIALOG_OPEN_DIRECTORY]: { args: []; result: string | null }
  [IPC_CHANNELS.INDEX_STATUS]: { args: []; result: IndexStatus }
  [IPC_CHANNELS.INDEX_SEARCH]: { args: [query: string]; result: SearchResult[] }
  [IPC_CHANNELS.CHAT_SEND]: { args: [params: ChatSendParams]; result: void }
  [IPC_CHANNELS.CHAT_CANCEL]: { args: [sessionId: string]; result: void }
  [IPC_CHANNELS.MODELS_LIST]: { args: [provider: LLMProviderId]; result: ModelInfo[] }
  [IPC_CHANNELS.MODEL_CATALOG_GET]: {
    args: []
    result: {
      updatedAt: string
      expiresAt: string
      tiers: {
        openai: { lite: string; standard: string; premium: string }
        anthropic: { lite: string; standard: string; premium: string }
        xai: { lite: string; standard: string; premium: string }
      }
    }
  }
  [IPC_CHANNELS.MODEL_CATALOG_REFRESH]: {
    args: []
    result: {
      updatedAt: string
      expiresAt: string
      tiers: {
        openai: { lite: string; standard: string; premium: string }
        anthropic: { lite: string; standard: string; premium: string }
        xai: { lite: string; standard: string; premium: string }
      }
    }
  }
  [IPC_CHANNELS.SESSION_SET_MODE]: { args: [sessionId: string, mode: SessionMode]; result: Session }
  [IPC_CHANNELS.AGENT_APPROVAL_RESPOND]: { args: [sessionId: string, toolCallId: string, approved: boolean]; result: void }
  [IPC_CHANNELS.TERMINAL_CREATE]: { args: [cwd?: string]; result: { id: string } }
  [IPC_CHANNELS.TERMINAL_WRITE]: { args: [id: string, data: string]; result: void }
  [IPC_CHANNELS.TERMINAL_RESIZE]: { args: [id: string, cols: number, rows: number]; result: void }
  [IPC_CHANNELS.TERMINAL_DESTROY]: { args: [id: string]; result: void }
  [IPC_CHANNELS.TERMINAL_CAPTURE_ENV]: {
    args: [id: string]
    result: { keyCount: number; capturedAt: string }
  }
  [IPC_CHANNELS.AGENT_ENV_STATUS]: {
    args: []
    result: {
      capturedKeyCount: number
      capturedAt: string | null
      agentEnvFileKeyCount: number
      hasAgentEnvFile: boolean
    }
  }
  [IPC_CHANNELS.AGENT_ENV_CLEAR]: { args: []; result: void }
  [IPC_CHANNELS.RULES_LIST]: { args: []; result: RuleFile[] }
  [IPC_CHANNELS.RULES_SAVE]: { args: [params: RuleSaveParams]; result: RuleFile }
  [IPC_CHANNELS.RULES_DELETE]: { args: [absolutePath: string]; result: void }
  [IPC_CHANNELS.SKILLS_LIST]: { args: []; result: SkillFile[] }
  [IPC_CHANNELS.CHAT_COMPACT]: { args: [sessionId: string]; result: Message[] }
}

export interface IpcEventMap {
  [IPC_EVENTS.CHAT_STREAM]: ChatStreamEvent & { sessionId: string }
  [IPC_EVENTS.INDEX_PROGRESS]: IndexStatus
  [IPC_EVENTS.FILE_CHANGED]: { path: string; relativePath: string }
  [IPC_EVENTS.WORKSPACE_TREE_CHANGED]: undefined
  [IPC_EVENTS.TERMINAL_OUTPUT]: { id: string; data: string }
  [IPC_EVENTS.TERMINAL_EXIT]: { id: string; exitCode: number }
  [IPC_EVENTS.MENU_OPEN_FOLDER]: undefined
  [IPC_EVENTS.MENU_CLOSE_FOLDER]: undefined
  [IPC_EVENTS.MENU_CLOSE_ALL_TABS]: undefined
}

export type IpcArgs<C extends keyof IpcInvokeMap> = IpcInvokeMap[C]['args']
export type IpcResult<C extends keyof IpcInvokeMap> = IpcInvokeMap[C]['result']

/** Renderer-facing API exposed via contextBridge */
export interface CodexApi {
  invoke<C extends keyof IpcInvokeMap>(
    channel: C,
    ...args: IpcArgs<C>
  ): Promise<IpcResult<C>>
  on<E extends keyof IpcEventMap>(
    channel: E,
    listener: (payload: IpcEventMap[E]) => void,
  ): () => void
}

declare global {
  interface Window {
    codex: CodexApi
  }
}
