import Store from 'electron-store'
import { app } from 'electron'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import {
  APP_USER_DATA_DIR,
  DEFAULT_AGENT_PERMISSIONS,
  DEFAULT_SETTINGS,
  type AppSettings,
  type Message,
  type Session,
} from '@codex/shared'
import { randomUUID } from 'crypto'

interface StoreSchema {
  settings: AppSettings
  recentWorkspaces: string[]
  sessions: Session[]
  messages: Record<string, Message[]>
  /** Maps normalized workspace root → known workspaceIds (for history restore) */
  workspaceIdByRoot: Record<string, string[]>
  /** One-shot bump of legacy agent.maxIterations default (25 → 100) */
  migratedMaxIterationsV2?: boolean
  /** One-shot merge from misplaced "Codex Studio" userData folder */
  migratedFromDisplayNameDir?: boolean
}

/** Absolute path — never rely on app.getName() / userData (breaks on rename). */
function storeCwd(): string {
  return join(app.getPath('appData'), APP_USER_DATA_DIR)
}

const store = new Store<StoreSchema>({
  name: 'codex-studio',
  cwd: storeCwd(),
  defaults: {
    settings: DEFAULT_SETTINGS,
    recentWorkspaces: [],
    sessions: [],
    messages: {},
    workspaceIdByRoot: {},
    migratedMaxIterationsV2: false,
    migratedFromDisplayNameDir: false,
  },
})

/** Recover chats written while userData briefly pointed at "Codex Studio". */
function migrateFromDisplayNameDirIfNeeded(): void {
  if (store.get('migratedFromDisplayNameDir')) return

  const misplaced = join(app.getPath('appData'), 'Codex Studio', 'codex-studio.json')
  if (!existsSync(misplaced)) {
    store.set('migratedFromDisplayNameDir', true)
    return
  }

  try {
    const raw = JSON.parse(readFileSync(misplaced, 'utf-8')) as Partial<StoreSchema>
    const existingSessions = store.get('sessions')
    const existingIds = new Set(existingSessions.map((s) => s.id))
    const existingMessages = store.get('messages')
    const incomingSessions = raw.sessions ?? []
    const incomingMessages = raw.messages ?? {}

    let added = 0
    for (const session of incomingSessions) {
      if (existingIds.has(session.id)) continue
      const msgs = incomingMessages[session.id] ?? []
      // Skip empty New Chat placeholders created after the path split
      if (session.title === 'New Chat' && msgs.length === 0) continue
      existingSessions.unshift(session)
      existingIds.add(session.id)
      if (msgs.length > 0) {
        existingMessages[session.id] = msgs
      }
      added++
    }

    const map = { ...(store.get('workspaceIdByRoot') ?? {}) }
    for (const [root, ids] of Object.entries(raw.workspaceIdByRoot ?? {})) {
      const merged = new Set([...(map[root] ?? []), ...ids])
      map[root] = [...merged]
    }

    if (added > 0) {
      store.set('sessions', existingSessions)
      store.set('messages', existingMessages)
      store.set('workspaceIdByRoot', map)
    }

    // Prefer richer settings (API keys) from whichever side has them
    const currentSettings = store.get('settings')
    const other = raw.settings
    if (other?.models) {
      store.set('settings', {
        ...currentSettings,
        models: {
          ...currentSettings.models,
          openaiApiKey: currentSettings.models.openaiApiKey || other.models.openaiApiKey,
          anthropicApiKey: currentSettings.models.anthropicApiKey || other.models.anthropicApiKey,
          ollamaBaseUrl: currentSettings.models.ollamaBaseUrl || other.models.ollamaBaseUrl,
        },
      })
    }

    const recent = store.get('recentWorkspaces')
    for (const path of raw.recentWorkspaces ?? []) {
      if (!recent.includes(path)) recent.push(path)
    }
    store.set('recentWorkspaces', recent.slice(0, 10))
  } catch {
    // ignore corrupt misplaced store
  }

  store.set('migratedFromDisplayNameDir', true)
}

