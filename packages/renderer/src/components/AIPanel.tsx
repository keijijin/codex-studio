import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useAppStore } from '@renderer/store/app-store'
import { AiRunStatus } from './AiRunStatus'
import { ChatInput } from './ChatInput'
import { MessageList } from './MessageList'
import { ToolLogPanel } from './ToolLogPanel'
import { useSettingsDialog } from './SettingsDialog'
import { isRedactedApiKey, type PersonaFile, type RoutingMode, type SessionMode } from '@codex/shared'

const ROUTING_QUICK: { id: RoutingMode; label: string; title: string }[] = [
  { id: 'fixed', label: 'Fixed', title: '既定モデルのみ（固定）' },
  { id: 'fallback-only', label: 'Fallback', title: '失敗時に次のモデルへ切替' },
  { id: 'auto', label: 'Auto', title: 'タスクに応じてモデルを自動選択' },
]

function hasConfiguredKey(value: string | undefined): boolean {
  return Boolean(value) && (isRedactedApiKey(value) || value!.length > 0)
}

export function AIPanel() {
  const workspace = useAppStore((s) => s.workspace)
  const sessions = useAppStore((s) => s.sessions)
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const messages = useAppStore((s) => s.messages)
  const streamingContent = useAppStore((s) => s.streamingContent)
  const streamingToolCalls = useAppStore((s) => s.streamingToolCalls)
  const sessionToolLog = useAppStore((s) => s.sessionToolLog)
  const lastUsage = useAppStore((s) => s.lastUsage)
  const lastTrace = useAppStore((s) => s.lastTrace)
  const activePersona = useAppStore((s) => s.activePersona)
  const isStreaming = useAppStore((s) => s.isStreaming)
  const chatError = useAppStore((s) => s.chatError)
  const routingInfo = useAppStore((s) => s.routingInfo)
  const settings = useAppStore((s) => s.settings)
  const sessionMode = useAppStore((s) => s.sessionMode)
  const createSession = useAppStore((s) => s.createSession)
  const selectSession = useAppStore((s) => s.selectSession)
  const sendMessage = useAppStore((s) => s.sendMessage)
  const cancelChat = useAppStore((s) => s.cancelChat)
  const compactChat = useAppStore((s) => s.compactChat)
  const setSessionMode = useAppStore((s) => s.setSessionMode)
  const setSessionPersona = useAppStore((s) => s.setSessionPersona)
  const setRoutingMode = useAppStore((s) => s.setRoutingMode)
  const teamStage = useAppStore((s) => s.teamStage)
  const toggleAiPanel = useAppStore((s) => s.toggleAiPanel)
  const clearSessionToolLog = useAppStore((s) => s.clearSessionToolLog)
  const { openSettings, settingsDialog } = useSettingsDialog()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [panelTab, setPanelTab] = useState<'chat' | 'tools'>('chat')
  const [personas, setPersonas] = useState<PersonaFile[]>([])

  useEffect(() => {
    if (!workspace) {
      setPersonas([])
      return
    }
    void window.codex.personas.list()
      .then(setPersonas)
      .catch(() => setPersonas([]))
  }, [workspace])

  const hasApiKey =
    settings?.models.defaultProvider === 'ollama' ||
    settings?.models.defaultProvider === 'llamacpp'
      ? true
      : settings?.models.defaultProvider === 'anthropic'
        ? hasConfiguredKey(settings?.models.anthropicApiKey)
        : settings?.models.defaultProvider === 'xai'
          ? hasConfiguredKey(settings?.models.xaiApiKey)
          : hasConfiguredKey(settings?.models.openaiApiKey)

  const routingMode = settings?.routing?.mode ?? 'fixed'
  const configuredModel =
    sessionMode === 'agent' || sessionMode === 'plan'
      ? settings?.models.defaultAgentModel ?? settings?.models.defaultChatModel
      : settings?.models.defaultChatModel
  // Fixed+idle: always show settings. Overlay only while streaming, or in Auto/FB modes.
  const useRoutingOverlay =
    Boolean(routingInfo) && (isStreaming || routingMode !== 'fixed')
  const displayProvider = useRoutingOverlay
    ? routingInfo!.provider
    : settings?.models.defaultProvider
  const providerLabel =
    displayProvider === 'anthropic'
      ? 'Anthropic'
      : displayProvider === 'ollama'
        ? 'Ollama'
        : displayProvider === 'llamacpp'
          ? 'llama.cpp'
          : displayProvider === 'xai'
            ? 'xAI'
            : 'OpenAI'
  const modelLabel = useRoutingOverlay ? routingInfo!.model : configuredModel
  const routingHint =
    useRoutingOverlay
      ? routingInfo?.reason ?? null
      : routingMode === 'fixed'
        ? null
        : routingMode === 'auto'
          ? 'Auto ルーティング'
          : 'フォールバック有効'

  const sortedSessions = [...sessions].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  )

  const handleModeChange = (mode: SessionMode) => {
    void setSessionMode(mode)
  }

  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant' && m.content.trim())

  const promotePlanToAgent = () => {
    if (!lastAssistant || isStreaming) return
    void (async () => {
      await setSessionMode('agent')
      await sendMessage(
        `以下のプランを承認しました。実装を進めてください。\n\n${lastAssistant.content}`,
        [],
      )
    })()
  }

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el || panelTab !== 'chat') return
    el.scrollTop = el.scrollHeight
  }, [activeSessionId, messages, streamingContent, streamingToolCalls, isStreaming, chatError, panelTab])

  return (
    <aside className="flex w-96 min-w-80 flex-col border-l border-surface-border bg-surface-raised">
      {settingsDialog}

      <div className="flex h-9 items-center justify-between border-b border-surface-border px-3">
        <span className="flex items-center gap-2 text-sm font-medium">
          AI Chat
          {isStreaming && (
            <span className="rounded bg-amber-500/25 px-1.5 py-0.5 text-[10px] font-normal text-amber-200">
              実行中
            </span>
          )}
        </span>
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
              cursor: 'pointer' }}
            onClick={(e) => {
              e.stopPropagation()
              openSettings()
            }}
          >
            設定
          </button>
          <button
            type="button"
            title="履歴を圧縮（中間ターン要約・巨大 tool result を削減）"
            className="rounded px-2 py-1 text-xs text-text-secondary hover:bg-white/10 disabled:opacity-40"
            disabled={!activeSessionId || isStreaming || messages.length <= 4}
            onClick={() => void compactChat()}
          >
            履歴を圧縮
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
          {(['ask', 'plan', 'agent'] as const).map((mode) => (
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
              {mode === 'ask' ? 'Ask' : mode === 'plan' ? 'Plan' : 'Agent'}
            </button>
          ))}
        </div>

        <div className="mt-2 flex gap-1" role="group" aria-label="モデルルーティング">
          {ROUTING_QUICK.map((opt) => (
            <button
              key={opt.id}
              type="button"
              title={opt.title}
              disabled={isStreaming}
              onClick={() => void setRoutingMode(opt.id)}
              className={`flex-1 rounded px-1 py-1 text-[11px] ${
                routingMode === opt.id
                  ? 'bg-accent/90 text-white'
                  : 'bg-surface text-text-secondary hover:bg-white/10'
              } disabled:opacity-50`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {teamStage && (
          <p className="mt-2 truncate text-[11px] text-accent" title={teamStage.detail}>
            Team {teamStage.teamId}: {teamStage.stage}
            {teamStage.detail ? ` · ${teamStage.detail}` : ''}
          </p>
        )}

        <label className="mt-2 block text-[10px] text-text-muted" htmlFor="session-persona">
          Persona（セッション固定）
        </label>
        <select
          id="session-persona"
          className="mt-0.5 w-full rounded border border-surface-border bg-surface px-2 py-1 text-xs"
          disabled={isStreaming}
          value={activePersona?.personaName ?? ''}
          onChange={(e) => {
            const v = e.target.value
            void setSessionPersona(v || null)
          }}
        >
          <option value="">なし（既定に従う）</option>
          {personas.map((p) => (
            <option key={p.id} value={p.name} title={p.description}>
              {p.name}
              {p.description ? ` — ${p.description.slice(0, 40)}` : ''}
            </option>
          ))}
        </select>

        <div className="mt-2 flex gap-1" role="tablist" aria-label="パネル">
          <button
            type="button"
            role="tab"
            aria-selected={panelTab === 'chat'}
            className={`flex-1 rounded px-2 py-1 text-xs ${
              panelTab === 'chat' ? 'bg-accent text-white' : 'bg-surface text-text-secondary hover:bg-white/10'
            }`}
            onClick={() => setPanelTab('chat')}
          >
            Chat
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={panelTab === 'tools'}
            className={`flex-1 rounded px-2 py-1 text-xs ${
              panelTab === 'tools' ? 'bg-accent text-white' : 'bg-surface text-text-secondary hover:bg-white/10'
            }`}
            onClick={() => setPanelTab('tools')}
          >
            Tools{sessionToolLog.length > 0 ? ` (${sessionToolLog.length})` : ''}
          </button>
        </div>

        <p className="mt-2 text-xs text-text-muted">
          {sessionMode === 'agent' ? 'Agent' : sessionMode === 'plan' ? 'Plan' : 'Ask'} ·{' '}
          {providerLabel}: {modelLabel ?? 'gpt-4o'}
          {(activePersona?.personaName || lastTrace?.personaName) && (
            <>
              {' · '}
              Persona: {activePersona?.personaName ?? lastTrace?.personaName}
            </>
          )}
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
        {((isStreaming && routingInfo?.reason) ||
          (!isStreaming && routingMode !== 'fixed' && routingHint)) && (
          <p
            className="mt-1 truncate text-[11px] text-text-secondary"
            title={isStreaming ? routingInfo?.reason ?? undefined : routingHint ?? undefined}
          >
            {isStreaming ? routingInfo?.reason : routingHint}
          </p>
        )}
        {lastUsage && (
          <p className="mt-1 truncate text-[10px] text-text-muted" title="推定課金（参考値）">
            直近: in {lastUsage.inputTokens}
            {lastUsage.cachedInputTokens > 0 ? ` (cache ${lastUsage.cachedInputTokens})` : ''}
            {' / '}out {lastUsage.outputTokens} · {lastUsage.latencyMs}ms · $
            {lastUsage.estimatedCostUsd.toFixed(4)}
            {typeof lastTrace?.toolCount === 'number' ? ` · tools ${lastTrace.toolCount}` : ''}
          </p>
        )}
      </div>

      <AiRunStatus />

      {panelTab === 'chat' ? (
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
          {sessionMode === 'plan' && lastAssistant && !isStreaming && (
            <div className="mt-3 rounded border border-accent/40 bg-accent/10 p-2">
              <p className="mb-2 text-[11px] text-text-secondary">
                Plan の手順を確認したら Agent で実行できます。
              </p>
              <button
                type="button"
                className="w-full rounded bg-accent px-2 py-1.5 text-xs text-white hover:bg-accent-hover"
                onClick={promotePlanToAgent}
              >
                このプランを Agent で実行
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="min-h-0 flex-1">
          <ToolLogPanel
            toolCalls={sessionToolLog}
            onClear={clearSessionToolLog}
            turnMeta={{
              personaName: activePersona?.personaName ?? lastTrace?.personaName,
              model: routingInfo?.model ?? lastTrace?.model ?? modelLabel,
              provider: routingInfo?.provider ?? lastTrace?.provider,
              toolCount: lastTrace?.toolCount ?? sessionToolLog.length,
              estimatedCostUsd: lastUsage?.estimatedCostUsd }}
          />
        </div>
      )}

      <ChatInput
        onSend={(content, attachments) => {
          setPanelTab('chat')
          void sendMessage(content, attachments)
        }}
        onCancel={() => void cancelChat()}
        isStreaming={isStreaming}
      />
    </aside>
  )
}
