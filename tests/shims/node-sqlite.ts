/**
 * Vitest shim for `node:sqlite` (DatabaseSync).
 * Built-in module exists in Node 22.5+ / Electron 35, but CI and local vitest
 * often run on Node 20 where `node:sqlite` is unavailable.
 *
 * Provides a minimal in-memory implementation sufficient for import-time
 * and light session-db usage in unit tests.
 */

type Row = Record<string, unknown>

class StatementSync {
  constructor(
    private readonly db: MemoryDb,
    private readonly sql: string,
  ) {}

  run(...params: unknown[]): { changes: number } {
    this.db.run(this.sql, params)
    return { changes: 1 }
  }

  get(...params: unknown[]): Row | undefined {
    return this.db.all(this.sql, params)[0]
  }

  all(...params: unknown[]): Row[] {
    return this.db.all(this.sql, params)
  }
}

class MemoryDb {
  sessions = new Map<string, Row>()
  messages = new Map<string, Row>()
  meta = new Map<string, string>()
  chunks = new Map<string, Row>()

  exec(sql: string): void {
    const statements = sql
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean)
    for (const stmt of statements) {
      this.run(stmt, [])
    }
  }

  run(sql: string, params: unknown[]): void {
    const normalized = sql.replace(/\s+/g, ' ').trim()
    const upper = normalized.toUpperCase()

    if (upper.startsWith('PRAGMA') || upper.startsWith('BEGIN') || upper.startsWith('COMMIT') || upper.startsWith('ROLLBACK')) {
      return
    }
    if (upper.startsWith('CREATE ')) return

    if (upper.startsWith('DELETE FROM SESSIONS')) {
      const id = String(params[0] ?? '')
      this.sessions.delete(id)
      for (const [mid, m] of [...this.messages]) {
        if (m.session_id === id) this.messages.delete(mid)
      }
      return
    }
    if (upper.startsWith('DELETE FROM MESSAGES')) {
      const sessionId = String(params[0] ?? '')
      for (const [mid, m] of [...this.messages]) {
        if (m.session_id === sessionId) this.messages.delete(mid)
      }
      return
    }
    if (upper.startsWith('DELETE FROM CHUNKS')) {
      const path = String(params[0] ?? '')
      for (const [id, c] of [...this.chunks]) {
        if (c.path === path) this.chunks.delete(id)
      }
      return
    }

    if (upper.includes('INSERT INTO META')) {
      const key = String(params[0])
      const value = String(params[1])
      this.meta.set(key, value)
      return
    }

    if (upper.includes('INSERT INTO SESSIONS') || upper.includes('INSERT OR REPLACE INTO SESSIONS')) {
      const [
        id,
        workspace_id,
        workspace_root,
        title,
        mode,
        model_id,
        persona_name,
        created_at,
        updated_at,
      ] = params
      this.sessions.set(String(id), {
        id,
        workspace_id,
        workspace_root,
        title,
        mode,
        model_id,
        persona_name,
        created_at,
        updated_at,
      })
      return
    }

    if (upper.includes('INSERT INTO MESSAGES') || upper.includes('INSERT OR REPLACE INTO MESSAGES')) {
      const [
        id,
        session_id,
        role,
        content,
        attachments_json,
        tool_calls_json,
        trace_json,
        created_at,
      ] = params
      this.messages.set(String(id), {
        id,
        session_id,
        role,
        content,
        attachments_json,
        tool_calls_json,
        trace_json,
        created_at,
      })
      return
    }

    if (upper.includes('INSERT INTO CHUNKS')) {
      const [id, path, relative_path, start_line, text, embedding, hash] = params
      this.chunks.set(String(id), {
        id,
        path,
        relative_path,
        start_line,
        text,
        embedding,
        hash,
      })
      return
    }

    if (upper.startsWith('UPDATE SESSIONS SET UPDATED_AT')) {
      const [updated_at, id] = params
      const row = this.sessions.get(String(id))
      if (row) row.updated_at = updated_at
      return
    }
  }

  all(sql: string, params: unknown[]): Row[] {
    const upper = sql.replace(/\s+/g, ' ').trim().toUpperCase()

    if (upper.includes('FROM META')) {
      const key = String(params[0] ?? '')
      const value = this.meta.get(key)
      return value == null ? [] : [{ value }]
    }

    if (upper.includes('COUNT(*)') && upper.includes('FROM CHUNKS')) {
      return [{ n: this.chunks.size }]
    }

    if (upper.includes('FROM CHUNKS') && upper.includes('WHERE PATH')) {
      const path = String(params[0] ?? '')
      return [...this.chunks.values()].filter((c) => c.path === path)
    }

    if (upper.includes('FROM CHUNKS')) {
      return [...this.chunks.values()]
    }

    if (upper.includes('FROM SESSIONS WHERE ID')) {
      const id = String(params[0] ?? '')
      const row = this.sessions.get(id)
      return row ? [row] : []
    }

    if (upper.includes('FROM SESSIONS')) {
      return [...this.sessions.values()].sort((a, b) =>
        String(b.updated_at).localeCompare(String(a.updated_at)),
      )
    }

    if (upper.includes('FROM MESSAGES')) {
      const sessionId = String(params[0] ?? '')
      return [...this.messages.values()]
        .filter((m) => m.session_id === sessionId)
        .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    }

    return []
  }
}

const dbs = new Map<string, MemoryDb>()

export class DatabaseSync {
  private readonly mem: MemoryDb

  constructor(path: string) {
    let db = dbs.get(path)
    if (!db) {
      db = new MemoryDb()
      dbs.set(path, db)
    }
    this.mem = db
  }

  exec(sql: string): void {
    this.mem.exec(sql)
  }

  prepare(sql: string): StatementSync {
    return new StatementSync(this.mem, sql)
  }

  close(): void {
    // keep memory for process lifetime (matches open-once usage)
  }
}
