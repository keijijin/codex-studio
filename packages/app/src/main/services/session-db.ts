import { mkdirSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { DatabaseSync } from 'node:sqlite'
import type { Message, Session } from '@codex/shared'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  workspace_root TEXT,
  title TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'agent',
  model_id TEXT NOT NULL,
  persona_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  attachments_json TEXT,
  tool_calls_json TEXT,
  trace_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_workspace ON sessions(workspace_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_sessions_root ON sessions(workspace_root, updated_at);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`

function dbPath(): string {
  const dir = join(app.getPath('userData'), 'db')
  mkdirSync(dir, { recursive: true })
  return join(dir, 'sessions.db')
}

function rowToSession(row: Record<string, unknown>): Session {
  const session: Session = {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    title: String(row.title),
    mode: (row.mode as Session['mode']) || 'agent',
    modelId: String(row.model_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
  if (row.workspace_root) session.workspaceRoot = String(row.workspace_root)
  if (row.persona_name) session.personaName = String(row.persona_name)
  return session
}

function rowToMessage(row: Record<string, unknown>): Message {
  const msg: Message = {
    id: String(row.id),
    sessionId: String(row.session_id),
    role: row.role as Message['role'],
    content: String(row.content ?? ''),
    createdAt: String(row.created_at),
  }
  if (row.attachments_json) {
    try {
      msg.attachments = JSON.parse(String(row.attachments_json)) as Message['attachments']
    } catch {
      // ignore
    }
  }
  if (row.tool_calls_json) {
    try {
      msg.toolCalls = JSON.parse(String(row.tool_calls_json)) as Message['toolCalls']
    } catch {
      // ignore
    }
  }
  if (row.trace_json) {
    try {
      msg.trace = JSON.parse(String(row.trace_json)) as Message['trace']
    } catch {
      // ignore
    }
  }
  return msg
}

export class SessionDatabase {
  private db: DatabaseSync | null = null
  private migratedFromStore = false

  open(): void {
    if (this.db) return
    this.db = new DatabaseSync(dbPath())
    this.db.exec('PRAGMA journal_mode = WAL;')
    this.db.exec('PRAGMA foreign_keys = ON;')
    this.db.exec(SCHEMA)
  }

  close(): void {
    this.db?.close()
    this.db = null
  }

  private requireDb(): DatabaseSync {
    this.open()
    return this.db!
  }

  getMeta(key: string): string | null {
    const row = this.requireDb()
      .prepare('SELECT value FROM meta WHERE key = ?')
      .get(key) as { value?: string } | undefined
    return row?.value ?? null
  }

  setMeta(key: string, value: string): void {
    this.requireDb()
      .prepare(
        `INSERT INTO meta(key, value) VALUES(?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(key, value)
  }

  /** One-shot migration from electron-store payloads. */
  migrateFromElectronStore(payload: {
    sessions: Session[]
    messages: Record<string, Message[]>
  }): { sessions: number; messages: number } {
    if (this.getMeta('migrated_from_electron_store') === '1') {
      this.migratedFromStore = true
      return { sessions: 0, messages: 0 }
    }

    const db = this.requireDb()
    db.exec('PRAGMA foreign_keys = OFF')
    db.exec('BEGIN')
    try {
      let sessionCount = 0
      let messageCount = 0
      for (const s of payload.sessions) {
        this.upsertSession(s)
        sessionCount += 1
        const msgs = payload.messages[s.id] ?? []
        for (const m of msgs) {
          this.insertMessage(m)
          messageCount += 1
        }
      }
      // Orphan message buckets (create stub session rows)
      for (const [sessionId, msgs] of Object.entries(payload.messages)) {
        if (payload.sessions.some((s) => s.id === sessionId)) continue
        if (msgs.length === 0) continue
        const now = new Date().toISOString()
        this.upsertSession({
          id: sessionId,
          workspaceId: 'orphan',
          title: 'Recovered Chat',
          mode: 'agent',
          modelId: 'unknown',
          createdAt: msgs[0]?.createdAt ?? now,
          updatedAt: msgs[msgs.length - 1]?.createdAt ?? now,
        })
        sessionCount += 1
        for (const m of msgs) {
          this.insertMessage(m)
          messageCount += 1
        }
      }
      this.setMeta('migrated_from_electron_store', '1')
      db.exec('COMMIT')
      this.migratedFromStore = true
      return { sessions: sessionCount, messages: messageCount }
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    } finally {
      db.exec('PRAGMA foreign_keys = ON')
    }
  }

  listSessions(): Session[] {
    const rows = this.requireDb()
      .prepare('SELECT * FROM sessions ORDER BY updated_at DESC')
      .all() as Record<string, unknown>[]
    return rows.map(rowToSession)
  }

  getSession(sessionId: string): Session | undefined {
    const row = this.requireDb()
      .prepare('SELECT * FROM sessions WHERE id = ?')
      .get(sessionId) as Record<string, unknown> | undefined
    return row ? rowToSession(row) : undefined
  }

  upsertSession(session: Session): void {
    this.requireDb()
      .prepare(
        `INSERT INTO sessions(
           id, workspace_id, workspace_root, title, mode, model_id, persona_name, created_at, updated_at
         ) VALUES(?,?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET
           workspace_id = excluded.workspace_id,
           workspace_root = excluded.workspace_root,
           title = excluded.title,
           mode = excluded.mode,
           model_id = excluded.model_id,
           persona_name = excluded.persona_name,
           updated_at = excluded.updated_at`,
      )
      .run(
        session.id,
        session.workspaceId,
        session.workspaceRoot ?? null,
        session.title,
        session.mode,
        session.modelId,
        session.personaName ?? null,
        session.createdAt,
        session.updatedAt,
      )
  }

  deleteSession(sessionId: string): void {
    this.requireDb().prepare('DELETE FROM sessions WHERE id = ?').run(sessionId)
  }

  getMessages(sessionId: string): Message[] {
    const rows = this.requireDb()
      .prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC, rowid ASC')
      .all(sessionId) as Record<string, unknown>[]
    return rows.map(rowToMessage)
  }

  insertMessage(message: Message): void {
    this.requireDb()
      .prepare(
        `INSERT OR REPLACE INTO messages(
           id, session_id, role, content, attachments_json, tool_calls_json, trace_json, created_at
         ) VALUES(?,?,?,?,?,?,?,?)`,
      )
      .run(
        message.id,
        message.sessionId,
        message.role,
        message.content,
        message.attachments ? JSON.stringify(message.attachments) : null,
        message.toolCalls ? JSON.stringify(message.toolCalls) : null,
        message.trace ? JSON.stringify(message.trace) : null,
        message.createdAt,
      )
  }

  replaceMessages(sessionId: string, next: Message[]): void {
    const db = this.requireDb()
    db.exec('BEGIN')
    try {
      db.prepare('DELETE FROM messages WHERE session_id = ?').run(sessionId)
      for (const m of next) {
        this.insertMessage(m)
      }
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
  }

  touchSession(sessionId: string, updatedAt: string): void {
    this.requireDb()
      .prepare('UPDATE sessions SET updated_at = ? WHERE id = ?')
      .run(updatedAt, sessionId)
  }
}

export const sessionDb = new SessionDatabase()
