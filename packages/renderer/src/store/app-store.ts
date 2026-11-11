import { create } from 'zustand'
import type {
  AppSettings,
  ApprovalRequest,
  Attachment,
  FileNode,
  IndexStatus,
  Message,
  RoutingMode,
  Session,
  SessionMode,
  ToolCallRecord,
  Workspace } from '@codex/shared'
import { IPC_EVENTS } from '@codex/shared'
import { hasCodexApi } from '@renderer/components/ErrorBoundary'
import {
  defaultMdViewMode,
  defaultTabKind,
  isPdfFile,
  type EditorTabKind,
  type MdViewMode,
} from '@renderer/utils/files'

const openingPaths = new Set<string>()
/** Ignore out-of-order WORKSPACE_GET_TREE responses. */
let fileTreeRefreshGeneration = 0
let fileTreeRefreshTimer: ReturnType<typeof setTimeout> | null = null
let fileTreeRefreshWaiters: Array<() => void> = []

interface EditorTab {
  path: string
  name: string
  content: string
  isDirty: boolean
  mdViewMode: MdViewMode
  /** text (Monaco/Markdown) or pdf (binary preview) */
  kind: EditorTabKind
  /** Base64 payload for binary preview tabs (PDF). */
  binaryBase64?: string
  mimeType?: string
}

type SidebarView = 'explorer' | 'search' | 'git'

function toolLogFromMessages(messages: Message[]): ToolCallRecord[] {
  const log: ToolCallRecord[] = []
  for (const m of messages) {
    if (m.toolCalls?.length) log.push(...m.toolCalls)
  }
  return log
}

/** Expand ancestor dirs of `filePath` under the workspace root (for Explorer reveal). */
function explorerDirsToReveal(filePath: string, workspaceRoot: string | undefined): string[] {
  if (!workspaceRoot) return []
  const root = workspaceRoot.replace(/[/\\]+$/, '')
  const normalized = filePath.replace(/[/\\]+$/, '')
  const sep = root.includes('\\') ? '\\' : '/'
  if (!normalized.startsWith(root + sep) && normalized !== root) {
    return []
  }
  const rel = normalized.slice(root.length).replace(/^[/\\]+/, '')
  const parts = rel.split(/[/\\]/).filter(Boolean)
  if (parts.length <= 1) return []
  const dirs: string[] = []
  let cur = root
  for (let i = 0; i < parts.length - 1; i++) {
    cur = `${cur}${sep}${parts[i]}`
    dirs.push(cur)
  }
  return dirs
}

interface AppState {
  workspace: Workspace | null
  fileTree: FileNode[]
  /** Absolute dir paths the user has expanded in Explorer (default: all collapsed). */
  explorerExpanded: Record<string, true>
  tabs: EditorTab[]
  /** Focused tab (also used for save / md toggle) */
  activeTabPath: string | null
  /** Left pane path when split */
  primaryTabPath: string | null
  /** Right pane path when split */
  secondaryTabPath: string | null
  editorSplit: boolean
  activePane: 'primary' | 'secondary'
  sessions: Session[]
  activeSessionId: string | null
  messages: Message[]
  aiPanelOpen: boolean
  terminalPanelOpen: boolean
  sidebarView: SidebarView
  isLoading: boolean
  settings: AppSettings | null
  indexStatus: IndexStatus
  isStreaming: boolean
  /** High-level run lifecycle for UI banners (survives briefly after stream ends). */
  runPhase: 'idle' | 'running' | 'completed' | 'error' | 'cancelled'
  runPhaseAt: number
  streamingContent: string
  streamingToolCalls: ToolCallRecord[]
  /** Session-scoped tool history for the Tools panel (survives stream end) */
  sessionToolLog: ToolCallRecord[]
  lastUsage: {
    inputTokens: number
    outputTokens: number
    cachedInputTokens: number
    latencyMs: number
    estimatedCostUsd: number
  } | null
  lastTrace: {
    personaId?: string
    personaName?: string
    provider?: string
    model?: string
    routeReason?: string
    toolCount?: number
  } | null
  chatError: string | null
  routingInfo: {
    provider: string
    model: string
    reason: string
    mode: RoutingMode
  } | null
  activePersona: { personaId: string; personaName: string } | null
  sessionMode: SessionMode
  pendingApproval: (ApprovalRequest & { sessionId: string }) | null
  pendingCeoApproval: (import('@codex/shared').CeoApprovalRequest & { sessionId: string }) | null
  teamStage: { stage: string; teamId: string; detail?: string } | null
  listenersSetup: boolean

