import Store from 'electron-store'
import {
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
}

const store = new Store<StoreSchema>({
  name: 'codex-studio',
  defaults: {
    settings: DEFAULT_SETTINGS,
    recentWorkspaces: [],
    sessions: [],
    messages: {},
  },
})

export class SettingsService {
  get(): AppSettings {
    const stored = store.get('settings')
    return {
      ...DEFAULT_SETTINGS,
      ...stored,
      general: { ...DEFAULT_SETTINGS.general, ...stored.general },
      models: { ...DEFAULT_SETTINGS.models, ...stored.models },
      agent: { ...DEFAULT_SETTINGS.agent, ...stored.agent },
    }
  }

  set(partial: Partial<AppSettings>): AppSettings {
    const current = this.get()
    const updated: AppSettings = {
      ...current,
      ...partial,
      general: { ...current.general, ...partial.general },
      models: { ...current.models, ...partial.models },
      agent: { ...current.agent, ...partial.agent },
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
  list(): Session[] {
    return store.get('sessions')
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

  create(workspaceId: string): Session {
    const now = new Date().toISOString()
    const session: Session = {
      id: randomUUID(),
      workspaceId,
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
}

export const settingsService = new SettingsService()
export const sessionService = new SessionService()
