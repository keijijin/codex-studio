import { appendFile, mkdir, readFile } from 'fs/promises'
import { join } from 'path'
import { app } from 'electron'
import { estimateCostUsd, type LlmUsageRecord } from '@codex/shared'

let logDirReady = false

async function ensureLogDir(): Promise<string> {
  const dir = join(app.getPath('userData'), 'logs')
  if (!logDirReady) {
    await mkdir(dir, { recursive: true })
    logDirReady = true
  }
  return dir
}

function usagePath(dir: string): string {
  return join(dir, 'usage.jsonl')
}

export async function appendUsageLog(
  entry: Omit<LlmUsageRecord, 'estimatedCostUsd' | 'ts'> & { ts?: string; estimatedCostUsd?: number },
): Promise<LlmUsageRecord> {
  const record: LlmUsageRecord = {
    ts: entry.ts ?? new Date().toISOString(),
    sessionId: entry.sessionId,
    provider: entry.provider,
    model: entry.model,
    mode: entry.mode,
    latencyMs: entry.latencyMs,
    inputTokens: entry.inputTokens,
    outputTokens: entry.outputTokens,
    cachedInputTokens: entry.cachedInputTokens,
    estimatedCostUsd:
      entry.estimatedCostUsd ??
      estimateCostUsd(entry.model, {
        inputTokens: entry.inputTokens,
        outputTokens: entry.outputTokens,
        cachedInputTokens: entry.cachedInputTokens,
      }),
  }
  try {
    const dir = await ensureLogDir()
    await appendFile(usagePath(dir), `${JSON.stringify(record)}\n`, 'utf-8')
  } catch {
    // usage log must not break main flow
  }
  return record
}

export async function listRecentUsage(limit = 50): Promise<LlmUsageRecord[]> {
  try {
    const dir = await ensureLogDir()
    const raw = await readFile(usagePath(dir), 'utf-8')
    const lines = raw.split('\n').filter(Boolean)
    const records: LlmUsageRecord[] = []
    for (const line of lines.slice(-Math.max(1, limit))) {
      try {
        records.push(JSON.parse(line) as LlmUsageRecord)
      } catch {
        // skip corrupt
      }
    }
    return records.reverse()
  } catch {
    return []
  }
}

export async function getDailyUsageSummary(): Promise<{
  date: string
  estimatedCostUsd: number
  calls: number
}> {
  const date = new Date().toISOString().slice(0, 10)
  const recent = await listRecentUsage(500)
  let estimatedCostUsd = 0
  let calls = 0
  for (const r of recent) {
    if (!r.ts.startsWith(date)) continue
    estimatedCostUsd += r.estimatedCostUsd
    calls++
  }
  return { date, estimatedCostUsd, calls }
}