  initialize: () => Promise<void>
  setupListeners: () => void
  loadSettings: () => Promise<void>
  openWorkspace: (path?: string) => Promise<void>
  addWorkspaceRoot: (path?: string) => Promise<void>
  closeWorkspace: () => Promise<void>
  refreshFileTree: () => Promise<void>
  toggleExplorerDir: (path: string) => void
  collapseExplorer: () => void
  revealInExplorer: (filePath: string) => void
  openFile: (path: string, name: string) => Promise<void>
  openChangedFile: (path: string) => Promise<void>
  closeTab: (path: string) => void
  closeAllTabs: () => void
  setActiveTab: (path: string) => void
  setTabMdViewMode: (path: string, mode: MdViewMode) => void
  updateTabContent: (path: string, content: string) => void
  saveActiveFile: () => Promise<void>
  toggleEditorSplit: () => void
  setActivePane: (pane: 'primary' | 'secondary') => void
  toggleAiPanel: () => void
  toggleTerminalPanel: () => void
  setSidebarView: (view: SidebarView) => void
  createSession: () => Promise<void>
  selectSession: (sessionId: string) => Promise<void>
  loadSessions: () => Promise<void>
  sendMessage: (content: string, attachments: Attachment[]) => Promise<void>
  cancelChat: () => Promise<void>
  compactChat: () => Promise<void>
  setSessionMode: (mode: SessionMode) => Promise<void>
  setSessionPersona: (personaName: string | null) => Promise<void>
  setRoutingMode: (mode: RoutingMode) => Promise<void>
  respondApproval: (approved: boolean) => Promise<void>
  respondCeoApproval: (
    decision: import('@codex/shared').CeoApprovalDecision,
    note?: string,
  ) => Promise<void>
  refreshIndexStatus: () => Promise<void>
  clearSessionToolLog: () => void
}

