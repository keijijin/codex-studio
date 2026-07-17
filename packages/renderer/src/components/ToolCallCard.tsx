import { useState } from 'react'
import type { ToolCallRecord } from '@codex/shared'
import { useAppStore } from '@renderer/store/app-store'

interface ToolCallCardProps {
  toolCall: ToolCallRecord
}

function getFilePathFromArgs(args: unknown): string | null {
  if (args && typeof args === 'object' && 'path' in args) {
    const p = (args as { path: unknown }).path
    return typeof p === 'string' ? p : null
  }
  return null
}

function getWritePreview(args: unknown): string | null {
  if (args && typeof args === 'object' && 'content' in args) {
    const c = (args as { content: unknown }).content
    if (typeof c === 'string' && c.length > 0) {
      return c.length > 500 ? `${c.slice(0, 500)}\n...(truncated)` : c
    }
  }
  return null
}

export function ToolCallCard({ toolCall }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false)
  const openChangedFile = useAppStore((s) => s.openChangedFile)
  const workspace = useAppStore((s) => s.workspace)

  const statusIcon =
    toolCall.status === 'running' ? '⏳' : toolCall.status === 'error' ? '✗' : '✓'
  const statusColor =
    toolCall.status === 'running'
      ? 'text-yellow-400'
      : toolCall.status === 'error'
        ? 'text-red-400'
        : 'text-green-400'

  const filePathArg = getFilePathFromArgs(toolCall.args)
  const writePreview = toolCall.name === 'Write' ? getWritePreview(toolCall.args) : null
  const taskLabel =
    toolCall.name === 'Task' && toolCall.args && typeof toolCall.args === 'object'
      ? String((toolCall.args as { description?: string; prompt?: string }).description
        || (toolCall.args as { prompt?: string }).prompt
        || '').slice(0, 80)
      : null
  const searchQuery =
    toolCall.name === 'WebSearch' && toolCall.args && typeof toolCall.args === 'object'
      ? String((toolCall.args as { query?: string }).query ?? '')
      : null
  const teamLabel =
    toolCall.name === 'Team' && toolCall.args && typeof toolCall.args === 'object'
      ? String((toolCall.args as { team?: string }).team ?? '')
      : null
  const canOpen =
    toolCall.status === 'done' &&
    filePathArg &&
    ['Write', 'StrReplace'].includes(toolCall.name) &&
    workspace

  const handleOpenFile = () => {
    if (!filePathArg || !workspace) return
    const root = workspace.rootPaths[0]
    const absolute = filePathArg.startsWith('/') ? filePathArg : `${root}/${filePathArg}`
    void openChangedFile(absolute)
  }

  return (
    <div className="my-1 rounded border border-surface-border bg-surface/80 text-xs">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-white/5"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className={statusColor}>{statusIcon}</span>
        <span className="font-medium text-text-secondary">{toolCall.name}</span>
        {filePathArg && (
          <span className="truncate text-text-muted">{filePathArg}</span>
        )}
        {taskLabel && (
          <span className="truncate text-accent/90">sub · {taskLabel}</span>
        )}
        {searchQuery && (
          <span className="truncate text-text-muted">🔍 {searchQuery}</span>
        )}
        {teamLabel && (
          <span className="truncate text-accent/90">team · {teamLabel}</span>
        )}
        <span className="ml-auto text-text-muted">{expanded ? '▼' : '▶'}</span>
      </button>
      {expanded && (
        <div className="border-t border-surface-border px-2 py-1.5">
          {writePreview && (
            <pre className="mb-2 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-surface p-2 text-[11px] text-text-primary">
              {writePreview}
            </pre>
          )}
          <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all text-[11px] text-text-muted">
            {JSON.stringify(toolCall.args, null, 2)}
          </pre>
          {toolCall.result !== undefined && (
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all text-[11px] text-text-secondary">
              {toolCall.result}
            </pre>
          )}
          {canOpen && (
            <button
              type="button"
              className="mt-2 rounded bg-accent/20 px-2 py-1 text-[11px] text-accent hover:bg-accent/30"
              onClick={handleOpenFile}
            >
              エディタで開く
            </button>
          )}
        </div>
      )}
    </div>
  )
}

interface ToolCallListProps {
  toolCalls: ToolCallRecord[]
}

export function ToolCallList({ toolCalls }: ToolCallListProps) {
  if (toolCalls.length === 0) return null
  return (
    <div className="mb-2 space-y-1">
      {toolCalls.map((tc) => (
        <ToolCallCard key={tc.id} toolCall={tc} />
      ))}
    </div>
  )
}
