import Store from 'electron-store'
import { app } from 'electron'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import {
  APP_USER_DATA_DIR,
  DEFAULT_AGENT_PERMISSIONS,
  DEFAULT_COST_SETTINGS,
  DEFAULT_SETTINGS,
  DEFAULT_KEYBINDINGS,
  DEFAULT_PRESENTATION_SETTINGS,
  DEFAULT_SEMANTIC_SEARCH,
  DEFAULT_TAB_COMPLETION,
  DEFAULT_LANGFUSE,
  DEFAULT_VIDEO_SETTINGS,
  migrateModelId,
  normalizeRoutingSettings,
  sanitizeMessageForPersist,
  type AppSettings,
  type Message,
  type Session,
} from '@codex/shared'
import { randomUUID } from 'crypto'
import { API_KEY_REDACTED, isRedactedApiKey } from '@codex/shared'
import { sessionDb } from './session-db'
import {
  applySecretsToSettings,
  extractSecretsFromSettings,
  hasPlaintextSecrets,
  isSecretEncryptionAvailable,
  loadPlainSecrets,
  migratePlaintextSecrets,
  savePlainSecrets,
  stripSecretsForDisk,
  type SecretBag,
  type SecretKeyName,
} from './secret-store'

interface StoreSchema {
  settings: AppSettings
  recentWorkspaces: string[]
  sessions: Session[]
  messages: Record<string, Message[]>
  /** Maps normalized workspace root → known workspaceIds (for history restore) */
  workspaceIdByRoot: Record<string, string[]>
  /** One-shot bump of legacy agent.maxIterations default (25 → 100) */
  migratedMaxIterationsV2?: boolean
  /** One-shot: enable Explorer build-output visibility (dist/out/…) */
  migratedShowBuildOutputsV2?: boolean
  /** One-shot merge from misplaced "Codex Studio" userData folder */
  migratedFromDisplayNameDir?: boolean
  /** API keys moved from plaintext settings JSON into OS-backed secrets.enc.json */
  migratedSecretsToSafeStorage?: boolean
}