migrateFromDisplayNameDirIfNeeded()

function clampMaxIterations(value: unknown): number {
  const n = typeof value === 'number' ? value : DEFAULT_SETTINGS.agent.maxIterations
  return Math.min(500, Math.max(5, Math.floor(n)))
}

export class SettingsService {
  get(): AppSettings {
    const stored = store.get('settings')
    const agent = { ...DEFAULT_SETTINGS.agent, ...stored.agent }

    // Legacy default (25) was too low; bump once for users who never customized it.
    if (!store.get('migratedMaxIterationsV2') && stored.agent?.maxIterations === 25) {
      agent.maxIterations = DEFAULT_SETTINGS.agent.maxIterations
      store.set('migratedMaxIterationsV2', true)
      store.set('settings', {
        ...DEFAULT_SETTINGS,
        ...stored,
        general: { ...DEFAULT_SETTINGS.general, ...stored.general },
        models: { ...DEFAULT_SETTINGS.models, ...stored.models },
        agent,
      })
    }

    agent.maxIterations = clampMaxIterations(agent.maxIterations)
    agent.permissions = {
      ...DEFAULT_AGENT_PERMISSIONS,
      ...agent.permissions,
    }
    if (typeof agent.compactTokenThreshold !== 'number') {
      agent.compactTokenThreshold = DEFAULT_SETTINGS.agent.compactTokenThreshold
    }
    if (typeof agent.autoMemory !== 'boolean') {
      agent.autoMemory = DEFAULT_SETTINGS.agent.autoMemory
    }
    if (typeof agent.maxSubagents !== 'number') {
      agent.maxSubagents = DEFAULT_SETTINGS.agent.maxSubagents
    } else {
      agent.maxSubagents = Math.min(8, Math.max(1, Math.floor(agent.maxSubagents)))
    }
    return {
      ...DEFAULT_SETTINGS,
      ...stored,
      general: { ...DEFAULT_SETTINGS.general, ...stored.general },
      models: { ...DEFAULT_SETTINGS.models, ...stored.models },
      agent,
    }
  }

  set(partial: Partial<AppSettings>): AppSettings {
    const current = this.get()
    const agent = {
      ...current.agent,
      ...partial.agent,
      permissions: {
        ...current.agent.permissions,
        ...partial.agent?.permissions,
      },
    }
    agent.maxIterations = clampMaxIterations(agent.maxIterations)
    if (typeof agent.maxSubagents === 'number') {
      agent.maxSubagents = Math.min(8, Math.max(1, Math.floor(agent.maxSubagents)))
    }
    // User explicitly saved — do not re-run legacy bump.
    store.set('migratedMaxIterationsV2', true)
    const updated: AppSettings = {
      ...current,
      ...partial,
      general: { ...current.general, ...partial.general },
      models: { ...current.models, ...partial.models },
      agent,
    }
    store.set('settings', updated)
    return updated
  }

  save(): void {
    // electron-store auto-saves; explicit hook for lifecycle
  }

  addRecentWorkspace(path: string): void {
    const recent = store.get('recentWorkspaces').filter((p) => p !== path)
    recent.unshift(path)
    store.set('recentWorkspaces', recent.slice(0, 10))
  }

  getRecentWorkspaces(): string[] {
    return store.get('recentWorkspaces')
  }
}

export class SessionService {
  /** Remember workspaceId for a root so chats survive id-scheme changes. */
  rememberWorkspaceId(workspaceRoot: string, workspaceId: string): void {
    const map = store.get('workspaceIdByRoot') ?? {}
    const existing = map[workspaceRoot] ?? []
    if (!existing.includes(workspaceId)) {
      map[workspaceRoot] = [...existing, workspaceId]
      store.set('workspaceIdByRoot', map)
    }
  }

