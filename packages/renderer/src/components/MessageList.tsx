import type { Message, ToolCallRecord } from '@codex/shared'
import { MarkdownRenderer } from './MarkdownRenderer'
import { ToolCallList } from './ToolCallCard'

interface MessageListProps {
  messages: Message[]
  streamingContent: string
  streamingToolCalls: ToolCallRecord[]
  isStreaming: boolean
  error: string | null
}

export function MessageList({
  messages,
  streamingContent,
  streamingToolCalls,
  isStreaming,
  error,
}: MessageListProps) {
  if (messages.length === 0 && !isStreaming && !error) {
    return (
      <div className="text-sm text-text-secondary">
        <p>AI アシスタントに質問できます。</p>
        <ul className="mt-3 list-inside list-disc space-y-1 text-xs text-text-muted">
          <li>Ask モード: 通常のチャット</li>
          <li>Agent モード: ファイルを読んでコードを調査</li>
          <li>@filename でファイルを添付</li>
        </ul>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {messages.map((m) => (
        <div key={m.id} className={`text-sm ${m.role === 'user' ? 'ml-4' : ''}`}>
          <div
            className={`mb-1 text-xs font-medium ${
              m.role === 'user' ? 'text-accent' : 'text-text-secondary'
            }`}
          >
            {m.role === 'user' ? 'You' : 'Assistant'}
          </div>
          {m.attachments && m.attachments.length > 0 && (
            <div className="mb-1 flex flex-wrap gap-1">
              {m.attachments.map((a) => (
                <span key={a.path} className="rounded bg-surface-overlay px-1.5 py-0.5 text-xs text-text-muted">
                  📎 {a.name}
                </span>
              ))}
            </div>
          )}
          {m.toolCalls && m.toolCalls.length > 0 && (
            <ToolCallList toolCalls={m.toolCalls} />
          )}
          {m.content && (
            <div className="prose prose-invert prose-sm max-w-none">
              <MarkdownRenderer content={m.content} />
            </div>
          )}
        </div>
      ))}

      {isStreaming && (
        <div className="text-sm">
          <div className="mb-1 flex items-center gap-2 text-xs font-medium text-text-secondary">
            <span>Assistant</span>
            <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-normal text-amber-200">
              実行中
            </span>
          </div>
          {streamingToolCalls.length > 0 && <ToolCallList toolCalls={streamingToolCalls} />}
          {streamingContent ? (
            // Plain text while streaming — full Markdown/Mermaid on every token freezes the UI.
            <pre className="m-0 whitespace-pre-wrap break-words font-sans text-sm text-text-primary">
              {streamingContent}
            </pre>
          ) : streamingToolCalls.length === 0 ? (
            <p className="text-xs text-text-muted">
              モデルの応答を待っています…
              <span className="ml-1 inline-block h-3 w-1 animate-pulse bg-accent align-middle" />
            </p>
          ) : null}
          {(streamingContent || streamingToolCalls.length > 0) && (
            <span className="inline-block h-4 w-1 animate-pulse bg-accent" />
          )}
        </div>
      )}

      {error && (
        <div className="rounded border border-red-800 bg-red-950/50 p-2 text-xs text-red-300">
          {error}
        </div>
      )}
    </div>
  )
}