/** Absolute path — never rely on app.getName() (breaks on rename). Honor ELECTRON_USER_DATA via bootstrap. */
function storeCwd(): string {
  return app.getPath('userData')
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
    migratedShowBuildOutputsV2: false,
    migratedFromDisplayNameDir: false,
    migratedSecretsToSafeStorage: false,
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
          xaiApiKey: currentSettings.models.xaiApiKey || other.models.xaiApiKey,
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
  /** In-memory overlay so get() stays sync after async safeStorage init (Electron 45+). */
  private secretBag: SecretBag = {}
  private secretEncryptionAvailable = false
  private secretsInitialized = false
  private secretsInitPromise: Promise<void> | null = null

  /**
   * Must run once after `app.whenReady()` before relying on encrypted API keys.
   * Loads / migrates secrets via async safeStorage (sync APIs are deprecated in Electron 45).
   */
  async initSecrets(): Promise<void> {
    if (this.secretsInitialized) return
    if (this.secretsInitPromise) return this.secretsInitPromise
    this.secretsInitPromise = this.runSecretsInit()
    await this.secretsInitPromise
  }

  private async runSecretsInit(): Promise<void> {
    this.secretEncryptionAvailable = await isSecretEncryptionAvailable()
    if (!this.secretEncryptionAvailable) {
      this.secretsInitialized = true
      return
    }

    const stored = store.get('settings')
    const base = { ...DEFAULT_SETTINGS, ...stored } as AppSettings
    if (hasPlaintextSecrets(base)) {
      const migration = await migratePlaintextSecrets(base)
      if (migration.migrated) {
        store.set('settings', stripSecretsForDisk(migration.settings))
        store.set('migratedSecretsToSafeStorage', true)
        console.info('[settings] migrated API keys into OS secret store (safeStorage)')
        this.secretBag = extractSecretsFromSettings(migration.settings)
        this.secretsInitialized = true
        return
      }
    }

    this.secretBag = await loadPlainSecrets()
    this.secretsInitialized = true
  }

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
        routing: normalizeRoutingSettings(stored.routing ?? DEFAULT_SETTINGS.routing),
        agent,
      })
    }

    // Previous default hid dist/out; turn visibility on once so Explorer shows build outputs.
    if (!store.get('migratedShowBuildOutputsV2')) {
      const general = {
        ...DEFAULT_SETTINGS.general,
        ...stored.general,
        showBuildOutputs: true,
      }
      store.set('migratedShowBuildOutputsV2', true)
      store.set('settings', {
        ...DEFAULT_SETTINGS,
        ...stored,
        general,
        models: { ...DEFAULT_SETTINGS.models, ...stored.models },
        routing: normalizeRoutingSettings(stored.routing ?? DEFAULT_SETTINGS.routing),
        agent: { ...DEFAULT_SETTINGS.agent, ...stored.agent, ...agent },
      })
      stored.general = general
    }

    agent.maxIterations = clampMaxIterations(agent.maxIterations)
    agent.permissions = {
      ...DEFAULT_AGENT_PERMISSIONS,
      ...agent.permissions,
      mcp: agent.permissions?.mcp ?? DEFAULT_AGENT_PERMISSIONS.mcp,
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
    if (typeof agent.defaultPersona !== 'string') {
      agent.defaultPersona = DEFAULT_SETTINGS.agent.defaultPersona
    } else {
      agent.defaultPersona = agent.defaultPersona.trim() || undefined
    }
    const cost = {
      ...DEFAULT_COST_SETTINGS,
      ...stored.cost,
    }
    cost.maxOutputTokens = Math.min(128_000, Math.max(256, Math.floor(cost.maxOutputTokens) || 4096))
    cost.maxOutputTokensAgent = Math.min(
      128_000,
      Math.max(256, Math.floor(cost.maxOutputTokensAgent) || 8192),
    )
    cost.dailyBudgetUsd = Math.max(0, Number(cost.dailyBudgetUsd) || 0)
    const video = {
      ...DEFAULT_VIDEO_SETTINGS,
      ...stored.video,
    }
    video.maxShots = Math.min(30, Math.max(2, Math.floor(video.maxShots) || 12))
    video.maxGenerativeShots = Math.min(
      video.maxShots,
      Math.max(0, Math.floor(video.maxGenerativeShots) || 0),
    )
    video.mode =
      video.mode === 'slides' || video.mode === 'generative' || video.mode === 'hybrid'
        ? video.mode
        : DEFAULT_VIDEO_SETTINGS.mode
    video.ttsProvider = video.ttsProvider === 'none' ? 'none' : 'openai'
    video.enabled = video.enabled !== false
    video.outputDir = video.outputDir?.trim() || DEFAULT_VIDEO_SETTINGS.outputDir
    if (video.outputDir === '.codex/video' || video.outputDir.startsWith('.codex/video/')) {
      video.outputDir = DEFAULT_VIDEO_SETTINGS.outputDir
    }
    video.runwayModel = video.runwayModel?.trim() || DEFAULT_VIDEO_SETTINGS.runwayModel
    const presentation = {
      ...DEFAULT_PRESENTATION_SETTINGS,
      ...stored.presentation,
    }
    presentation.enabled = presentation.enabled !== false
    presentation.maxSlides = Math.min(40, Math.max(3, Math.floor(presentation.maxSlides) || 16))
    presentation.includeNotes = presentation.includeNotes !== false
    presentation.outputDir =
      presentation.outputDir?.trim() || DEFAULT_PRESENTATION_SETTINGS.outputDir
    if (
      presentation.outputDir === '.codex/presentation' ||
      presentation.outputDir.startsWith('.codex/presentation/')
    ) {
      presentation.outputDir = DEFAULT_PRESENTATION_SETTINGS.outputDir
    }
    presentation.themeId =
      presentation.themeId === 'paper' ||
      presentation.themeId === 'forest' ||
      presentation.themeId === 'coral' ||
      presentation.themeId === 'midnight'
        ? presentation.themeId
        : DEFAULT_PRESENTATION_SETTINGS.themeId
    const result: AppSettings = {
      ...DEFAULT_SETTINGS,
      ...stored,
      general: {
        ...DEFAULT_SETTINGS.general,
        ...stored.general,
        showBuildOutputs: Boolean(
          stored.general?.showBuildOutputs ?? DEFAULT_SETTINGS.general.showBuildOutputs,
        ),
      },
      models: {
        ...DEFAULT_SETTINGS.models,
        ...stored.models,
        defaultChatModel: migrateModelId(
          stored.models?.defaultChatModel ?? DEFAULT_SETTINGS.models.defaultChatModel,
        ),
        defaultAgentModel: migrateModelId(
          stored.models?.defaultAgentModel ?? DEFAULT_SETTINGS.models.defaultAgentModel,
        ),
      },
      routing: normalizeRoutingSettings(stored.routing ?? DEFAULT_SETTINGS.routing),
      agent,
      cost,
      video,
      presentation,
      mcpServers: Array.isArray(stored.mcpServers) ? stored.mcpServers : [],
      tabCompletion: {
        ...DEFAULT_TAB_COMPLETION,
        ...stored.tabCompletion,
      },
      semanticSearch: {
        ...DEFAULT_SEMANTIC_SEARCH,
        ...stored.semanticSearch,
      },
      keybindings: {
        ...DEFAULT_KEYBINDINGS,
        ...stored.keybindings,
      },
      langfuse: {
        ...DEFAULT_LANGFUSE,
        ...stored.langfuse,
      },
    }

    return applySecretsToSettings(result, this.secretBag)
  }

  private persistSettings(settings: AppSettings): void {
    if (this.secretEncryptionAvailable) {
      const secrets = extractSecretsFromSettings(settings)
      const toSave: SecretBag = {}
      for (const key of [
        'openaiApiKey',
        'anthropicApiKey',
        'xaiApiKey',
        'runwayApiKey',
        'langfuseSecretKey',
      ] as SecretKeyName[]) {
        if (typeof secrets[key] === 'string') {
          toSave[key] = secrets[key]
        }
      }
      this.secretBag = { ...this.secretBag, ...toSave }
      for (const [k, v] of Object.entries(toSave)) {
        if (v === '') delete this.secretBag[k as SecretKeyName]
      }
      void savePlainSecrets(toSave)
        .then(() => {
          store.set('settings', stripSecretsForDisk(settings))
          store.set('migratedSecretsToSafeStorage', true)
        })
        .catch((err: unknown) => {
          console.warn('[settings] failed to persist secrets; keeping plaintext fallback', err)
          store.set('settings', settings)
        })
      // Optimistic disk write without secrets so UI settings don't wait on Keychain.
      store.set('settings', stripSecretsForDisk(settings))
      return
    }
    store.set('settings', settings)
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

    const keepKey = (cur: string | undefined, next: string | undefined): string | undefined => {
      if (next === undefined) return cur
      if (next === '' || isRedactedApiKey(next) || next === API_KEY_REDACTED) return cur
      return next
    }

    const cost = {
      ...DEFAULT_COST_SETTINGS,
      ...current.cost,
      ...partial.cost,
    }
    cost.maxOutputTokens = Math.min(128_000, Math.max(256, Math.floor(cost.maxOutputTokens) || 4096))
    cost.maxOutputTokensAgent = Math.min(
      128_000,
      Math.max(256, Math.floor(cost.maxOutputTokensAgent) || 8192),
    )
    cost.dailyBudgetUsd = Math.max(0, Number(cost.dailyBudgetUsd) || 0)
    cost.logUsage = partial.cost?.logUsage ?? current.cost?.logUsage ?? DEFAULT_COST_SETTINGS.logUsage
    cost.enablePromptCache =
      partial.cost?.enablePromptCache ??
      current.cost?.enablePromptCache ??
      DEFAULT_COST_SETTINGS.enablePromptCache

    const video = {
      ...DEFAULT_VIDEO_SETTINGS,
      ...current.video,
      ...partial.video,
      runwayApiKey: keepKey(current.video?.runwayApiKey, partial.video?.runwayApiKey),
    }
    video.maxShots = Math.min(30, Math.max(2, Math.floor(video.maxShots) || 12))
    video.maxGenerativeShots = Math.min(
      video.maxShots,
      Math.max(0, Math.floor(Number(video.maxGenerativeShots)) || 0),
    )
    video.mode =
      video.mode === 'slides' || video.mode === 'generative' || video.mode === 'hybrid'
        ? video.mode
        : DEFAULT_VIDEO_SETTINGS.mode
    video.ttsProvider = video.ttsProvider === 'none' ? 'none' : 'openai'
    video.enabled = partial.video?.enabled ?? current.video?.enabled ?? DEFAULT_VIDEO_SETTINGS.enabled
    video.outputDir =
      (partial.video?.outputDir ?? current.video?.outputDir)?.trim() ||
      DEFAULT_VIDEO_SETTINGS.outputDir
    video.runwayModel =
      (partial.video?.runwayModel ?? current.video?.runwayModel)?.trim() ||
      DEFAULT_VIDEO_SETTINGS.runwayModel

    const presentation = {
      ...DEFAULT_PRESENTATION_SETTINGS,
      ...current.presentation,
      ...partial.presentation,
    }
    presentation.enabled =
      partial.presentation?.enabled ??
      current.presentation?.enabled ??
      DEFAULT_PRESENTATION_SETTINGS.enabled
    presentation.maxSlides = Math.min(
      40,
      Math.max(3, Math.floor(Number(presentation.maxSlides)) || 16),
    )
    presentation.includeNotes =
      partial.presentation?.includeNotes ??
      current.presentation?.includeNotes ??
      DEFAULT_PRESENTATION_SETTINGS.includeNotes
    presentation.outputDir =
      (partial.presentation?.outputDir ?? current.presentation?.outputDir)?.trim() ||
      DEFAULT_PRESENTATION_SETTINGS.outputDir
    presentation.themeId =
      presentation.themeId === 'paper' ||
      presentation.themeId === 'forest' ||
      presentation.themeId === 'coral' ||
      presentation.themeId === 'midnight'
        ? presentation.themeId
        : DEFAULT_PRESENTATION_SETTINGS.themeId

    // User explicitly saved — do not re-run legacy bump.
    store.set('migratedMaxIterationsV2', true)
    const updated: AppSettings = {
      ...current,
      ...partial,
      general: { ...current.general, ...partial.general },
      models: {
        ...current.models,
        ...partial.models,
        openaiApiKey: keepKey(current.models.openaiApiKey, partial.models?.openaiApiKey),
        anthropicApiKey: keepKey(current.models.anthropicApiKey, partial.models?.anthropicApiKey),
        xaiApiKey: keepKey(current.models.xaiApiKey, partial.models?.xaiApiKey),
      },
      routing: normalizeRoutingSettings({
        ...current.routing,
        ...partial.routing,
        fallbackChain: partial.routing?.fallbackChain ?? current.routing.fallbackChain,
        profiles: partial.routing?.profiles ?? current.routing.profiles,
      }),
      agent,
      cost,
      video,
      presentation,
      mcpServers: partial.mcpServers ?? current.mcpServers ?? [],
      tabCompletion: {
        ...DEFAULT_TAB_COMPLETION,
        ...current.tabCompletion,
        ...partial.tabCompletion,
      },
      semanticSearch: {
        ...DEFAULT_SEMANTIC_SEARCH,
        ...current.semanticSearch,
        ...partial.semanticSearch,
      },
      keybindings: {
        ...DEFAULT_KEYBINDINGS,
        ...current.keybindings,
        ...partial.keybindings,
      },
      langfuse: {
        ...DEFAULT_LANGFUSE,
        ...current.langfuse,
        ...partial.langfuse,
        secretKey: keepKey(current.langfuse?.secretKey, partial.langfuse?.secretKey) ?? '',
      },
    }
    this.persistSettings(updated)
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
  private sqliteReady = false

  private ensureSqlite(): void {
    if (this.sqliteReady) return
    sessionDb.open()
    try {
      const result = sessionDb.migrateFromElectronStore({
        sessions: store.get('sessions') ?? [],
        messages: store.get('messages') ?? {},
      })
      if (result.sessions > 0 || result.messages > 0) {
        console.info(
          `[session-db] migrated ${result.sessions} sessions / ${result.messages} messages from electron-store`,
        )
        // Drop bulky message blob from JSON store after successful migration
        store.set('messages', {})
      }
    } catch (err) {
      console.error('[session-db] migration failed; continuing with SQLite as source of truth', err)
    }
    this.sqliteReady = true
  }

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
    this.ensureSqlite()
    const sessions = sessionDb.listSessions()
    if (!workspaceId) return sessions
    return sessions.filter((s) => s.workspaceId === workspaceId)
  }

  /** Sessions belonging to a folder (by root path and/or workspace id history). */
  listForWorkspace(workspaceId: string, workspaceRoot: string): Session[] {
    this.ensureSqlite()
    this.rememberWorkspaceId(workspaceRoot, workspaceId)
    const knownIds = new Set(store.get('workspaceIdByRoot')[workspaceRoot] ?? [workspaceId])
    knownIds.add(workspaceId)

    const sessions = sessionDb.listSessions()
    const matched = sessions.filter(
      (s) =>
        s.workspaceRoot === workspaceRoot ||
        knownIds.has(s.workspaceId),
    )

    for (const s of matched) {
      if (s.workspaceRoot !== workspaceRoot || s.workspaceId !== workspaceId) {
        sessionDb.upsertSession({
          ...s,
          workspaceRoot,
          workspaceId,
          updatedAt: s.updatedAt,
        })
      }
    }
    return matched.map((s) =>
      s.workspaceRoot === workspaceRoot && s.workspaceId === workspaceId
        ? s
        : { ...s, workspaceRoot, workspaceId },
    )
  }

  getSession(sessionId: string): Session | undefined {
    this.ensureSqlite()
    return sessionDb.getSession(sessionId)
  }

  setMode(sessionId: string, mode: Session['mode']): Session {
    this.ensureSqlite()
    const session = sessionDb.getSession(sessionId)
    if (!session) {
      throw new Error('Session not found')
    }
    const updated = { ...session, mode, updatedAt: new Date().toISOString() }
    sessionDb.upsertSession(updated)
    return updated
  }

  setPersona(sessionId: string, personaName: string | undefined): Session {
    this.ensureSqlite()
    const session = sessionDb.getSession(sessionId)
    if (!session) {
      throw new Error('Session not found')
    }
    const nextName = personaName?.trim() || undefined
    const updated: Session = {
      ...session,
      personaName: nextName,
      updatedAt: new Date().toISOString(),
    }
    if (!nextName) {
      delete updated.personaName
    }
    sessionDb.upsertSession(updated)
    return updated
  }

  create(workspaceId: string, workspaceRoot?: string): Session {
    this.ensureSqlite()
    const now = new Date().toISOString()
    if (workspaceRoot) {
      this.rememberWorkspaceId(workspaceRoot, workspaceId)
    }
    const session: Session = {
      id: randomUUID(),
      workspaceId,
      workspaceRoot,
      title: 'New Chat',
      mode: 'agent',
      modelId: store.get('settings').models.defaultChatModel,
      createdAt: now,
      updatedAt: now,
    }
    sessionDb.upsertSession(session)
    return session
  }

  getMessages(sessionId: string): Message[] {
    this.ensureSqlite()
    return sessionDb.getMessages(sessionId)
  }

  updateTitle(sessionId: string, title: string): void {
    this.ensureSqlite()
    const session = sessionDb.getSession(sessionId)
    if (!session) return
    sessionDb.upsertSession({
      ...session,
      title,
      updatedAt: new Date().toISOString(),
    })
  }

  addMessage(
    sessionId: string,
    message: Omit<Message, 'id' | 'createdAt'>,
  ): Message {
    this.ensureSqlite()
    const sanitized = sanitizeMessageForPersist(message)
    const full: Message = {
      ...sanitized,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    }
    sessionDb.insertMessage(full)
    sessionDb.touchSession(sessionId, full.createdAt)
    return full
  }

  /** Replace all messages for a session (used by Compact). */
  replaceMessages(sessionId: string, next: Message[]): void {
    this.ensureSqlite()
    const trimmed = next.map((m) => sanitizeMessageForPersist(m))
    sessionDb.replaceMessages(sessionId, trimmed)
    sessionDb.touchSession(sessionId, new Date().toISOString())
  }
}

export const settingsService = new SettingsService()
export const sessionService = new SessionService()
