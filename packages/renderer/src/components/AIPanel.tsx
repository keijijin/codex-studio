import { useLayoutEffect, useRef } from 'react'
import { useAppStore } from '@renderer/store/app-store'
import { ChatInput } from './ChatInput'
import { MessageList } from './MessageList'
import { useSettingsDialog } from './SettingsDialog'
import { ApprovalDialog } from './ApprovalDialog'
import type { SessionMode } from '@codex/shared'

export function AIPanel() {
  const workspace = useAppStore((s) => s.workspace)
  const sessions = useAppStore((s) => s.sessions)
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const messages = useAppStore((s) => s.messages)
  const streamingContent = useAppStore((s) => s.streamingContent)
  const streamingToolCalls = useAppStore((s) => s.streamingToolCalls)
  const isStreaming = useAppStore((s) => s.isStreaming)
  const chatError = useAppStore((s) => s.chatError)
  const settings = useAppStore((s) => s.settings)
  const sessionMode = useAppStore((s) => s.sessionMode)
  const createSession = useAppStore((s) => s.createSession)
  const selectSession = useAppStore((s) => s.selectSession)
  const sendMessage = useAppStore((s) => s.sendMessage)
  const cancelChat = useAppStore((s) => s.cancelChat)
  const compactChat = useAppStore((s) => s.compactChat)
  const setSessionMode = useAppStore((s) => s.setSessionMode)
  const pendingApproval = useAppStore((s) => s.pendingApproval)
  const respondApproval = useAppStore((s) => s.respondApproval)
  const toggleAiPanel = useAppStore((s) => s.toggleAiPanel)
  const { openSettings, settingsDialog } = useSettingsDialog()
  const scrollRef = useRef<HTMLDivElement>(null)

  const hasApiKey =
    settings?.models.defaultProvider === 'ollama'
      ? true
      : settings?.models.defaultProvider === 'anthropic'
        ? Boolean(settings?.models.anthropicApiKey)
        : Boolean(settings?.models.openaiApiKey)

  const providerLabel =
    settings?.models.defaultProvider === 'anthropic'
      ? 'Anthropic'
      : settings?.models.defaultProvider === 'ollama'
        ? 'Ollama'
        : 'OpenAI'
  const modelLabel =
    sessionMode === 'agent'
      ? settings?.models.defaultAgentModel ?? settings?.models.defaultChatModel
      : settings?.models.defaultChatModel

  const sortedSessions = [...sessions].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  )

  const handleModeChange = (mode: SessionMode) => {
    if (mode === 'plan') return
    void setSessionMode(mode)
  }

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [activeSessionId, messages, streamingContent, streamingToolCalls, isStreaming, chatError])

  return (
    <aside className="flex w-96 min-w-80 flex-col border-l border-surface-border bg-surface-raised">
      {settingsDialog}
      {pendingApproval && (
        <ApprovalDialog
          request={pendingApproval}
          onRespond={(approved) => void respondApproval(approved)}
        />
      )}

      <div className="flex h-9 items-center justify-between border-b border-surface-border px-3">
        <span className="text-sm font-medium">AI Chat</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            title="設定"
            aria-label="設定"
            style={{
              padding: '2px 8px',
              fontSize: 12,
              color: '#cccccc',
              backgroundColor: 'transparent',
              border: '1px solid #3c3c3c',
              borderRadius: 4,
              cursor: 'pointer',
            }}
            onClick={(e) => {
              e.stopPropagation()
              openSettings()
            }}
          >
            設定
          </button>
          <button
            type="button"
            title="履歴を Compact"
            className="rounded px-2 py-1 text-xs text-text-secondary hover:bg-white/10 disabled:opacity-40"
            disabled={!activeSessionId || isStreaming || messages.length <= 4}
            onClick={() => void compactChat()}
          >
            Compact
          </button>
          <button
            type="button"
            className="rounded px-2 py-1 text-xs text-text-secondary hover:bg-white/10"
            onClick={() => void createSession()}
          >
            + New
          </button>
          <button
            type="button"
            className="rounded px-2 py-1 text-xs text-text-secondary hover:bg-white/10"
            onClick={toggleAiPanel}
          >
            ×
          </button>
        </div>
      </div>

      <div className="border-b border-surface-border px-3 py-2">
        <select
          className="w-full rounded border border-surface-border bg-surface px-2 py-1 text-xs"
          value={activeSessionId ?? ''}
          onChange={(e) => void selectSession(e.target.value)}
        >
          {sortedSessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>

        <div className="mt-2 flex gap-1">
          {(['ask', 'agent'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              disabled={isStreaming}
              onClick={() => handleModeChange(mode)}
              className={`flex-1 rounded px-2 py-1 text-xs capitalize ${
                sessionMode === mode
                  ? 'bg-accent text-white'
                  : 'bg-surface text-text-secondary hover:bg-white/10'
              } disabled:opacity-50`}
            >
              {mode === 'ask' ? 'Ask' : 'Agent'}
            </button>
          ))}
        </div>

        <p className="mt-2 text-xs text-text-muted">
          {sessionMode === 'agent' ? 'Agent' : 'Ask'} · {providerLabel}: {modelLabel ?? 'gpt-4o'}
          {!hasApiKey && (
            <>
              {' · '}
              <button
                type="button"
                className="text-yellow-500 underline hover:text-yellow-400"
                onClick={openSettings}
              >
                API キーを設定
              </button>
            </>
          )}
        </p>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto p-3">
        <MessageList
          messages={messages}
          streamingContent={streamingContent}
          streamingToolCalls={streamingToolCalls}
          isStreaming={isStreaming}
          error={chatError}
        />
        {workspace && messages.length === 0 && !isStreaming && (
          <p className="mt-4 text-xs text-text-muted">
            Workspace: <span className="text-accent">{workspace.name}</span>
          </p>
        )}
      </div>

      <ChatInput
        onSend={(content, attachments) => void sendMessage(content, attachments)}
        onCancel={() => void cancelChat()}
        isStreaming={isStreaming}
      />
    </aside>
  )
}
