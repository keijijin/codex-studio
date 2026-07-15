import { create } from 'zustand'
import type {
  AppSettings,
  ApprovalRequest,
  Attachment,
  FileNode,
  IndexStatus,
  Message,
  Session,
  SessionMode,
  ToolCallRecord,
  Workspace,
} from '@codex/shared'
import { IPC_CHANNELS, IPC_EVENTS } from '@codex/shared'
import { hasCodexApi } from '@renderer/components/ErrorBoundary'
import { defaultMdViewMode, type MdViewMode } from '@renderer/utils/files'

const openingPaths = new Set<string>()

interface EditorTab {
  path: string
  name: string
  content: string
  isDirty: boolean
  mdViewMode: MdViewMode
}

type SidebarView = 'explorer' | 'search'

interface AppState {
  workspace: Workspace | null
  fileTree: FileNode[]
  tabs: EditorTab[]
  activeTabPath: string | null
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
  streamingContent: string
  streamingToolCalls: ToolCallRecord[]
  chatError: string | null
  sessionMode: SessionMode
  pendingApproval: (ApprovalRequest & { sessionId: string }) | null
  listenersSetup: boolean

  initialize: () => Promise<void>
  setupListeners: () => void
  loadSettings: () => Promise<void>
  openWorkspace: (path?: string) => Promise<void>
  closeWorkspace: () => Promise<void>
  refreshFileTree: () => Promise<void>
  openFile: (path: string, name: string) => Promise<void>
  openChangedFile: (path: string) => Promise<void>
  closeTab: (path: string) => void
  setActiveTab: (path: string) => void
  setTabMdViewMode: (path: string, mode: MdViewMode) => void
  updateTabContent: (path: string, content: string) => void
  saveActiveFile: () => Promise<void>
  toggleAiPanel: () => void
  toggleTerminalPanel: () => void
  setSidebarView: (view: SidebarView) => void
  createSession: () => Promise<void>
  selectSession: (sessionId: string) => Promise<void>
  loadSessions: () => Promise<void>
  sendMessage: (content: string, attachments: Attachment[]) => Promise<void>
  cancelChat: () => Promise<void>
  setSessionMode: (mode: SessionMode) => Promise<void>
  respondApproval: (approved: boolean) => Promise<void>
  refreshIndexStatus: () => Promise<void>
}

