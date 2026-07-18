import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  IPC_CHANNELS,
  DEFAULT_OLLAMA_BASE_URL,
  DEFAULT_AGENT_PERMISSIONS,
  DEFAULT_FALLBACK_CHAIN,
  type AgentPermissions,
  type LLMProviderId,
  type ModelCandidate,
  type ModelInfo,
  type PermissionAction,
  type RoutingMode,
} from '@codex/shared'
import { useAppStore } from '@renderer/store/app-store'
import { hasCodexApi } from './ErrorBoundary'
import { RulesSettings } from './RulesSettings'

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 99999,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: 'rgba(0, 0, 0, 0.75)',
  padding: 16,
}

const panelStyle: CSSProperties = {
  width: '100%',
  maxWidth: 560,
  maxHeight: '90vh',
  overflow: 'auto',
  backgroundColor: '#252526',
  border: '1px solid #3c3c3c',
  borderRadius: 8,
  padding: 24,
  color: '#cccccc',
  boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
}

const inputStyle: CSSProperties = {
  width: '100%',
  marginTop: 6,
  padding: '8px 12px',
  fontSize: 14,
  color: '#cccccc',
  backgroundColor: '#1e1e1e',
  border: '1px solid #3c3c3c',
  borderRadius: 4,
  boxSizing: 'border-box',
}

const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: 12,
  color: '#858585',
  marginTop: 16,
}

const btnPrimary: CSSProperties = {
  padding: '8px 16px',
  fontSize: 14,
  color: '#fff',
  backgroundColor: '#0078d4',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
}

const selectStyle: CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
}

const btnSecondary: CSSProperties = {
  padding: '8px 16px',
  fontSize: 14,
  color: '#858585',
  backgroundColor: 'transparent',
  border: '1px solid #3c3c3c',
  borderRadius: 4,
  cursor: 'pointer',
}

interface FetchModelsOptions {
  preferredModel?: string
  resetModel?: boolean
}

interface SettingsFormProps {
  onSaved?: () => void
  onCancel?: () => void
  compact?: boolean
}

