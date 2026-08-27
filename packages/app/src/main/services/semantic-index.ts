import { createHash } from 'crypto'
import { mkdirSync } from 'fs'
import { readFile } from 'fs/promises'
import { join, relative } from 'path'
import { app } from 'electron'
import { DatabaseSync } from 'node:sqlite'
import { indexService } from '@codex/indexer'
import type { SearchResult } from '@codex/shared'
import { pathIgnoreService } from './path-ignore-service'
import { workspaceService } from './workspace'
import { settingsService } from './settings'
import { getApiKeyForProvider } from './llm-config'

const CHUNK_CHARS = 1200
const OVERLAP = 150

let db: DatabaseSync | null = null

function dbPath(): string {
  const dir = join(app.getPath('userData'), 'db')
  mkdirSync(dir, { recursive: true })
  return join(dir, 'semantic.db')
}

function openDb(): DatabaseSync {
  if (db) return db
  db = new DatabaseSync(dbPath())
  db.exec(`
    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      start_line INTEGER NOT NULL,
      text TEXT NOT NULL,
      embedding TEXT NOT NULL,
      hash TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chunks_path ON chunks(path);
  `)
  return db
}

function chunkText(text: string): Array<{ text: string; startLine: number }> {
  const lines = text.split('\n')
  const chunks: Array<{ text: string; startLine: number }> = []
  let buf: string[] = []
  let startLine = 1
  let chars = 0

  const flush = () => {
    if (!buf.length) return
    chunks.push({ text: buf.join('\n'), startLine })
    const keep = Math.max(1, Math.floor(OVERLAP / 40))
    const overlapLines = buf.slice(-keep)
    buf = [...overlapLines]
    startLine = Math.max(1, startLine + buf.length - keep)
    chars = buf.join('\n').length
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (chars + line.length > CHUNK_CHARS && buf.length) {
      flush()
      startLine = i + 1 - buf.length
    }
    if (!buf.length) startLine = i + 1
    buf.push(line)
    chars += line.length + 1
  }
  flush()
  return chunks
}

function cosine(a: number[], b: number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) {
    dot += a[i]! * b[i]!
    na += a[i]! * a[i]!
    nb += b[i]! * b[i]!
  }
  if (!na || !nb) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

async function embedTexts(
  texts: string[],
  apiKey: string,
  model: string,
): Promise<number[][]> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, input: texts }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Embedding API failed: ${res.status} ${body.slice(0, 200)}`)
  }
  const json = (await res.json()) as {
    data: Array<{ embedding: number[]; index: number }>
  }
  return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding)
}

export async function semanticSearch(query: string): Promise<SearchResult[]> {
  const settings = settingsService.get()
  if (!settings.semanticSearch?.enabled) {
    return indexService.search(query)
  }
  const apiKey = getApiKeyForProvider('openai', settings.models)
  if (!apiKey) {
    return indexService.search(query)
  }

  const root = workspaceService.getRoot()
  if (!root) return []

  const database = openDb()
  const model = settings.semanticSearch.embeddingModel || 'text-embedding-3-small'
  const [queryVec] = await embedTexts([query], apiKey, model)
  const rows = database.prepare('SELECT * FROM chunks').all() as Array<{
    path: string
    relative_path: string
    start_line: number
    text: string
    embedding: string
  }>

  if (rows.length === 0) {
    return indexService.search(query)
  }

  const scored = rows
    .map((r) => {
      const emb = JSON.parse(r.embedding) as number[]
      return { row: r, score: cosine(queryVec!, emb) }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, settings.semanticSearch.maxChunks || 24)

  return scored.map((s) => ({
    path: s.row.path,
    relativePath: s.row.relative_path,
    line: s.row.start_line,
    column: 1,
    text: s.row.text.split('\n')[0]?.slice(0, 200) ?? s.row.text.slice(0, 200),
  }))
}

export async function indexFileForSemantic(absolutePath: string): Promise<void> {
  const settings = settingsService.get()
  if (!settings.semanticSearch?.enabled) return
  const apiKey = getApiKeyForProvider('openai', settings.models)
  if (!apiKey) return
  const root = workspaceService.getRoot()
  if (!root) return

  const rel = relative(root, absolutePath).replace(/\\/g, '/')
  if (pathIgnoreService.getRules().ignores(rel)) return

  let content: string
  try {
    content = await readFile(absolutePath, 'utf-8')
  } catch {
    return
  }
  if (content.length > 200_000) content = content.slice(0, 200_000)

  const hash = createHash('sha256').update(content).digest('hex').slice(0, 16)
  const database = openDb()
  const existing = database
    .prepare('SELECT hash FROM chunks WHERE path = ? LIMIT 1')
    .get(absolutePath) as { hash?: string } | undefined
  if (existing?.hash === hash) return

  database.prepare('DELETE FROM chunks WHERE path = ?').run(absolutePath)
  const chunks = chunkText(content)
  if (!chunks.length) return

  const model = settings.semanticSearch.embeddingModel || 'text-embedding-3-small'
  const batchSize = 16
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize)
    const embeddings = await embedTexts(
      batch.map((c) => c.text),
      apiKey,
      model,
    )
    const insert = database.prepare(
      `INSERT INTO chunks(id, path, relative_path, start_line, text, embedding, hash)
       VALUES(?,?,?,?,?,?,?)`,
    )
    for (let j = 0; j < batch.length; j++) {
      const c = batch[j]!
      const id = createHash('sha1')
        .update(`${absolutePath}:${c.startLine}:${j}`)
        .digest('hex')
        .slice(0, 24)
      insert.run(
        id,
        absolutePath,
        rel,
        c.startLine,
        c.text,
        JSON.stringify(embeddings[j] ?? []),
        hash,
      )
    }
  }
}

export function removeSemanticFile(absolutePath: string): void {
  try {
    openDb().prepare('DELETE FROM chunks WHERE path = ?').run(absolutePath)
  } catch {
    /* ignore */
  }
}

export function semanticIndexStats(): { chunks: number; dbPath: string } {
  try {
    const database = openDb()
    const row = database.prepare('SELECT COUNT(*) AS n FROM chunks').get() as {
      n: number
    }
    return { chunks: Number(row?.n ?? 0), dbPath: dbPath() }
  } catch {
    return { chunks: 0, dbPath: dbPath() }
  }
}

/** Best-effort reindex of currently scanned workspace files (capped). */
export async function reindexSemanticWorkspace(limit = 80): Promise<{ indexed: number }> {
  const settings = settingsService.get()
  if (!settings.semanticSearch?.enabled) {
    return { indexed: 0 }
  }
  const files = indexService.getFiles().slice(0, limit)
  let indexed = 0
  for (const f of files) {
    await indexFileForSemantic(f.path)
    indexed++
  }
  return { indexed }
}