  list(workspaceId?: string): Session[] {
    const sessions = store.get('sessions')
    if (!workspaceId) return sessions
    return sessions.filter((s) => s.workspaceId === workspaceId)
  }

  /** Sessions belonging to a folder (by root path and/or workspace id history). */
  listForWorkspace(workspaceId: string, workspaceRoot: string): Session[] {
    this.rememberWorkspaceId(workspaceRoot, workspaceId)
    const knownIds = new Set(store.get('workspaceIdByRoot')[workspaceRoot] ?? [workspaceId])
    knownIds.add(workspaceId)

    const sessions = store.get('sessions')
    const matched = sessions.filter(
      (s) =>
        s.workspaceRoot === workspaceRoot ||
        knownIds.has(s.workspaceId),
    )

    // Backfill workspaceRoot on matched sessions for future opens
    let changed = false
    const updated = sessions.map((s) => {
      if (matched.some((m) => m.id === s.id) && s.workspaceRoot !== workspaceRoot) {
        changed = true
        return { ...s, workspaceRoot, workspaceId }
      }
      return s
    })
    if (changed) {
      store.set('sessions', updated)
      return updated.filter(
        (s) => s.workspaceRoot === workspaceRoot || knownIds.has(s.workspaceId),
      )
    }
    return matched
  }

  getSession(sessionId: string): Session | undefined {
    return store.get('sessions').find((s) => s.id === sessionId)
  }

  setMode(sessionId: string, mode: Session['mode']): Session {
    const sessions = store.get('sessions')
    const session = sessions.find((s) => s.id === sessionId)
    if (!session) {
      throw new Error('Session not found')
    }
    const updated = { ...session, mode, updatedAt: new Date().toISOString() }
    store.set(
      'sessions',
      sessions.map((s) => (s.id === sessionId ? updated : s)),
    )
    return updated
  }

  create(workspaceId: string, workspaceRoot?: string): Session {
    const now = new Date().toISOString()
    if (workspaceRoot) {
      this.rememberWorkspaceId(workspaceRoot, workspaceId)
    }
    const session: Session = {
      id: randomUUID(),
      workspaceId,
      workspaceRoot,
      title: 'New Chat',
      mode: 'ask',
      modelId: store.get('settings').models.defaultChatModel,
      createdAt: now,
      updatedAt: now,
    }
    const sessions = store.get('sessions')
    sessions.unshift(session)
    store.set('sessions', sessions)
    store.set(`messages.${session.id}`, [] as Message[])
    return session
  }

  getMessages(sessionId: string): Message[] {
    const messages = store.get('messages')
    return messages[sessionId] ?? []
  }

  updateTitle(sessionId: string, title: string): void {
    const sessions = store.get('sessions').map((s) =>
      s.id === sessionId ? { ...s, title, updatedAt: new Date().toISOString() } : s,
    )
    store.set('sessions', sessions)
  }

  addMessage(
    sessionId: string,
    message: Omit<Message, 'id' | 'createdAt'>,
  ): Message {
    const full: Message = {
      ...message,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    }
    const messages = store.get('messages')
    const sessionMessages = messages[sessionId] ?? []
    sessionMessages.push(full)
    messages[sessionId] = sessionMessages
    store.set('messages', messages)

    const sessions = store.get('sessions').map((s) =>
      s.id === sessionId ? { ...s, updatedAt: full.createdAt } : s,
    )
    store.set('sessions', sessions)

    return full
  }

  /** Replace all messages for a session (used by Compact). */
  replaceMessages(sessionId: string, next: Message[]): void {
    const messages = store.get('messages')
    messages[sessionId] = next
    store.set('messages', messages)
    const sessions = store.get('sessions').map((s) =>
      s.id === sessionId ? { ...s, updatedAt: new Date().toISOString() } : s,
    )
    store.set('sessions', sessions)
  }
}

export const settingsService = new SettingsService()
export const sessionService = new SessionService()