export function SettingsForm({ onSaved, onCancel, compact }: SettingsFormProps) {
  const [tab, setTab] = useState<'models' | 'rules'>('models')
  const [openaiKey, setOpenaiKey] = useState('')
  const [anthropicKey, setAnthropicKey] = useState('')
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState(DEFAULT_OLLAMA_BASE_URL)
  const [yoloMode, setYoloMode] = useState(false)
  const [maxIterations, setMaxIterations] = useState(100)
  const [permissions, setPermissions] = useState<AgentPermissions>({ ...DEFAULT_AGENT_PERMISSIONS })
  const [compactTokenThreshold, setCompactTokenThreshold] = useState(80_000)
  const [autoMemory, setAutoMemory] = useState(false)
  const [maxSubagents, setMaxSubagents] = useState(3)
  const [provider, setProvider] = useState<LLMProviderId>('openai')
  const [model, setModel] = useState('gpt-4o')
  const [routingMode, setRoutingMode] = useState<RoutingMode>('fixed')
  const [fallbackChain, setFallbackChain] = useState<ModelCandidate[]>([...DEFAULT_FALLBACK_CHAIN])
  const [maxAttempts, setMaxAttempts] = useState(3)
  const [models, setModels] = useState<ModelInfo[]>([])
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingModels, setLoadingModels] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const modelRef = useRef(model)
  modelRef.current = model

  const fetchModels = useCallback(async (
    p: LLMProviderId,
    oKey: string,
    aKey: string,
    ollamaUrl: string,
    options?: FetchModelsOptions,
  ) => {
    if (!hasCodexApi()) return
    setLoadingModels(true)
    setError(null)
    try {
      const current = await window.codex.invoke(IPC_CHANNELS.SETTINGS_GET)
      await window.codex.invoke(IPC_CHANNELS.SETTINGS_SET, {
        models: {
          ...current.models,
          openaiApiKey: oKey || current.models.openaiApiKey,
          anthropicApiKey: aKey || current.models.anthropicApiKey,
          ollamaBaseUrl: ollamaUrl || current.models.ollamaBaseUrl,
        },
      })
      const list = await window.codex.invoke(IPC_CHANNELS.MODELS_LIST, p)
      setModels(list)
      if (list.length === 0) return

      const preferred = options?.preferredModel ?? modelRef.current
      if (options?.resetModel || !list.some((m) => m.id === preferred)) {
        setModel(list[0].id)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'モデル一覧の取得に失敗しました')
    } finally {
      setLoadingModels(false)
    }
  }, [])

  useEffect(() => {
    if (!hasCodexApi()) {
      setError('IPC が利用できません。アプリを再起動してください。')
      setLoading(false)
      return
    }
    setLoading(true)
    void window.codex
      .invoke(IPC_CHANNELS.SETTINGS_GET)
      .then(async (settings) => {
        const p = settings.models.defaultProvider ?? 'openai'
        const oKey = settings.models.openaiApiKey ?? ''
        const aKey = settings.models.anthropicApiKey ?? ''
        const savedModel = settings.models.defaultChatModel
        const ollamaUrl = settings.models.ollamaBaseUrl ?? DEFAULT_OLLAMA_BASE_URL
        setProvider(p)
        setModel(savedModel)
        setRoutingMode(settings.routing?.mode ?? 'fixed')
        setFallbackChain(
          settings.routing?.fallbackChain?.length
            ? settings.routing.fallbackChain.map((c) => ({ ...c }))
            : [...DEFAULT_FALLBACK_CHAIN],
        )
        setMaxAttempts(settings.routing?.maxAttempts ?? 3)
        setOpenaiKey(oKey)
        setAnthropicKey(aKey)
        setOllamaBaseUrl(ollamaUrl)
        setYoloMode(settings.agent.yoloMode)
        setMaxIterations(settings.agent.maxIterations)
        setPermissions({
          ...DEFAULT_AGENT_PERMISSIONS,
          ...settings.agent.permissions,
        })
        setCompactTokenThreshold(settings.agent.compactTokenThreshold ?? 80_000)
        setAutoMemory(Boolean(settings.agent.autoMemory))
        setMaxSubagents(settings.agent.maxSubagents ?? 3)
        await fetchModels(p, oKey, aKey, ollamaUrl, { preferredModel: savedModel })
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : '設定の読み込みに失敗しました')
      })
      .finally(() => setLoading(false))
  }, [fetchModels])

  const handleProviderChange = (p: LLMProviderId) => {
    setProvider(p)
    void fetchModels(p, openaiKey, anthropicKey, ollamaBaseUrl, { resetModel: true })
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!hasCodexApi()) return
    setError(null)
    try {
      const current = await window.codex.invoke(IPC_CHANNELS.SETTINGS_GET)
      await window.codex.invoke(IPC_CHANNELS.SETTINGS_SET, {
        models: {
          defaultProvider: provider,
          openaiApiKey: openaiKey,
          anthropicApiKey: anthropicKey,
          ollamaBaseUrl,
          defaultChatModel: model,
          defaultAgentModel: model,
        },
        routing: {
          ...current.routing,
          mode: routingMode,
          fallbackChain: fallbackChain.filter((c) => c.model.trim().length > 0),
          maxAttempts: Math.min(5, Math.max(1, Math.floor(maxAttempts) || 3)),
        },
        agent: {
          ...current.agent,
          yoloMode,
          maxIterations: Math.min(500, Math.max(5, Math.floor(maxIterations) || 100)),
          permissions,
          compactTokenThreshold: Math.max(0, Math.floor(compactTokenThreshold) || 0),
          autoMemory,
          maxSubagents: Math.min(8, Math.max(1, Math.floor(maxSubagents) || 3)),
        },
      })
      setSaved(true)
      onSaved?.()
      setTimeout(() => setSaved(false), 2000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '保存に失敗しました')
    }
  }

  const wrapperStyle: CSSProperties = compact
    ? { ...panelStyle, maxWidth: 560, margin: '0 auto', textAlign: 'left' }
    : panelStyle

  const tabBtn = (id: 'models' | 'rules', _label: string): CSSProperties => ({
    flex: 1,
    padding: '8px 12px',
    fontSize: 13,
    cursor: 'pointer',
    border: '1px solid #3c3c3c',
    borderRadius: 4,
    backgroundColor: tab === id ? '#0078d4' : 'transparent',
    color: tab === id ? '#fff' : '#858585',
  })

  return (
    <form style={wrapperStyle} onSubmit={(e) => void handleSubmit(e)}>
      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#ffffff' }}>設定</h2>

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button type="button" style={tabBtn('models', 'モデル')} onClick={() => setTab('models')}>
          モデル
        </button>
        <button type="button" style={tabBtn('rules', 'Rules')} onClick={() => setTab('rules')}>
          Rules
        </button>
      </div>

      {tab === 'rules' ? (
        <div style={{ marginTop: 16 }}>
          <RulesSettings />
          <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
            {onCancel && (
              <button type="button" style={btnSecondary} onClick={onCancel}>閉じる</button>
            )}
          </div>
        </div>
      ) : (
        <>
          <p style={{ margin: '12px 0 0', fontSize: 13, color: '#858585' }}>
            API キーとチャットモデルを設定します
          </p>

          {error && (
            <p style={{ marginTop: 12, padding: 8, fontSize: 12, color: '#fca5a5', backgroundColor: '#450a0a', border: '1px solid #991b1b', borderRadius: 4 }}>
              {error}
            </p>
          )}

          {loading ? (
            <p style={{ marginTop: 16, fontSize: 13, color: '#858585' }}>読み込み中...</p>
          ) : (
            <>
              <label style={labelStyle} htmlFor="openai-api-key">OpenAI API Key</label>
              <input
                id="openai-api-key"
                type="password"
                style={inputStyle}
                placeholder="sk-..."
                value={openaiKey}
                onChange={(e) => setOpenaiKey(e.target.value)}
                autoComplete="off"
              />

              <label style={labelStyle} htmlFor="anthropic-api-key">Anthropic API Key</label>
              <input
                id="anthropic-api-key"
                type="password"
                style={inputStyle}
                placeholder="sk-ant-..."
                value={anthropicKey}
                onChange={(e) => setAnthropicKey(e.target.value)}
                autoComplete="off"
              />

              <label style={labelStyle} htmlFor="provider">プロバイダ</label>
              <select
                id="provider"
                style={selectStyle}
                value={provider}
                onChange={(e) => handleProviderChange(e.target.value as LLMProviderId)}
              >
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="ollama">Ollama (Local)</option>
              </select>

              {provider === 'ollama' && (
                <>
                  <label style={labelStyle} htmlFor="ollama-base-url">Ollama Base URL</label>
                  <input
                    id="ollama-base-url"
                    type="text"
                    style={inputStyle}
                    placeholder="http://localhost:11434"
                    value={ollamaBaseUrl}
                    onChange={(e) => setOllamaBaseUrl(e.target.value)}
                  />
                </>
              )}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
                <label style={{ ...labelStyle, marginTop: 0 }} htmlFor="chat-model">Chat Model</label>
                <button
                  type="button"
                  style={{ ...btnSecondary, padding: '4px 10px', fontSize: 12 }}
                  disabled={loadingModels}
                  onClick={() => void fetchModels(provider, openaiKey, anthropicKey, ollamaBaseUrl)}
                >
                  {loadingModels ? '取得中...' : 'モデル一覧を更新'}
                </button>
              </div>
              <select
                id="chat-model"
                style={selectStyle}
                value={model}
                disabled={loadingModels}
                onChange={(e) => setModel(e.target.value)}
              >
                {models.length === 0 ? (
                  <option value={model}>{model}</option>
                ) : (
                  models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name !== m.id ? `${m.name} (${m.id})` : m.id}
                    </option>
                  ))
                )}
              </select>
              <p style={{ margin: '6px 0 0', fontSize: 11, color: '#6e6e6e' }}>
                {models.length} 件のモデル · 環境変数 OPENAI_API_KEY / ANTHROPIC_API_KEY / OLLAMA_BASE_URL も利用可
              </p>

              <label style={labelStyle} htmlFor="routing-mode">モデルルーティング</label>
              <select
                id="routing-mode"
                style={selectStyle}
                value={routingMode}
                onChange={(e) => setRoutingMode(e.target.value as RoutingMode)}
              >
                <option value="fixed">固定（既定モデルのみ）</option>
                <option value="fallback-only">フォールバック（失敗時に切替）</option>
                <option value="auto">Auto（タスクに応じて選択）</option>
              </select>
              <p style={{ margin: '6px 0 0', fontSize: 11, color: '#6e6e6e' }}>
                Auto / フォールバック時は API キーがあるプロバイダへ自動切替します（ツール開始後は切替しません）
              </p>

              {routingMode !== 'fixed' && (
                <div
                  style={{
                    marginTop: 12,
                    padding: 12,
                    border: '1px solid #3c3c3c',
                    borderRadius: 6,
                    backgroundColor: '#1e1e1e',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: 12, color: '#858585' }}>フォールバックチェーン</span>
                    <button
                      type="button"
                      style={{ ...btnSecondary, padding: '2px 8px', fontSize: 11 }}
                      onClick={() => setFallbackChain([...DEFAULT_FALLBACK_CHAIN])}
                    >
                      既定に戻す
                    </button>
                  </div>
                  <p style={{ margin: '6px 0 10px', fontSize: 11, color: '#6e6e6e' }}>
                    上から順に試行します。キー未設定のプロバイダはスキップされます。
                  </p>

                  {fallbackChain.map((row, index) => (
                    <div
                      key={`fb-${index}`}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '110px 1fr auto',
                        gap: 6,
                        marginBottom: 8,
                        alignItems: 'center',
                      }}
                    >
                      <select
                        aria-label={`フォールバック ${index + 1} プロバイダ`}
                        style={{ ...selectStyle, marginTop: 0, fontSize: 12, padding: '6px 8px' }}
                        value={row.provider}
                        onChange={(e) => {
                          const provider = e.target.value as LLMProviderId
                          setFallbackChain((prev) =>
                            prev.map((c, i) => (i === index ? { ...c, provider } : c)),
                          )
                        }}
                      >
                        <option value="openai">OpenAI</option>
                        <option value="anthropic">Anthropic</option>
                        <option value="ollama">Ollama</option>
                      </select>
                      <input
                        aria-label={`フォールバック ${index + 1} モデル`}
                        type="text"
                        style={{ ...inputStyle, marginTop: 0, fontSize: 12, padding: '6px 8px' }}
                        placeholder="model id"
                        value={row.model}
                        onChange={(e) => {
                          const modelId = e.target.value
                          setFallbackChain((prev) =>
                            prev.map((c, i) => (i === index ? { ...c, model: modelId } : c)),
                          )
                        }}
                      />
                      <div style={{ display: 'flex', gap: 2 }}>
                        <button
                          type="button"
                          title="上へ"
                          disabled={index === 0}
                          style={{
                            ...btnSecondary,
                            padding: '4px 6px',
                            fontSize: 11,
                            opacity: index === 0 ? 0.4 : 1,
                          }}
                          onClick={() => {
                            if (index === 0) return
                            setFallbackChain((prev) => {
                              const next = [...prev]
                              ;[next[index - 1], next[index]] = [next[index]!, next[index - 1]!]
                              return next
                            })
                          }}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          title="下へ"
                          disabled={index >= fallbackChain.length - 1}
                          style={{
                            ...btnSecondary,
                            padding: '4px 6px',
                            fontSize: 11,
                            opacity: index >= fallbackChain.length - 1 ? 0.4 : 1,
                          }}
                          onClick={() => {
                            if (index >= fallbackChain.length - 1) return
                            setFallbackChain((prev) => {
                              const next = [...prev]
                              ;[next[index], next[index + 1]] = [next[index + 1]!, next[index]!]
                              return next
                            })
                          }}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          title="削除"
                          disabled={fallbackChain.length <= 1}
                          style={{
                            ...btnSecondary,
                            padding: '4px 6px',
                            fontSize: 11,
                            color: '#f87171',
                            opacity: fallbackChain.length <= 1 ? 0.4 : 1,
                          }}
                          onClick={() => {
                            if (fallbackChain.length <= 1) return
                            setFallbackChain((prev) => prev.filter((_, i) => i !== index))
                          }}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <button
                      type="button"
                      style={{ ...btnSecondary, padding: '4px 10px', fontSize: 12 }}
                      disabled={fallbackChain.length >= 5}
                      onClick={() =>
                        setFallbackChain((prev) => [
                          ...prev,
                          { provider: 'ollama', model: 'qwen2.5-coder:14b' },
                        ])
                      }
                    >
                      + 候補を追加
                    </button>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#858585' }}>
                      最大試行
                      <input
                        type="number"
                        min={1}
                        max={5}
                        style={{
                          width: 52,
                          padding: '4px 6px',
                          fontSize: 12,
                          color: '#cccccc',
                          backgroundColor: '#252526',
                          border: '1px solid #3c3c3c',
                          borderRadius: 4,
                        }}
                        value={maxAttempts}
                        onChange={(e) => setMaxAttempts(Number(e.target.value) || 3)}
                      />
                    </label>
                  </div>
                </div>
              )}

              <label style={labelStyle} htmlFor="max-iterations">最大イテレーション（Agent）</label>
              <input
                id="max-iterations"
                type="number"
                min={5}
                max={500}
                step={5}
                style={inputStyle}
                value={maxIterations}
                onChange={(e) => setMaxIterations(Number(e.target.value) || 100)}
              />
              <p style={{ margin: '6px 0 0', fontSize: 11, color: '#6e6e6e' }}>
                1 回の Agent 実行で許可するツール呼び出しループの上限（5〜500）
              </p>

              <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 8, marginTop: 16 }}>
                <input
                  type="checkbox"
                  checked={yoloMode}
                  onChange={(e) => setYoloMode(e.target.checked)}
                />
                YOLO モード（Agent の書込・Shell を承認なしで実行）
              </label>
              <p style={{ margin: '4px 0 0', fontSize: 11, color: '#f87171' }}>
                有効にするとファイル変更やコマンド実行が自動適用されます。自己責任で使用してください。
              </p>

              <p style={{ ...labelStyle, marginTop: 20, marginBottom: 0 }}>ツール権限（YOLO が OFF のとき）</p>
              {([
                ['read', '読取（Read / Grep / Glob / Task）'],
                ['edit', '編集（Write / StrReplace / Delete / MemoryAppend）'],
                ['shell', 'Shell'],
                ['network', 'ネットワーク（WebSearch）'],
              ] as const).map(([key, label]) => (
                <label key={key} style={labelStyle} htmlFor={`perm-${key}`}>
                  {label}
                  <select
                    id={`perm-${key}`}
                    style={selectStyle}
                    value={permissions[key]}
                    disabled={yoloMode}
                    onChange={(e) =>
                      setPermissions((prev) => ({
                        ...prev,
                        [key]: e.target.value as PermissionAction,
                      }))
                    }
                  >
                    <option value="allow">allow（自動実行）</option>
                    <option value="ask">ask（承認を求める）</option>
                    <option value="deny">deny（拒否）</option>
                  </select>
                </label>
              ))}

              <label style={labelStyle} htmlFor="compact-threshold">
                Compact 閾値（推定トークン）
              </label>
              <input
                id="compact-threshold"
                type="number"
                min={0}
                step={1000}
                style={inputStyle}
                value={compactTokenThreshold}
                onChange={(e) => setCompactTokenThreshold(Number(e.target.value) || 0)}
              />
              <p style={{ margin: '6px 0 0', fontSize: 11, color: '#6e6e6e' }}>
                Agent 履歴がこの推定トークンを超えると自動 Compact（0 で既定の履歴予算のみ）
              </p>

              <label style={labelStyle} htmlFor="max-subagents">
                並列 Subagent 上限（Task）
              </label>
              <input
                id="max-subagents"
                type="number"
                min={1}
                max={8}
                step={1}
                style={inputStyle}
                value={maxSubagents}
                onChange={(e) => setMaxSubagents(Number(e.target.value) || 3)}
              />
              <p style={{ margin: '6px 0 0', fontSize: 11, color: '#6e6e6e' }}>
                同時に動かす読取専用サブエージェント数（1〜8）
              </p>

              <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 8, marginTop: 16 }}>
                <input
                  type="checkbox"
                  checked={autoMemory}
                  onChange={(e) => setAutoMemory(e.target.checked)}
                />
                Auto Memory（Agent 完了後に `.codex/memory/MEMORY.md` へ要約を追記）
              </label>
              <p style={{ margin: '4px 0 0', fontSize: 11, color: '#6e6e6e' }}>
                オプトイン。次回以降のセッションで memory が system に注入されます。
              </p>
            </>
          )}

          <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            {onCancel && (
              <button type="button" style={btnSecondary} onClick={onCancel}>閉じる</button>
            )}
            <button type="submit" style={btnPrimary} disabled={loading}>
              {saved ? '保存しました' : '保存'}
            </button>
          </div>
        </>
      )}
    </form>
  )
}