export const useAppStore = create<AppState>((set, get) => ({
  workspace: null,
  fileTree: [],
  explorerExpanded: {},
  tabs: [],
  activeTabPath: null,
  primaryTabPath: null,
  secondaryTabPath: null,
  editorSplit: false,
  activePane: 'primary',
  sessions: [],
  activeSessionId: null,
  messages: [],
  aiPanelOpen: true,
  terminalPanelOpen: false,
  sidebarView: 'explorer',
  isLoading: false,
  settings: null,
  indexStatus: { state: 'idle', totalFiles: 0, indexedFiles: 0 },
  isStreaming: false,
  runPhase: 'idle',
  runPhaseAt: 0,
  streamingContent: '',
  streamingToolCalls: [],
  sessionToolLog: [],
  lastUsage: null,
  lastTrace: null,
  chatError: null,
  routingInfo: null,
  activePersona: null,
  sessionMode: 'agent',
  pendingApproval: null,
  pendingCeoApproval: null,
  teamStage: null,
  listenersSetup: false,

  initialize: async () => {
    if (!hasCodexApi()) {
      console.error('[app] window.codex is not available — check preload script')
      return
    }
    get().setupListeners()
    await get().loadSettings()
    const workspace = await window.codex.workspace.get()
    if (workspace) {
      const fileTree = await window.codex.workspace.getTree()
      set({ workspace, fileTree })
      await get().loadSessions()
      if (get().sessions.length === 0) {
        await get().createSession()
      }
      await get().refreshIndexStatus()
    }
  },

  setupListeners: () => {
    if (get().listenersSetup) return

    window.codex.on(IPC_EVENTS.CHAT_STREAM, (event) => {
      // Approvals must not depend on the AI panel or the active session —
      // otherwise Write waits forever and times out as "user rejected".
      if (event.type === 'approval_required') {
        set({
          pendingApproval: {
            sessionId: event.sessionId,
            toolCallId: event.toolCallId,
            tool: event.tool,
            path: event.path,
            relativePath: event.relativePath,
            oldContent: event.oldContent,
            newContent: event.newContent,
            summary: event.summary,
            action: event.action as ApprovalRequest['action'] },
          aiPanelOpen: true })
        return
      }
      if (event.type === 'ceo_approval_required') {
        set({
          pendingCeoApproval: {
            sessionId: event.sessionId,
            ...event.request },
          aiPanelOpen: true })
        return
      }

      const { activeSessionId } = get()
      if (event.sessionId !== activeSessionId) return

      if (event.type === 'text_delta') {
        set((s) => ({
          streamingContent: s.streamingContent + event.content,
          chatError: null }))
      } else if (event.type === 'tool_call_start') {
        set((s) => {
          const next: ToolCallRecord = {
            id: event.toolCallId,
            name: event.tool,
            args: event.args,
            status: 'running' as const }
          return {
            streamingToolCalls: [...s.streamingToolCalls, next],
            sessionToolLog: [...s.sessionToolLog, next] }
        })
      } else if (event.type === 'tool_call_result') {
        set((s) => {
          const patch = (tc: ToolCallRecord) =>
            tc.id === event.toolCallId
              ? {
                  ...tc,
                  result: event.result,
                  status: event.success ? ('done' as const) : ('error' as const) }
              : tc
          return {
            streamingToolCalls: s.streamingToolCalls.map(patch),
            sessionToolLog: s.sessionToolLog.map(patch) }
        })
        // Do not auto-open files from Agent tools — user opens via Explorer / Search / tool card.
      } else if (event.type === 'team_stage') {
        set({
          teamStage: {
            stage: event.stage,
            teamId: event.teamId,
            detail: event.detail } })
      } else if (event.type === 'routing') {
        set({
          routingInfo: {
            provider: event.provider,
            model: event.model,
            reason: event.reason,
            mode: event.mode },
          chatError: null })
      } else if (event.type === 'persona_applied') {
        set({
          activePersona: {
            personaId: event.personaId,
            personaName: event.personaName } })
      } else if (event.type === 'retrying') {
        set({
          streamingContent: '',
          streamingToolCalls: [],
          chatError: null,
          routingInfo: {
            provider: event.provider,
            model: event.model,
            reason: `再試行 ${event.attempt}: ${event.previousError.slice(0, 80)}`,
            mode: get().routingInfo?.mode ?? 'fallback-only' } })
      } else if (event.type === 'done') {
        void (async () => {
          const messages = await window.codex.session.select(event.sessionId)
          const sessions = await window.codex.session.list()
          const session = sessions.find((s) => s.id === event.sessionId)
          const sticky = session?.personaName
          const { pendingApproval, pendingCeoApproval } = get()
          set({
            messages,
            sessions,
            isStreaming: false,
            runPhase: 'completed',
            runPhaseAt: Date.now(),
            streamingContent: '',
            streamingToolCalls: [],
            chatError: null,
            pendingApproval:
              pendingApproval?.sessionId === event.sessionId ? null : pendingApproval,
            pendingCeoApproval:
              pendingCeoApproval?.sessionId === event.sessionId ? null : pendingCeoApproval,
            teamStage: null,
            activePersona: sticky
              ? { personaId: sticky, personaName: sticky }
              : null,
            lastUsage: event.usage ?? null,
            lastTrace: event.trace
              ? {
                  personaId: event.trace.personaId,
                  personaName: event.trace.personaName,
                  provider: event.trace.provider,
                  model: event.trace.model,
                  routeReason: event.trace.routeReason,
                  toolCount: event.trace.toolCount }
              : sticky
                ? {
                    personaName: sticky,
                    provider: get().routingInfo?.provider,
                    model: get().routingInfo?.model,
                    routeReason: get().routingInfo?.reason,
                    toolCount: get().sessionToolLog.length }
                : get().lastTrace })
        })()
      } else if (event.type === 'error') {
        const { pendingApproval, pendingCeoApproval } = get()
        set({
          isStreaming: false,
          runPhase: 'error',
          runPhaseAt: Date.now(),
          streamingContent: '',
          streamingToolCalls: [],
          chatError: event.message,
          pendingApproval:
            pendingApproval?.sessionId === event.sessionId ? null : pendingApproval,
          pendingCeoApproval:
            pendingCeoApproval?.sessionId === event.sessionId ? null : pendingCeoApproval })
      }
    })

    window.codex.on(IPC_EVENTS.INDEX_PROGRESS, (status) => {
      set({ indexStatus: status })
    })

    window.codex.on(IPC_EVENTS.FILE_CHANGED, (payload) => {
      void get().openChangedFile(payload.path)
    })

    window.codex.on(IPC_EVENTS.WORKSPACE_TREE_CHANGED, () => {
      void get().refreshFileTree()
    })

    // External edits (Finder, other apps) may miss FS events — refresh on focus.
    // Debounce: window focus can fire in bursts with dialogs / approvals.
    let focusRefreshTimer: ReturnType<typeof setTimeout> | null = null
    window.addEventListener('focus', () => {
      if (!get().workspace) return
      if (focusRefreshTimer) clearTimeout(focusRefreshTimer)
      focusRefreshTimer = setTimeout(() => {
        focusRefreshTimer = null
        void get().refreshFileTree()
      }, 400)
    })

    window.codex.on(IPC_EVENTS.MENU_OPEN_FOLDER, () => {
      void get().openWorkspace()
    })

    window.codex.on(IPC_EVENTS.MENU_CLOSE_FOLDER, () => {
      void get().closeWorkspace()
    })

    window.codex.on(IPC_EVENTS.MENU_CLOSE_ALL_TABS, () => {
      get().closeAllTabs()
    })

    set({ listenersSetup: true })
  },

  loadSettings: async () => {
    const settings = await window.codex.settings.get()
    set({ settings })
  },

  refreshIndexStatus: async () => {
    const indexStatus = await window.codex.index.status()
    set({ indexStatus })
  },

  openWorkspace: async (path?: string) => {
    set({ isLoading: true })
    try {
      let targetPath = path
      if (!targetPath) {
        targetPath = (await window.codex.dialog.openDirectory()) ?? undefined
      }
      if (!targetPath) return

      // Cancel in-flight chat for the previous folder (history is kept in store)
      if (get().activeSessionId) {
        try {
          await window.codex.chat.cancel(get().activeSessionId!)
        } catch {
          // ignore
        }
      }
      if (get().workspace) {
        await window.codex.workspace.close()
      }

      const workspace = await window.codex.workspace.open(targetPath)
      const fileTree = await window.codex.workspace.getTree()
      const sessions = await window.codex.session.list()

      set({
        workspace,
        fileTree,
        explorerExpanded: {},
        tabs: [],
        activeTabPath: null,
        primaryTabPath: null,
        secondaryTabPath: null,
        editorSplit: false,
        activePane: 'primary',
        sessions,
        activeSessionId: null,
        messages: [],
        streamingContent: '',
        streamingToolCalls: [],
        sessionToolLog: [],
        isStreaming: false,
        runPhase: 'idle',
        runPhaseAt: 0,
        chatError: null,
        pendingApproval: null,
        routingInfo: null,
        lastTrace: null,
        lastUsage: null,
        activePersona: null,
        sessionMode: 'agent',
        indexStatus: { state: 'indexing', totalFiles: 0, indexedFiles: 0 } })

      if (sessions.length === 0) {
        // First time in this folder → start a fresh chat
        await get().createSession()
      } else {
        // Restore this folder's previous conversations
        const latest = [...sessions].sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        )[0]
        await get().selectSession(latest.id)
      }
    } finally {
      set({ isLoading: false })
    }
  },

  closeWorkspace: async () => {
    await window.codex.workspace.close()
    set({
      workspace: null,
      fileTree: [],
      explorerExpanded: {},
      tabs: [],
      activeTabPath: null,
      primaryTabPath: null,
      secondaryTabPath: null,
      editorSplit: false,
      activePane: 'primary',
      sessions: [],
      activeSessionId: null,
      messages: [],
      streamingContent: '',
      streamingToolCalls: [],
      sessionToolLog: [],
      isStreaming: false,
      chatError: null,
      pendingApproval: null,
      routingInfo: null,
      lastTrace: null,
      lastUsage: null,
      activePersona: null,
      indexStatus: { state: 'idle', totalFiles: 0, indexedFiles: 0 } })
  },

  addWorkspaceRoot: async (path?: string) => {
    let targetPath = path
    if (!targetPath) {
      targetPath = (await window.codex.dialog.openDirectory()) ?? undefined
    }
    if (!targetPath) return
    const workspace = await window.codex.workspace.addRoot(targetPath)
    const fileTree = await window.codex.workspace.getTree()
    set({ workspace, fileTree })
  },

  toggleExplorerDir: (path: string) => {
    const expanded = { ...get().explorerExpanded }
    if (expanded[path]) {
      delete expanded[path]
    } else {
      expanded[path] = true
    }
    set({ explorerExpanded: expanded })
  },

  collapseExplorer: () => {
    set({ explorerExpanded: {} })
  },

  revealInExplorer: (filePath: string) => {
    const root = get().workspace?.rootPaths[0]
    const dirs = explorerDirsToReveal(filePath, root)
    if (dirs.length === 0) return
    const expanded = { ...get().explorerExpanded }
    for (const dir of dirs) expanded[dir] = true
    set({ explorerExpanded: expanded })
  },

  refreshFileTree: async () => {
    // Coalesce bursty watcher/agent events; apply only the latest fetch.
    await new Promise<void>((resolve) => {
      fileTreeRefreshWaiters.push(resolve)
      if (fileTreeRefreshTimer) clearTimeout(fileTreeRefreshTimer)
      fileTreeRefreshTimer = setTimeout(() => {
        fileTreeRefreshTimer = null
        const waiters = fileTreeRefreshWaiters
        fileTreeRefreshWaiters = []
        void (async () => {
          const generation = ++fileTreeRefreshGeneration
          try {
            if (!get().workspace) {
              set({ fileTree: [] })
            } else {
              const fileTree = await window.codex.workspace.getTree()
              if (generation === fileTreeRefreshGeneration) {
                set({ fileTree })
              }
            }
          } catch (err) {
            console.error('[app] refreshFileTree failed:', err)
          } finally {
            for (const done of waiters) done()
          }
        })()
      }, 80)
    })
  },

  openFile: async (path: string, name: string) => {
    const { tabs, editorSplit, activePane } = get()
    const existing = tabs.find((t) => t.path === path)
    get().revealInExplorer(path)
    const panePatch =
      editorSplit && activePane === 'secondary'
        ? { secondaryTabPath: path, activeTabPath: path, activePane: 'secondary' as const }
        : {
            primaryTabPath: path,
            activeTabPath: path,
            activePane: 'primary' as const }
    if (existing) {
      set(panePatch)
      return
    }

    if (isPdfFile(name) || defaultTabKind(name) === 'pdf') {
      try {
        const binary = await window.codex.file.readBinary(path)
        set({
          tabs: [
            ...tabs,
            {
              path,
              name,
              content: '',
              isDirty: false,
              mdViewMode: 'preview',
              kind: 'pdf',
              binaryBase64: binary.base64,
              mimeType: binary.mimeType,
            },
          ],
          ...panePatch,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[app] open PDF failed:', path, err)
        set({
          tabs: [
            ...tabs,
            {
              path,
              name,
              content: `PDF を開けませんでした:\n${message}`,
              isDirty: false,
              mdViewMode: 'preview',
              kind: 'pdf',
            },
          ],
          ...panePatch,
        })
      }
      return
    }

    const content = await window.codex.file.read(path)
    set({
      tabs: [
        ...tabs,
        {
          path,
          name,
          content,
          isDirty: false,
          mdViewMode: defaultMdViewMode(name),
          kind: 'text',
        },
      ],
      ...panePatch,
    })
  },

  openChangedFile: async (path: string) => {
    // Always keep Explorer in sync even if tab reload is deduped/fails.
    void get().refreshFileTree()

    if (openingPaths.has(path)) return
    openingPaths.add(path)

    try {
      const { tabs } = get()
      const existing = tabs.find((t) => t.path === path)

      // Only refresh tabs the user already opened — never auto-open new ones.
      if (existing) {
        if (existing.kind === 'pdf' || isPdfFile(existing.name)) {
          const binary = await window.codex.file.readBinary(path)
          set({
            tabs: get().tabs.map((t) =>
              t.path === path
                ? {
                    ...t,
                    content: '',
                    isDirty: false,
                    kind: 'pdf',
                    binaryBase64: binary.base64,
                    mimeType: binary.mimeType,
                  }
                : t,
            ),
          })
        } else {
          const content = await window.codex.file.read(path)
          set({
            tabs: get().tabs.map((t) =>
              t.path === path ? { ...t, content, isDirty: false } : t,
            ),
          })
        }
      }
    } catch (err) {
      console.error('[app] openChangedFile failed:', path, err)
    } finally {
      openingPaths.delete(path)
    }
  },

  closeTab: (path: string) => {
    const { tabs, activeTabPath, primaryTabPath, secondaryTabPath } = get()
    const next = tabs.filter((t) => t.path !== path)
    const fallback = next.length > 0 ? next[next.length - 1].path : null
    const nextPrimary =
      primaryTabPath === path
        ? fallback
        : primaryTabPath && next.some((t) => t.path === primaryTabPath)
          ? primaryTabPath
          : fallback
    const nextSecondary =
      secondaryTabPath === path
        ? next.find((t) => t.path !== nextPrimary)?.path ?? nextPrimary
        : secondaryTabPath && next.some((t) => t.path === secondaryTabPath)
          ? secondaryTabPath
          : null
    const nextActive =
      activeTabPath === path ? nextPrimary : activeTabPath && next.some((t) => t.path === activeTabPath)
        ? activeTabPath
        : nextPrimary
    set({
      tabs: next,
      activeTabPath: nextActive,
      primaryTabPath: nextPrimary,
      secondaryTabPath: nextSecondary })
  },

  closeAllTabs: () => {
    const { tabs } = get()
    if (tabs.length === 0) return
    const dirtyCount = tabs.filter((t) => t.isDirty).length
    if (dirtyCount > 0) {
      const ok = window.confirm(
        `未保存の変更が ${dirtyCount} 件あります。すべて閉じますか？（変更は破棄されます）`,
      )
      if (!ok) return
    }
    set({
      tabs: [],
      activeTabPath: null,
      primaryTabPath: null,
      secondaryTabPath: null,
      editorSplit: false,
      activePane: 'primary' })
  },

  setActiveTab: (path: string) => {
    get().revealInExplorer(path)
    const { editorSplit, activePane } = get()
    if (editorSplit && activePane === 'secondary') {
      set({ activeTabPath: path, secondaryTabPath: path })
    } else {
      set({ activeTabPath: path, primaryTabPath: path })
    }
  },

  toggleEditorSplit: () => {
    const { editorSplit, activeTabPath, tabs, primaryTabPath } = get()
    if (editorSplit) {
      set({
        editorSplit: false,
        secondaryTabPath: null,
        activePane: 'primary',
        activeTabPath: primaryTabPath ?? activeTabPath })
      return
    }
    const primary = primaryTabPath ?? activeTabPath
    const other = tabs.find((t) => t.path !== primary)?.path ?? primary
    set({
      editorSplit: true,
      primaryTabPath: primary,
      secondaryTabPath: other,
      activePane: 'primary',
      activeTabPath: primary })
  },

  setActivePane: (pane) => {
    const { primaryTabPath, secondaryTabPath, activeTabPath } = get()
    set({
      activePane: pane,
      activeTabPath:
        pane === 'secondary'
          ? (secondaryTabPath ?? activeTabPath)
          : (primaryTabPath ?? activeTabPath) })
  },

  setTabMdViewMode: (path: string, mode: MdViewMode) => {
    set({
      tabs: get().tabs.map((t) => (t.path === path ? { ...t, mdViewMode: mode } : t)) })
  },

  updateTabContent: (path: string, content: string) => {
    set({
      tabs: get().tabs.map((t) =>
        t.path === path ? { ...t, content, isDirty: t.content !== content } : t,
      ) })
  },

  saveActiveFile: async () => {
    const { tabs, activeTabPath } = get()
    if (!activeTabPath) return
    const tab = tabs.find((t) => t.path === activeTabPath)
    if (!tab) return
    if (tab.kind === 'pdf' || isPdfFile(tab.name)) return

    await window.codex.file.write(tab.path, tab.content)
    set({
      tabs: tabs.map((t) => (t.path === activeTabPath ? { ...t, isDirty: false } : t)),
    })
    void get().refreshFileTree()
  },

  toggleAiPanel: () => {
    set({ aiPanelOpen: !get().aiPanelOpen })
  },

  toggleTerminalPanel: () => {
    set({ terminalPanelOpen: !get().terminalPanelOpen })
  },

  setSidebarView: (view: SidebarView) => {
    set({ sidebarView: view })
    if (view === 'explorer' && get().workspace) {
      void get().refreshFileTree()
    }
  },

  loadSessions: async () => {
    const sessions = await window.codex.session.list()
    const activeStillValid = sessions.some((s) => s.id === get().activeSessionId)

    set({
      sessions,
      ...(activeStillValid
        ? {}
        : {
            activeSessionId: null,
            messages: [],
            streamingContent: '',
            streamingToolCalls: [],
            isStreaming: false,
            chatError: null,
            pendingApproval: null,
            sessionMode: 'agent' as const }) })

    if (sessions.length === 0) return

    if (!get().activeSessionId) {
      const latest = [...sessions].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )[0]
      await get().selectSession(latest.id)
    }
  },

  selectSession: async (sessionId: string) => {
    const messages = await window.codex.session.select(sessionId)
    const session = get().sessions.find((s) => s.id === sessionId)
    const lastWithTrace = [...messages].reverse().find((m) => m.role === 'assistant' && m.trace)
    const stickyName = session?.personaName
    set({
      activeSessionId: sessionId,
      messages,
      streamingContent: '',
      streamingToolCalls: [],
      sessionToolLog: toolLogFromMessages(messages),
      // Drop previous workspace/session routing overlay so the header shows settings.
      routingInfo: null,
      lastUsage: lastWithTrace?.trace?.usage ?? null,
      lastTrace: lastWithTrace?.trace
        ? {
            personaId: lastWithTrace.trace.personaId,
            personaName: lastWithTrace.trace.personaName,
            provider: lastWithTrace.trace.provider,
            model: lastWithTrace.trace.model,
            routeReason: lastWithTrace.trace.routeReason,
            toolCount: lastWithTrace.trace.toolCount }
        : null,
      activePersona: stickyName
        ? { personaId: stickyName, personaName: stickyName }
        : lastWithTrace?.trace?.personaName
          ? {
              personaId: lastWithTrace.trace.personaId ?? '',
              personaName: lastWithTrace.trace.personaName }
          : null,
      chatError: null,
      isStreaming: false,
      sessionMode: session?.mode ?? 'ask' })
  },

  createSession: async () => {
    const session = await window.codex.session.create()
    set({
      sessions: [session, ...get().sessions],
      activeSessionId: session.id,
      messages: [],
      streamingContent: '',
      streamingToolCalls: [],
      sessionToolLog: [],
      lastUsage: null,
      lastTrace: null,
      routingInfo: null,
      activePersona: null,
      chatError: null,
      sessionMode: session.mode })
  },

  clearSessionToolLog: () => set({ sessionToolLog: [] }),

  setSessionMode: async (mode: SessionMode) => {
    const { activeSessionId, sessions } = get()
    if (!activeSessionId) return

    // UI を先に更新（Main 未再起動時も Agent 送信が効くようにする）
    set({
      sessionMode: mode,
      sessions: sessions.map((s) =>
        s.id === activeSessionId ? { ...s, mode } : s,
      ) })

    try {
      const updated = await window.codex.session.setMode(activeSessionId, mode)
      set({
        sessions: get().sessions.map((s) => (s.id === updated.id ? updated : s)) })
    } catch (err) {
      console.warn('[app] session mode persist failed (restart pnpm dev if needed):', err)
    }
  },

  setSessionPersona: async (personaName: string | null) => {
    const { activeSessionId, sessions } = get()
    if (!activeSessionId) return

    const next = personaName?.trim() || undefined
    set({
      activePersona: next ? { personaId: next, personaName: next } : null,
      sessions: sessions.map((s) =>
        s.id === activeSessionId ? { ...s, personaName: next } : s,
      ) })

    try {
      const updated = await window.codex.session.setPersona(activeSessionId,
        next ?? null,
      )
      set({
        sessions: get().sessions.map((s) => (s.id === updated.id ? updated : s)),
        activePersona: updated.personaName
          ? { personaId: updated.personaName, personaName: updated.personaName }
          : null })
    } catch (err) {
      console.warn('[app] session persona persist failed:', err)
    }
  },

  setRoutingMode: async (mode: RoutingMode) => {
    const current = get().settings
    if (current) {
      set({
        settings: {
          ...current,
          routing: { ...current.routing, mode } } })
    }
    try {
      const latest = await window.codex.settings.get()
      const updated = await window.codex.settings.set({
        routing: {
          ...latest.routing,
          mode } })
      set({ settings: updated })
    } catch (err) {
      console.warn('[app] routing mode persist failed:', err)
      await get().loadSettings()
    }
  },

  respondApproval: async (approved: boolean) => {
    const { pendingApproval } = get()
    if (!pendingApproval) return
    await window.codex.agent.approvalRespond(pendingApproval.sessionId,
      pendingApproval.toolCallId,
      approved,
    )
    set({ pendingApproval: null })
  },

  respondCeoApproval: async (decision, note) => {
    const { pendingCeoApproval } = get()
    if (!pendingCeoApproval) return
    await window.codex.ceo.approvalRespond(pendingCeoApproval.sessionId,
      pendingCeoApproval.approvalId,
      {
        decision,
        note },
    )
    set({ pendingCeoApproval: null })
  },

  sendMessage: async (content: string, attachments: Attachment[]) => {
    const { activeSessionId, sessionMode } = get()
    if (!activeSessionId) return

    const userMessage: Message = {
      id: `temp-${Date.now()}`,
      sessionId: activeSessionId,
      role: 'user',
      content,
      attachments: attachments.map(({ type, path, name }) => ({ type, path, name })),
      createdAt: new Date().toISOString() }

    set({
      messages: [...get().messages, userMessage],
      isStreaming: true,
      runPhase: 'running',
      runPhaseAt: Date.now(),
      streamingContent: '',
      streamingToolCalls: [],
      chatError: null,
      routingInfo: null,
      activePersona: null,
      pendingCeoApproval: null,
      teamStage: null })

    const contextPaths = get().tabs.map((t) => t.path)

    await window.codex.chat.send({
      sessionId: activeSessionId,
      content,
      attachments,
      mode: sessionMode === 'agent' ? 'agent' : sessionMode === 'plan' ? 'plan' : 'ask',
      contextPaths })
  },

  cancelChat: async () => {
    const { activeSessionId } = get()
    if (!activeSessionId) return
    await window.codex.chat.cancel(activeSessionId)
    set({
      isStreaming: false,
      runPhase: 'cancelled',
      runPhaseAt: Date.now(),
      streamingContent: '',
      streamingToolCalls: [] })
  },

  compactChat: async () => {
    const { activeSessionId, isStreaming } = get()
    if (!activeSessionId || isStreaming) return
    const messages = await window.codex.chat.compact(activeSessionId)
    set({ messages, chatError: null })
  } }))
