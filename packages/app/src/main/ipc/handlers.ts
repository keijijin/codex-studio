import { BrowserWindow, ipcMain } from 'electron'
import { IPC_CHANNELS, IPC_EVENTS, type IndexStatus } from '@codex/shared'
import { indexService } from '@codex/indexer'
import { workspaceService } from '../services/workspace'
import { sessionService, settingsService } from '../services/settings'
import { chatService } from '../services/chat'
import { agentService } from '../services/agent'
import { auditLog } from '../services/audit-log'
import { fileWatcherService } from '../services/file-watcher'
import { terminalService } from '../services/terminal-service'
import { agentEnvService } from '../services/agent-env-service'
import { modelCatalogService } from '../services/model-catalog-service'
import { rulesService } from '../services/rules-service'
import { skillsService } from '../services/skills-service'
import { hooksService } from '../services/hooks-service'
import { assertFilePath, assertNonEmptyString, assertSessionId, assertTerminalId } from '../utils/validate-ipc'
import { redactSettingsForRenderer } from '../services/settings-redact'
import { getDailyUsageSummary, listRecentUsage } from '../services/usage-log'

export function registerIpcHandlers(): void {
  indexService.setProgressCallback((status: IndexStatus) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC_EVENTS.INDEX_PROGRESS, status)
    }
  })

  ipcMain.handle(IPC_CHANNELS.WORKSPACE_OPEN, async (_event, path: string) => {
    const target = assertFilePath(path)
    const workspace = await workspaceService.open(target)
    const root = workspace.rootPaths[0]
    settingsService.addRecentWorkspace(root)
    sessionService.rememberWorkspaceId(root, workspace.id)
    agentEnvService.hydrateFromWorkspace(root)
    fileWatcherService.start(root)
    void indexService.scan(root)
    return workspace
  })

  ipcMain.handle(IPC_CHANNELS.WORKSPACE_CLOSE, () => {
    fileWatcherService.stop()
    terminalService.destroyAll()
    agentEnvService.clearMemory()
    workspaceService.close()
    indexService.reset()
  })

  ipcMain.handle(IPC_CHANNELS.WORKSPACE_GET, () => {
    return workspaceService.get()
  })

  ipcMain.handle(IPC_CHANNELS.WORKSPACE_GET_TREE, async () => {
    return workspaceService.getFileTree()
  })

  ipcMain.handle(IPC_CHANNELS.WORKSPACE_RECENT_LIST, () => {
    return settingsService.getRecentWorkspaces()
  })

  ipcMain.handle(IPC_CHANNELS.FILE_READ, async (_event, path: string) => {
    return workspaceService.readFile(assertFilePath(path))
  })

  ipcMain.handle(IPC_CHANNELS.FILE_RESOLVE, (_event, href: string, baseFilePath?: string) => {
    const target = assertNonEmptyString(href, 'href')
    const base = baseFilePath === undefined ? undefined : assertFilePath(baseFilePath)
    return workspaceService.resolveMarkdownLink(target, base)
  })

  ipcMain.handle(IPC_CHANNELS.FILE_WRITE, async (_event, path: string, content: string) => {
    const target = assertFilePath(path)
    if (typeof content !== 'string') {
      throw new Error('Invalid file content')
    }
    await workspaceService.writeFile(target, content)
    fileWatcherService.markInternalWrite(target)
    void auditLog('file:write', { path: target, bytes: content.length })
    void hooksService.onFileSave(target)
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, () => {
    return redactSettingsForRenderer(settingsService.get())
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, (_event, partial) => {
    return redactSettingsForRenderer(settingsService.set(partial))
  })

  ipcMain.handle(IPC_CHANNELS.SESSION_LIST, () => {
    const workspace = workspaceService.get()
    if (!workspace) return []
    return sessionService.listForWorkspace(workspace.id, workspace.rootPaths[0])
  })

  ipcMain.handle(IPC_CHANNELS.SESSION_CREATE, () => {
    const workspace = workspaceService.get()
    if (!workspace) {
      throw new Error('Open a workspace first')
    }
    return sessionService.create(workspace.id, workspace.rootPaths[0])
  })

  ipcMain.handle(IPC_CHANNELS.SESSION_SELECT, (_event, sessionId: string) => {
    return sessionService.getMessages(assertSessionId(sessionId))
  })

  ipcMain.handle(IPC_CHANNELS.SESSION_GET_MESSAGES, (_event, sessionId: string) => {
    return sessionService.getMessages(assertSessionId(sessionId))
  })

  ipcMain.handle(IPC_CHANNELS.INDEX_STATUS, () => {
    return indexService.getStatus()
  })

  ipcMain.handle(IPC_CHANNELS.INDEX_SEARCH, async (_event, query: string) => {
    return indexService.search(query)
  })

  ipcMain.handle(IPC_CHANNELS.CHAT_SEND, async (event, params) => {
    await chatService.send(params, event.sender)
  })

  ipcMain.handle(IPC_CHANNELS.CHAT_CANCEL, (_event, sessionId: string) => {
    chatService.cancel(assertSessionId(sessionId))
  })

  ipcMain.handle(IPC_CHANNELS.MODELS_LIST, async (_event, provider) => {
    return chatService.listModels(provider)
  })

  ipcMain.handle(IPC_CHANNELS.MODEL_CATALOG_GET, () => {
    return modelCatalogService.getCached()
  })

  ipcMain.handle(IPC_CHANNELS.MODEL_CATALOG_REFRESH, async () => {
    const settings = settingsService.get()
    return modelCatalogService.refresh(settings, true)
  })

  ipcMain.handle(IPC_CHANNELS.SESSION_SET_MODE, (_event, sessionId: string, mode) => {
    return sessionService.setMode(assertSessionId(sessionId), mode)
  })

  ipcMain.handle(IPC_CHANNELS.AGENT_APPROVAL_RESPOND, (_event, sessionId: string, toolCallId: string, approved: boolean) => {
    const sid = assertSessionId(sessionId)
    const tid = assertNonEmptyString(toolCallId, 'toolCallId')
    agentService.respondApproval(sid, tid, approved)
    void auditLog('agent:approval', { sessionId: sid, toolCallId: tid, approved })
  })

  ipcMain.handle(IPC_CHANNELS.TERMINAL_CREATE, (event, cwd?: string) => {
    if (cwd !== undefined && typeof cwd !== 'string') {
      throw new Error('Invalid terminal cwd')
    }
    return terminalService.create(event.sender, cwd)
  })

  ipcMain.handle(IPC_CHANNELS.TERMINAL_WRITE, (_event, id: string, data: string) => {
    const terminalId = assertTerminalId(id)
    if (typeof data !== 'string') {
      throw new Error('Invalid terminal data')
    }
    terminalService.write(terminalId, data)
  })

  ipcMain.handle(IPC_CHANNELS.TERMINAL_RESIZE, (_event, id: string, cols: number, rows: number) => {
    const terminalId = assertTerminalId(id)
    if (typeof cols !== 'number' || typeof rows !== 'number') {
      throw new Error('Invalid terminal size')
    }
    terminalService.resize(terminalId, cols, rows)
  })

  ipcMain.handle(IPC_CHANNELS.TERMINAL_DESTROY, (_event, id: string) => {
    terminalService.destroy(assertTerminalId(id))
  })

  ipcMain.handle(IPC_CHANNELS.TERMINAL_CAPTURE_ENV, async (_event, id: string) => {
    const result = await terminalService.captureEnvForAgent(assertTerminalId(id))
    void auditLog('terminal:captureEnv', { keyCount: result.keyCount })
    return result
  })

  ipcMain.handle(IPC_CHANNELS.AGENT_ENV_STATUS, () => {
    return agentEnvService.status(workspaceService.getRoot())
  })

  ipcMain.handle(IPC_CHANNELS.AGENT_ENV_CLEAR, () => {
    agentEnvService.clear(workspaceService.getRoot() ?? undefined)
  })

  ipcMain.handle(IPC_CHANNELS.RULES_LIST, async () => {
    return rulesService.list()
  })

  ipcMain.handle(IPC_CHANNELS.RULES_SAVE, async (_event, params) => {
    return rulesService.save(params)
  })

  ipcMain.handle(IPC_CHANNELS.RULES_DELETE, async (_event, absolutePath: string) => {
    await rulesService.remove(assertFilePath(absolutePath))
  })

  ipcMain.handle(IPC_CHANNELS.SKILLS_LIST, async () => {
    return skillsService.list()
  })

  ipcMain.handle(IPC_CHANNELS.CHAT_COMPACT, async (_event, sessionId: string) => {
    return chatService.compactSession(assertSessionId(sessionId))
  })

  ipcMain.handle(IPC_CHANNELS.USAGE_RECENT, async (_event, limit?: number) => {
    return listRecentUsage(typeof limit === 'number' ? limit : 50)
  })

  ipcMain.handle(IPC_CHANNELS.USAGE_DAILY, async () => {
    return getDailyUsageSummary()
  })
}