export function SettingsDialog({
  open,
  onClose,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  onSaved?: () => void
}) {
  if (!open) return null

  return createPortal(
    <div
      style={overlayStyle}
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <SettingsForm onSaved={onSaved} onCancel={onClose} />
    </div>,
    document.body,
  )
}

function GearIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  )
}

export function SettingsButton({
  variant = 'icon',
  className = '',
}: {
  variant?: 'icon' | 'text'
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const loadSettings = useAppStore((s) => s.loadSettings)

  return (
    <>
      <button
        type="button"
        title="設定"
        aria-label="設定"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
        style={
          variant === 'text'
            ? { padding: '6px 12px', fontSize: 14, color: '#cccccc', backgroundColor: 'transparent', border: '1px solid #3c3c3c', borderRadius: 4, cursor: 'pointer' }
            : { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, color: '#cccccc', backgroundColor: 'transparent', border: 'none', borderRadius: 4, cursor: 'pointer' }
        }
        className={className}
      >
        {variant === 'text' ? '設定' : <GearIcon />}
      </button>
      <SettingsDialog open={open} onClose={() => setOpen(false)} onSaved={() => void loadSettings()} />
    </>
  )
}

export function useSettingsDialog() {
  const [open, setOpen] = useState(false)
  const loadSettings = useAppStore((s) => s.loadSettings)
  return {
    openSettings: () => setOpen(true),
    settingsDialog: (
      <SettingsDialog open={open} onClose={() => setOpen(false)} onSaved={() => void loadSettings()} />
    ),
  }
}
