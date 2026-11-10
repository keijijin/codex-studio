import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC_CHANNELS,
  type CodexApi,
  type IpcEventMap,
  type IpcInvokeMap,
} from '@codex/shared'

function invoke<C extends keyof IpcInvokeMap>(
  channel: C,
  ...args: IpcInvokeMap[C]['args']
): Promise<IpcInvokeMap[C]['result']> {
  return ipcRenderer.invoke(channel, ...args) as Promise<IpcInvokeMap[C]['result']>
}

const codex: CodexApi = {
  on(channel, listener) {
    const wrapper = (_event: Electron.IpcRendererEvent, payload: unknown) => {
      listener(payload as IpcEventMap[typeof channel])
    }
    ipcRenderer.on(channel, wrapper)
    return () => ipcRenderer.removeListener(channel, wrapper)
  },
  workspace: {
    open: (path) => invoke(IPC_CHANNELS.WORKSPACE_OPEN, path),
    close: () => invoke(IPC_CHANNELS.WORKSPACE_CLOSE),
    get: () => invoke(IPC_CHANNELS.WORKSPACE_GET),
    getTree: () => invoke(IPC_CHANNELS.WORKSPACE_GET_TREE),
    recentList: () => invoke(IPC_CHANNELS.WORKSPACE_RECENT_LIST),
    addRoot: (path) => invoke(IPC_CHANNELS.WORKSPACE_ADD_ROOT, path),
    trustStatus: () => invoke(IPC_CHANNELS.WORKSPACE_TRUST_STATUS),
    trust: () => invoke(IPC_CHANNELS.WORKSPACE_TRUST),
    untrust: () => invoke(IPC_CHANNELS.WORKSPACE_UNTRUST),
  },
  file: {
    read: (path) => invoke(IPC_CHANNELS.FILE_READ, path),
    readBinary: (path) => invoke(IPC_CHANNELS.FILE_READ_BINARY, path),
    write: (path, content) => invoke(IPC_CHANNELS.FILE_WRITE, path, content),
    resolve: (href, baseFilePath) => invoke(IPC_CHANNELS.FILE_RESOLVE, href, baseFilePath),
  },
  dialog: {
    openDirectory: () => invoke(IPC_CHANNELS.DIALOG_OPEN_DIRECTORY),
  },
  settings: {
    get: () => invoke(IPC_CHANNELS.SETTINGS_GET),
    set: (partial) => invoke(IPC_CHANNELS.SETTINGS_SET, partial),
  },
  session: {
    list: () => invoke(IPC_CHANNELS.SESSION_LIST),
    create: () => invoke(IPC_CHANNELS.SESSION_CREATE),
    select: (sessionId) => invoke(IPC_CHANNELS.SESSION_SELECT, sessionId),
    getMessages: (sessionId) => invoke(IPC_CHANNELS.SESSION_GET_MESSAGES, sessionId),
    setMode: (sessionId, mode) => invoke(IPC_CHANNELS.SESSION_SET_MODE, sessionId, mode),
    setPersona: (sessionId, personaName) =>
      invoke(IPC_CHANNELS.SESSION_SET_PERSONA, sessionId, personaName),
  },
  index: {
    status: () => invoke(IPC_CHANNELS.INDEX_STATUS),
    search: (query) => invoke(IPC_CHANNELS.INDEX_SEARCH, query),
    replace: (params) => invoke(IPC_CHANNELS.INDEX_REPLACE, params),
  },
  chat: {
    send: (params) => invoke(IPC_CHANNELS.CHAT_SEND, params),
    cancel: (sessionId) => invoke(IPC_CHANNELS.CHAT_CANCEL, sessionId),
    compact: (sessionId) => invoke(IPC_CHANNELS.CHAT_COMPACT, sessionId),
  },
  models: {
    list: (provider) => invoke(IPC_CHANNELS.MODELS_LIST, provider),
    catalogGet: () => invoke(IPC_CHANNELS.MODEL_CATALOG_GET),
    catalogRefresh: () => invoke(IPC_CHANNELS.MODEL_CATALOG_REFRESH),
  },
  agent: {
    approvalRespond: (sessionId, toolCallId, approved) =>
      invoke(IPC_CHANNELS.AGENT_APPROVAL_RESPOND, sessionId, toolCallId, approved),
  },
  ceo: {
    approvalRespond: (sessionId, approvalId, response) =>
      invoke(IPC_CHANNELS.CEO_APPROVAL_RESPOND, sessionId, approvalId, response),
  },
  terminal: {
    create: (cwd) => invoke(IPC_CHANNELS.TERMINAL_CREATE, cwd),
    write: (id, data) => invoke(IPC_CHANNELS.TERMINAL_WRITE, id, data),
    resize: (id, cols, rows) => invoke(IPC_CHANNELS.TERMINAL_RESIZE, id, cols, rows),
    destroy: (id) => invoke(IPC_CHANNELS.TERMINAL_DESTROY, id),
    captureEnv: (id) => invoke(IPC_CHANNELS.TERMINAL_CAPTURE_ENV, id),
  },
  agentEnv: {
    status: () => invoke(IPC_CHANNELS.AGENT_ENV_STATUS),
    clear: () => invoke(IPC_CHANNELS.AGENT_ENV_CLEAR),
  },
  rules: {
    list: () => invoke(IPC_CHANNELS.RULES_LIST),
    save: (params) => invoke(IPC_CHANNELS.RULES_SAVE, params),
    delete: (absolutePath) => invoke(IPC_CHANNELS.RULES_DELETE, absolutePath),
  },
  skills: {
    list: () => invoke(IPC_CHANNELS.SKILLS_LIST),
  },
  personas: {
    list: () => invoke(IPC_CHANNELS.PERSONAS_LIST),
    save: (params) => invoke(IPC_CHANNELS.PERSONAS_SAVE, params),
    delete: (absolutePath) => invoke(IPC_CHANNELS.PERSONAS_DELETE, absolutePath),
  },
  usage: {
    recent: (limit) => invoke(IPC_CHANNELS.USAGE_RECENT, limit),
    daily: () => invoke(IPC_CHANNELS.USAGE_DAILY),
  },
  git: {
    status: () => invoke(IPC_CHANNELS.GIT_STATUS),
    stage: (paths) => invoke(IPC_CHANNELS.GIT_STAGE, paths),
    unstage: (paths) => invoke(IPC_CHANNELS.GIT_UNSTAGE, paths),
    commit: (message) => invoke(IPC_CHANNELS.GIT_COMMIT, message),
    branches: () => invoke(IPC_CHANNELS.GIT_BRANCHES),
    checkout: (branch) => invoke(IPC_CHANNELS.GIT_CHECKOUT, branch),
  },
  updater: {
    check: () => invoke(IPC_CHANNELS.UPDATER_CHECK),
    statusGet: () => invoke(IPC_CHANNELS.UPDATER_STATUS_GET),
  },
  mcp: {
    status: () => invoke(IPC_CHANNELS.MCP_STATUS),
    sync: () => invoke(IPC_CHANNELS.MCP_SYNC),
  },
  completion: {
    request: (req) => invoke(IPC_CHANNELS.COMPLETION_REQUEST, req),
  },
  audit: {
    export: (opts) => invoke(IPC_CHANNELS.AUDIT_EXPORT, opts),
  },
  semantic: {
    stats: () => invoke(IPC_CHANNELS.SEMANTIC_STATS),
    reindex: (opts) => invoke(IPC_CHANNELS.SEMANTIC_REINDEX, opts),
  },
}

contextBridge.exposeInMainWorld('codex', codex)