export const useAppStore = create<AppState>((set, get) => ({
  workspace: null,
  fileTree: [],
  tabs: [],
  activeTabPath: null,
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
  streamingContent: '',
  streamingToolCalls: [],
  chatError: null,
  sessionMode: 'ask',
  pendingApproval: null,
  listenersSetup: false,

  initialize: async () => {
    if (!hasCodexApi()) {
      console.error('[app] window.codex is not available — check preload script')
      return
    }
    get().setupListeners()
    await get().loadSettings()
    const workspace = await window.codex.invoke(IPC_CHANNELS.WORKSPACE_GET)
    if (workspace) {
      const fileTree = await window.codex.invoke(IPC_CHANNELS.WORKSPACE_GET_TREE)
      set({ workspace, fileTree })
      await get().loadSessions()
      await get().refreshIndexStatus()
    }
  },

  setupListeners: () => {
    if (get().listenersSetup) return

    window.codex.on(IPC_EVENTS.CHAT_STREAM, (event) => {
      const { activeSessionId } = get()
      if (event.sessionId !== activeSessionId) return

      if (event.type === 'text_delta') {
        set((s) => ({
          streamingContent: s.streamingContent + event.content,
          chatError: null,
        }))
      } else if (event.type === 'tool_call_start') {
        set((s) => ({
          streamingToolCalls: [
            ...s.streamingToolCalls,
            {
              id: event.toolCallId,
              name: event.tool,
              args: event.args,
              status: 'running' as const,
            },
          ],
        }))
      } else if (event.type === 'tool_call_result') {
        set((s) => ({
          streamingToolCalls: s.streamingToolCalls.map((tc) =>
            tc.id === event.toolCallId
              ? {
                  ...tc,
                  result: event.result,
                  status: event.success ? ('done' as const) : ('error' as const),
                }
              : tc,
          ),
        }))
        if (event.success && event.filePath) {
          void get().openChangedFile(event.filePath)
        }
      } else if (event.type === 'approval_required') {
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
            action: event.action as ApprovalRequest['action'],
          },
        })
      } else if (event.type === 'done') {
        void (async () => {
          const messages = await window.codex.invoke(IPC_CHANNELS.SESSION_SELECT, event.sessionId)
          const sessions = await window.codex.invoke(IPC_CHANNELS.SESSION_LIST)
          set({
            messages,
            sessions,
            isStreaming: false,
            streamingContent: '',
            streamingToolCalls: [],
            chatError: null,
            pendingApproval: null,
          })
        })()
      } else if (event.type === 'error') {
        set({ isStreaming: false, streamingContent: '', streamingToolCalls: [], chatError: event.message })
      }
    })

    window.codex.on(IPC_EVENTS.INDEX_PROGRESS, (status) => {
      set({ indexStatus: status })
    })

    window.codex.on(IPC_EVENTS.FILE_CHANGED, (payload) => {
      void get().openChangedFile(payload.path)
    })

    set({ listenersSetup: true })
  },

  loadSettings: async () => {
    const settings = await window.codex.invoke(IPC_CHANNELS.SETTINGS_GET)
    set({ settings })
  },

  refreshIndexStatus: async () => {
    const indexStatus = await window.codex.invoke(IPC_CHANNELS.INDEX_STATUS)
    set({ indexStatus })
  },

  openWorkspace: async (path?: string) => {
    set({ isLoading: true })
    try {
      let targetPath = path
      if (!targetPath) {
        targetPath = (await window.codex.invoke(IPC_CHANNELS.DIALOG_OPEN_DIRECTORY)) ?? undefined
      }
      if (!targetPath) return

      const workspace = await window.codex.invoke(IPC_CHANNELS.WORKSPACE_OPEN, targetPath)
      const fileTree = await window.codex.invoke(IPC_CHANNELS.WORKSPACE_GET_TREE)
      set({ workspace, fileTree, tabs: [], activeTabPath: null, indexStatus: { state: 'indexing', totalFiles: 0, indexedFiles: 0 } })
      await get().loadSessions()
      if (get().sessions.length === 0) {
        await get().createSession()
      }
    } finally {
      set({ isLoading: false })
    }
  },

  closeWorkspace: async () => {
    await window.codex.invoke(IPC_CHANNELS.WORKSPACE_CLOSE)
    set({
      workspace: null,
      fileTree: [],
      tabs: [],
      activeTabPath: null,
      sessions: [],
      activeSessionId: null,
      messages: [],
      indexStatus: { state: 'idle', totalFiles: 0, indexedFiles: 0 },
    })
  },

  refreshFileTree: async () => {
    const fileTree = await window.codex.invoke(IPC_CHANNELS.WORKSPACE_GET_TREE)
    set({ fileTree })
  },

  openFile: async (path: string, name: string) => {
    const { tabs } = get()
    const existing = tabs.find((t) => t.path === path)
    if (existing) {
      set({ activeTabPath: path })
      return
    }

    const content = await window.codex.invoke(IPC_CHANNELS.FILE_READ, path)
    set({
      tabs: [...tabs, { path, name, content, isDirty: false, mdViewMode: defaultMdViewMode(name) }],
      activeTabPath: path,
    })
  },

  openChangedFile: async (path: string) => {
    if (openingPaths.has(path)) return
    openingPaths.add(path)

    try {
      const name = path.split(/[/\\]/).pop() ?? path
      const { tabs } = get()
      const existing = tabs.find((t) => t.path === path)

      if (existing) {
        const content = await window.codex.invoke(IPC_CHANNELS.FILE_READ, path)
        set({
          tabs: get().tabs.map((t) =>
            t.path === path ? { ...t, content, isDirty: false } : t,
          ),
          activeTabPath: path,
        })
      } else {
        await get().openFile(path, name)
      }
      await get().refreshFileTree()
    } catch (err) {
      console.error('[app] openChangedFile failed:', path, err)
    } finally {
      openingPaths.delete(path)
    }
  },

  closeTab: (path: string) => {
    const { tabs, activeTabPath } = get()
    const next = tabs.filter((t) => t.path !== path)
    let nextActive = activeTabPath
    if (activeTabPath === path) {
      nextActive = next.length > 0 ? next[next.length - 1].path : null
    }
    set({ tabs: next, activeTabPath: nextActive })
  },

  setActiveTab: (path: string) => {
    set({ activeTabPath: path })
  },

  setTabMdViewMode: (path: string, mode: MdViewMode) => {
    set({
      tabs: get().tabs.map((t) => (t.path === path ? { ...t, mdViewMode: mode } : t)),
    })
  },

  updateTabContent: (path: string, content: string) => {
    set({
      tabs: get().tabs.map((t) =>
        t.path === path ? { ...t, content, isDirty: t.content !== content } : t,
      ),
    })
  },

  saveActiveFile: async () => {
    const { tabs, activeTabPath } = get()
    if (!activeTabPath) return
    const tab = tabs.find((t) => t.path === activeTabPath)
    if (!tab) return

    await window.codex.invoke(IPC_CHANNELS.FILE_WRITE, tab.path, tab.content)
    set({
      tabs: tabs.map((t) => (t.path === activeTabPath ? { ...t, isDirty: false } : t)),
    })
  },

  toggleAiPanel: () => {
    set({ aiPanelOpen: !get().aiPanelOpen })
  },

  toggleTerminalPanel: () => {
    set({ terminalPanelOpen: !get().terminalPanelOpen })
  },

  setSidebarView: (view: SidebarView) => {
    set({ sidebarView: view })
  },

  loadSessions: async () => {
    const sessions = await window.codex.invoke(IPC_CHANNELS.SESSION_LIST)
    set({ sessions })
    if (sessions.length === 0) return

    const { activeSessionId } = get()
    if (!activeSessionId) {
      const latest = [...sessions].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )[0]
      await get().selectSession(latest.id)
    }
  },

  selectSession: async (sessionId: string) => {
    const messages = await window.codex.invoke(IPC_CHANNELS.SESSION_SELECT, sessionId)
    const session = get().sessions.find((s) => s.id === sessionId)
    set({
      activeSessionId: sessionId,
      messages,
      streamingContent: '',
      streamingToolCalls: [],
      chatError: null,
      isStreaming: false,
      sessionMode: session?.mode ?? 'ask',
    })
  },

  createSession: async () => {
    const session = await window.codex.invoke(IPC_CHANNELS.SESSION_CREATE)
    set({
      sessions: [session, ...get().sessions],
      activeSessionId: session.id,
      messages: [],
      streamingContent: '',
      streamingToolCalls: [],
      chatError: null,
      sessionMode: session.mode,
    })
  },

  setSessionMode: async (mode: SessionMode) => {
    const { activeSessionId, sessions } = get()
    if (!activeSessionId) return

    // UI を先に更新（Main 未再起動時も Agent 送信が効くようにする）
    set({
      sessionMode: mode,
      sessions: sessions.map((s) =>
        s.id === activeSessionId ? { ...s, mode } : s,
      ),
    })

    try {
      const updated = await window.codex.invoke(IPC_CHANNELS.SESSION_SET_MODE, activeSessionId, mode)
      set({
        sessions: get().sessions.map((s) => (s.id === updated.id ? updated : s)),
      })
    } catch (err) {
      console.warn('[app] session mode persist failed (restart pnpm dev if needed):', err)
    }
  },

  respondApproval: async (approved: boolean) => {
    const { pendingApproval, activeSessionId } = get()
    if (!pendingApproval || !activeSessionId) return
    await window.codex.invoke(
      IPC_CHANNELS.AGENT_APPROVAL_RESPOND,
      activeSessionId,
      pendingApproval.toolCallId,
      approved,
    )
    set({ pendingApproval: null })
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
      createdAt: new Date().toISOString(),
    }

    set({
      messages: [...get().messages, userMessage],
      isStreaming: true,
      streamingContent: '',
      streamingToolCalls: [],
      chatError: null,
    })

    await window.codex.invoke(IPC_CHANNELS.CHAT_SEND, {
      sessionId: activeSessionId,
      content,
      attachments,
      mode: sessionMode === 'agent' ? 'agent' : 'ask',
    })
  },

  cancelChat: async () => {
    const { activeSessionId } = get()
    if (!activeSessionId) return
    await window.codex.invoke(IPC_CHANNELS.CHAT_CANCEL, activeSessionId)
    set({ isStreaming: false, streamingContent: '', streamingToolCalls: [] })
  },
}))
