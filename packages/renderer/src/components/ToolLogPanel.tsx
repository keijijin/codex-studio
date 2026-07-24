import { useMemo, useState } from 'react'
import type { ToolCallRecord } from '@codex/shared'
import { ToolCallCard } from './ToolCallCard'

interface ToolLogPanelProps {
  toolCalls: ToolCallRecord[]
  onClear?: () => void
}

export function ToolLogPanel({ toolCalls, onClear }: ToolLogPanelProps) {
  const [filter, setFilter] = useState('')
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return toolCalls
    return toolCalls.filter(
      (tc) =>
        tc.name.toLowerCase().includes(q) ||
        JSON.stringify(tc.args).toLowerCase().includes(q) ||
        (tc.result ?? '').toLowerCase().includes(q),
    )
  }, [toolCalls, filter])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-surface-border px-2 py-1.5">
        <input
          type="search"
          placeholder="ツールをフィルタ…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="min-w-0 flex-1 rounded border border-surface-border bg-surface px-2 py-1 text-xs"
        />
        <span className="shrink-0 text-[10px] text-text-muted">{filtered.length}</span>
        {onClear && toolCalls.length > 0 && (
          <button
            type="button"
            className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-text-secondary hover:bg-white/10"
            onClick={onClear}
          >
            Clear
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {filtered.length === 0 ? (
          <p className="mt-4 text-center text-xs text-text-muted">
            {toolCalls.length === 0
              ? 'このセッションのツール呼び出しはまだありません'
              : 'フィルタに一致するツールがありません'}
          </p>
        ) : (
          <div className="space-y-1">
            {[...filtered].reverse().map((tc) => (
              <ToolCallCard key={tc.id} toolCall={tc} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
