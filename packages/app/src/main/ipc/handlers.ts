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
import { personasService } from '../services/personas-service'
import { hooksService } from '../services/hooks-service'
import { assertFilePath, assertNonEmptyString, assertSessionId, assertTerminalId } from '../utils/validate-ipc'
import { redactSettingsForRenderer } from '../services/settings-redact'
import { getDailyUsageSummary, listRecentUsage } from '../services/usage-log'
import { pathIgnoreService } from '../services/path-ignore-service'
import { gitService } from '../services/git-service'
import { replaceInWorkspace } from '../services/workspace-replace'
import { checkForUpdates, getUpdaterStatus } from '../services/updater'
import { mcpService } from '../services/mcp-service'
import { completeInline } from '../services/tab-completion'
import { exportAuditLog } from '../services/audit-log'
import { reindexSemanticWorkspace, semanticIndexStats } from '../services/semantic-index'

async function applyIgnoreRules(root: string): Promise<void> {
  await pathIgnoreService.reload(root)
  const indexRules = await pathIgnoreService.reloadForIndexing(root)
  indexService.setIgnoreRules(indexRules)
  await fileWatcherService.reloadIgnoreRules()
}

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
    await applyIgnoreRules(root)
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
    // Avoid editor echo-reload; still push Explorer tree refresh.
    fileWatcherService.markInternalWrite(target)
    fileWatcherService.notifyTreeChanged()
    void auditLog('file:write', { path: target, bytes: content.length })
    void hooksService.onFileSave(target)
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, () => {
    return redactSettingsForRenderer(settingsService.get())
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, async (_event, partial) => {
    const before = settingsService.get().general.showBuildOutputs
    const updated = settingsService.set(partial)
    const after = updated.general.showBuildOutputs
    if (before !== after) {
      const root = workspaceService.getRoot()
      if (root) {
        await applyIgnoreRules(root)
        void indexService.scan(root)
        fileWatcherService.notifyTreeChanged()
      }
    }
    if (partial && typeof partial === 'object' && 'mcpServers' in partial) {
      void mcpService.syncFromSettings(updated.mcpServers).catch((err) => {
        console.warn('[mcp] sync after settings failed', err)
      })
    }
    return redactSettingsForRenderer(updated)
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

  ipcMain.handle(IPC_CHANNELS.INDEX_REPLACE, async (_event, params) => {
    if (!params || typeof params !== 'object') {
      throw new Error('Invalid replace params')
    }
    const query = assertNonEmptyString(String((params as { query?: string }).query ?? ''), 'query')
    const replacement = String((params as { replacement?: string }).replacement ?? '')
    const rawPaths = (params as { paths?: unknown }).paths
    const paths = Array.isArray(rawPaths)
      ? rawPaths.filter((p): p is string => typeof p === 'string').map((p) => assertFilePath(p))
      : undefined
    const result = await replaceInWorkspace({ query, replacement, paths })
    void auditLog('index:replace', {
      query,
      filesChanged: result.filesChanged,
      occurrences: result.occurrences,
    })
    return result
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

  ipcMain.handle(
    IPC_CHANNELS.SESSION_SET_PERSONA,
    (_event, sessionId: string, personaName: string | null | undefined) => {
      return sessionService.setPersona(
        assertSessionId(sessionId),
        personaName == null || personaName === '' ? undefined : String(personaName),
      )
    },
  )

  ipcMain.handle(IPC_CHANNELS.AGENT_APPROVAL_RESPOND, (_event, sessionId: string, toolCallId: string, approved: boolean) => {
    const sid = assertSessionId(sessionId)
    const tid = assertNonEmptyString(toolCallId, 'toolCallId')
    agentService.respondApproval(sid, tid, approved)
    void auditLog('agent:approval', { sessionId: sid, toolCallId: tid, approved })
  })

  ipcMain.handle(
    IPC_CHANNELS.CEO_APPROVAL_RESPOND,
    (_event, sessionId: string, approvalId: string, response) => {
      const sid = assertSessionId(sessionId)
      const aid = assertNonEmptyString(approvalId, 'approvalId')
      agentService.respondCeoApproval(sid, aid, response)
      void auditLog('ceo:approval', { sessionId: sid, approvalId: aid, response })
    },
  )

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

  ipcMain.handle(IPC_CHANNELS.PERSONAS_LIST, async () => {
    return personasService.list()
  })

  ipcMain.handle(IPC_CHANNELS.PERSONAS_SAVE, async (_event, params) => {
    return personasService.save(params)
  })

  ipcMain.handle(IPC_CHANNELS.PERSONAS_DELETE, async (_event, absolutePath: string) => {
    await personasService.remove(assertFilePath(absolutePath))
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

  ipcMain.handle(IPC_CHANNELS.GIT_STATUS, async () => {
    return gitService.status()
  })

  ipcMain.handle(IPC_CHANNELS.GIT_STAGE, async (_event, paths: string[]) => {
    if (!Array.isArray(paths) || paths.some((p) => typeof p !== 'string')) {
      throw new Error('Invalid paths')
    }
    await gitService.stage(paths.map((p) => assertFilePath(p)))
  })

  ipcMain.handle(IPC_CHANNELS.GIT_UNSTAGE, async (_event, paths: string[]) => {
    if (!Array.isArray(paths) || paths.some((p) => typeof p !== 'string')) {
      throw new Error('Invalid paths')
    }
    await gitService.unstage(paths.map((p) => assertFilePath(p)))
  })

  ipcMain.handle(IPC_CHANNELS.GIT_COMMIT, async (_event, message: string) => {
    return gitService.commit(assertNonEmptyString(message, 'message'))
  })

  ipcMain.handle(IPC_CHANNELS.GIT_BRANCHES, async () => {
    return gitService.listBranches()
  })

  ipcMain.handle(IPC_CHANNELS.GIT_CHECKOUT, async (_event, branch: string) => {
    return gitService.checkout(assertNonEmptyString(branch, 'branch'))
  })

  ipcMain.handle(IPC_CHANNELS.UPDATER_CHECK, async () => {
    return checkForUpdates({ manual: true })
  })

  ipcMain.handle(IPC_CHANNELS.UPDATER_STATUS_GET, () => {
    return getUpdaterStatus()
  })

  ipcMain.handle(IPC_CHANNELS.MCP_STATUS, () => mcpService.getStatus())

  ipcMain.handle(IPC_CHANNELS.MCP_SYNC, async () => {
    return mcpService.syncFromSettings()
  })

  ipcMain.handle(IPC_CHANNELS.COMPLETION_REQUEST, async (_event, req) => {
    return completeInline({
      prefix: String(req?.prefix ?? ''),
      suffix: req?.suffix != null ? String(req.suffix) : undefined,
      language: req?.language != null ? String(req.language) : undefined,
      path: req?.path != null ? String(req.path) : undefined,
    })
  })

  ipcMain.handle(IPC_CHANNELS.WORKSPACE_ADD_ROOT, async (_event, path: string) => {
    const target = assertFilePath(path)
    const workspace = await workspaceService.addRoot(target)
    fileWatcherService.addRoot(target)
    fileWatcherService.notifyTreeChanged()
    void auditLog('workspace:addRoot', { path: target })
    return workspace
  })

  ipcMain.handle(IPC_CHANNELS.AUDIT_EXPORT, async (_event, opts) => {
    const limit = typeof opts?.limit === 'number' ? opts.limit : 5000
    const result = await exportAuditLog(limit)
    void auditLog('audit:export', { path: result.path, lines: result.lines })
    return result
  })

  ipcMain.handle(IPC_CHANNELS.SEMANTIC_STATS, () => semanticIndexStats())

  ipcMain.handle(IPC_CHANNELS.SEMANTIC_REINDEX, async (_event, opts) => {
    const limit = typeof opts?.limit === 'number' ? opts.limit : 80
    return reindexSemanticWorkspace(limit)
  })
}
