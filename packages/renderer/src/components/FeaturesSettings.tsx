import { useEffect, useState } from 'react'
import { API_KEY_CLEAR, API_KEY_REDACTED, DEFAULT_KEYBINDINGS, DEFAULT_LANGFUSE, isClearApiKey, isRedactedApiKey, type KeybindingMap, type LangfuseSettings, type McpServerConfig, type SemanticSearchSettings, type TabCompletionSettings } from '@codex/shared'
import { useAppStore } from '@renderer/store/app-store'
import { applyTheme } from '@renderer/theme'

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  fontSize: 12,
  color: '#cccccc',
  backgroundColor: '#252526',
  border: '1px solid #3c3c3c',
  borderRadius: 4 }

export function FeaturesSettings() {
  const settings = useAppStore((s) => s.settings)
  const loadSettings = useAppStore((s) => s.loadSettings)
  const [theme, setTheme] = useState<'dark' | 'light' | 'system'>('dark')
  const [tabCompletion, setTabCompletion] = useState<TabCompletionSettings>({
    enabled: true,
    debounceMs: 400,
    maxTokens: 64 })
  const [semantic, setSemantic] = useState<SemanticSearchSettings>({
    enabled: false,
    preferSemantic: true,
    embeddingModel: 'text-embedding-3-small',
    maxChunks: 24 })
  const [keybindings, setKeybindings] = useState<KeybindingMap>({ ...DEFAULT_KEYBINDINGS })
  const [mcpServers, setMcpServers] = useState<McpServerConfig[]>([])
  const [mcpStatus, setMcpStatus] = useState<string>('')
  const [semanticStats, setSemanticStats] = useState('')
  const [auditMsg, setAuditMsg] = useState('')
  const [langfuse, setLangfuse] = useState<LangfuseSettings>({ ...DEFAULT_LANGFUSE })
  const [saved, setSaved] = useState(false)
  const workspace = useAppStore((s) => s.workspace)
  const [trustStatus, setTrustStatus] = useState<{
    root: string | null
    trusted: boolean
    trustedAt: string | null
    contentChanged: boolean
  } | null>(null)
  const [trustMsg, setTrustMsg] = useState('')

  const refreshTrust = async () => {
    try {
      const status = await window.codex.workspace.trustStatus()
      setTrustStatus(status)
    } catch {
      setTrustStatus(null)
    }
  }

  useEffect(() => {
    if (!settings) return
    setTheme(settings.general.theme)
    setTabCompletion({ ...settings.tabCompletion })
    setSemantic({ ...settings.semanticSearch })
    setKeybindings({ ...DEFAULT_KEYBINDINGS, ...settings.keybindings })
    setMcpServers([...(settings.mcpServers ?? [])])
    setLangfuse({ ...DEFAULT_LANGFUSE, ...settings.langfuse })
  }, [settings])

  useEffect(() => {
    void refreshTrust()
  }, [workspace?.id, workspace?.rootPaths])

  const save = async () => {
    await window.codex.settings.set({
      general: { ...settings!.general, theme },
      tabCompletion,
      semanticSearch: semantic,
      keybindings,
      mcpServers,
      langfuse })
    applyTheme(theme)
    await loadSettings()
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <section>
        <h3 style={{ margin: 0, fontSize: 14, color: '#fff' }}>ワークスペース信頼</h3>
        {!workspace ? (
          <p style={{ margin: '8px 0 0', fontSize: 12, color: '#858585' }}>
            フォルダを開くと信頼状態を表示・変更できます。
          </p>
        ) : (
          <>
            <p style={{ margin: '8px 0 0', fontSize: 12, color: '#ccc' }}>
              状態:{' '}
              {trustStatus?.trusted
                ? trustStatus.contentChanged
                  ? '信頼済み（hooks / agent.env が変更されています — 再信頼を推奨）'
                  : '信頼済み'
                : '未信頼（制限モード）'}
            </p>
            {trustStatus?.trustedAt && (
              <p style={{ margin: '4px 0 0', fontSize: 11, color: '#858585' }}>
                信頼日時: {trustStatus.trustedAt}
              </p>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                type="button"
                style={{ ...inputStyle, width: 'auto', cursor: 'pointer' }}
                onClick={async () => {
                  const status = await window.codex.workspace.trust()
                  setTrustStatus(status)
                  setTrustMsg('このフォルダを信頼しました')
                  setTimeout(() => setTrustMsg(''), 2000)
                }}
              >
                信頼する
              </button>
              <button
                type="button"
                style={{ ...inputStyle, width: 'auto', cursor: 'pointer' }}
                disabled={!trustStatus?.trusted}
                onClick={async () => {
                  const status = await window.codex.workspace.untrust()
                  setTrustStatus(status)
                  setTrustMsg('信頼を解除しました（Hooks / agent.env 無効）')
                  setTimeout(() => setTrustMsg(''), 2000)
                }}
              >
                信頼を解除
              </button>
            </div>
            {trustMsg && (
              <p style={{ margin: '6px 0 0', fontSize: 11, color: '#4ec9b0' }}>{trustMsg}</p>
            )}
            <p style={{ margin: '6px 0 0', fontSize: 11, color: '#858585' }}>
              未信頼時は Hooks・agent.env・ワークスペース Rules/Skills/Teams/Personas が無効です。
            </p>
          </>
        )}
      </section>

      <section>
        <h3 style={{ margin: 0, fontSize: 14, color: '#fff' }}>テーマ</h3>
        <select
          style={{ ...inputStyle, marginTop: 8 }}
          value={theme}
          onChange={(e) => {
            const v = e.target.value as 'dark' | 'light' | 'system'
            setTheme(v)
            applyTheme(v)
          }}
        >
          <option value="dark">ダーク</option>
          <option value="light">ライト</option>
          <option value="system">システム</option>
        </select>
      </section>

      <section>
        <h3 style={{ margin: 0, fontSize: 14, color: '#fff' }}>Tab 補完</h3>
        <label style={{ display: 'flex', gap: 8, marginTop: 8, fontSize: 12, color: '#ccc' }}>
          <input
            type="checkbox"
            checked={tabCompletion.enabled}
            onChange={(e) => setTabCompletion({ ...tabCompletion, enabled: e.target.checked })}
          />
          インライン補完を有効化（Ghost text · Tab で確定）
        </label>
        <label style={{ display: 'flex', gap: 8, marginTop: 8, fontSize: 12, color: '#ccc' }}>
          <input
            type="checkbox"
            checked={tabCompletion.allowOnLocal === true}
            onChange={(e) =>
              setTabCompletion({ ...tabCompletion, allowOnLocal: e.target.checked })
            }
          />
          ローカル LLM（Ollama / llama.cpp）利用時も補完する
        </label>
        <p style={{ margin: '6px 0 0', fontSize: 11, color: '#858585' }}>
          オフ推奨。ローカルは同時リクエストに弱く、補完が Agent/Ask を遅くします。
        </p>
      </section>

      <section>
        <h3 style={{ margin: 0, fontSize: 14, color: '#fff' }}>セマンティック検索</h3>
        <label style={{ display: 'flex', gap: 8, marginTop: 8, fontSize: 12, color: '#ccc' }}>
          <input
            type="checkbox"
            checked={semantic.enabled}
            onChange={(e) => setSemantic({ ...semantic, enabled: e.target.checked })}
          />
          @codebase で Embedding 検索を使う（OpenAI キー必要）
        </label>
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            style={{ ...inputStyle, width: 'auto', cursor: 'pointer' }}
            onClick={() => {
              void window.codex.semantic.stats().then((s) => {
                setSemanticStats(`${s.chunks} chunks · ${s.dbPath}`)
              })
            }}
          >
            索引統計
          </button>
          <button
            type="button"
            style={{ ...inputStyle, width: 'auto', cursor: 'pointer' }}
            onClick={() => {
              setSemanticStats('再索引中…')
              void window.codex.semantic.reindex({ limit: 80 })
                .then((r) => setSemanticStats(`再索引完了: ${r.indexed} files`))
                .catch((err: unknown) =>
                  setSemanticStats(err instanceof Error ? err.message : '再索引失敗'),
                )
            }}
          >
            再索引（最大80）
          </button>
        </div>
        {semanticStats && (
          <p style={{ margin: '4px 0 0', fontSize: 11, color: '#858585' }}>{semanticStats}</p>
        )}
      </section>

      <section>
        <h3 style={{ margin: 0, fontSize: 14, color: '#fff' }}>MCP サーバー</h3>
        <p style={{ margin: '4px 0 8px', fontSize: 11, color: '#858585' }}>
          stdio で起動する外部 MCP（例: npx -y @modelcontextprotocol/server-filesystem）
        </p>
        {mcpServers.map((s, i) => (
          <div
            key={s.id}
            style={{
              border: '1px solid #3c3c3c',
              borderRadius: 4,
              padding: 8,
              marginBottom: 8 }}
          >
            <label style={{ display: 'flex', gap: 6, fontSize: 12, color: '#ccc' }}>
              <input
                type="checkbox"
                checked={s.enabled}
                onChange={(e) => {
                  const next = [...mcpServers]
                  next[i] = { ...s, enabled: e.target.checked }
                  setMcpServers(next)
                }}
              />
              有効
            </label>
            <input
              style={{ ...inputStyle, marginTop: 6 }}
              placeholder="名前"
              value={s.name}
              onChange={(e) => {
                const next = [...mcpServers]
                next[i] = { ...s, name: e.target.value }
                setMcpServers(next)
              }}
            />
            <input
              style={{ ...inputStyle, marginTop: 6 }}
              placeholder="command (例: npx)"
              value={s.command}
              onChange={(e) => {
                const next = [...mcpServers]
                next[i] = { ...s, command: e.target.value }
                setMcpServers(next)
              }}
            />
            <input
              style={{ ...inputStyle, marginTop: 6 }}
              placeholder="args (スペース区切り)"
              value={(s.args ?? []).join(' ')}
              onChange={(e) => {
                const next = [...mcpServers]
                next[i] = {
                  ...s,
                  args: e.target.value.split(/\s+/).filter(Boolean) }
                setMcpServers(next)
              }}
            />
            <button
              type="button"
              style={{ marginTop: 6, fontSize: 11, color: '#f87171' }}
              onClick={() => setMcpServers(mcpServers.filter((_, j) => j !== i))}
            >
              削除
            </button>
          </div>
        ))}
        <button
          type="button"
          style={{ ...inputStyle, width: 'auto', cursor: 'pointer' }}
          onClick={() =>
            setMcpServers([
              ...mcpServers,
              {
                id: `mcp-${Date.now()}`,
                name: 'New MCP',
                enabled: false,
                command: 'npx',
                args: ['-y', '@modelcontextprotocol/server-everything'] },
            ])
          }
        >
          + MCP を追加
        </button>
        <button
          type="button"
          style={{ ...inputStyle, width: 'auto', marginLeft: 8, cursor: 'pointer' }}
          onClick={() => {
            void window.codex.mcp.sync().then((r) => {
              setMcpStatus(
                `connected: ${r.connected.join(', ') || '(none)'}` +
                  (r.errors.length ? ` · errors: ${r.errors.map((e) => e.message).join('; ')}` : ''),
              )
            })
          }}
        >
          今すぐ同期
        </button>
        {mcpStatus && (
          <p style={{ margin: '6px 0 0', fontSize: 11, color: '#858585' }}>{mcpStatus}</p>
        )}
      </section>

      <section>
        <h3 style={{ margin: 0, fontSize: 14, color: '#fff' }}>キーバインド</h3>
        {(Object.keys(DEFAULT_KEYBINDINGS) as Array<keyof KeybindingMap>).map((k) => (
          <label key={k} style={{ display: 'block', marginTop: 6, fontSize: 11, color: '#858585' }}>
            {k}
            <input
              style={{ ...inputStyle, marginTop: 2 }}
              value={keybindings[k]}
              onChange={(e) => setKeybindings({ ...keybindings, [k]: e.target.value })}
            />
          </label>
        ))}
      </section>

      <section>
        <h3 style={{ margin: 0, fontSize: 14, color: '#fff' }}>Langfuse</h3>
        <p style={{ margin: '6px 0 0', fontSize: 11, color: '#858585' }}>
          Ask / Agent の LLM・ツール呼び出しをトレースします。Base URL はキーを発行した環境と一致させてください（日本
          Cloud: https://jp.cloud.langfuse.com / セルフホスト既定:{' '}
          {DEFAULT_LANGFUSE.baseUrl}）。環境変数 LANGFUSE_PUBLIC_KEY / SECRET_KEY / BASE_URL
          でも上書きできます。
        </p>
        <label style={{ display: 'flex', gap: 8, marginTop: 8, fontSize: 12, color: '#ccc' }}>
          <input
            type="checkbox"
            checked={langfuse.enabled}
            onChange={(e) => setLangfuse({ ...langfuse, enabled: e.target.checked })}
          />
          Langfuse トレースを有効化
        </label>
        <label style={{ display: 'block', marginTop: 8, fontSize: 11, color: '#858585' }}>
          Public Key (pk-…)
          <input
            style={{ ...inputStyle, marginTop: 2 }}
            value={langfuse.publicKey}
            onChange={(e) => setLangfuse({ ...langfuse, publicKey: e.target.value })}
            placeholder="pk-lf-…"
            autoComplete="off"
          />
        </label>
        <label style={{ display: 'block', marginTop: 8, fontSize: 11, color: '#858585' }}>
          Secret Key (sk-…)
          <div style={{ display: 'flex', gap: 8, marginTop: 2, alignItems: 'center' }}>
            <input
              style={{ ...inputStyle, flex: 1, marginTop: 0 }}
              type="password"
              value={
                isRedactedApiKey(langfuse.secretKey) || isClearApiKey(langfuse.secretKey)
                  ? ''
                  : langfuse.secretKey
              }
              onChange={(e) =>
                setLangfuse({
                  ...langfuse,
                  secretKey:
                    e.target.value ||
                    (langfuse.secretKey && isRedactedApiKey(langfuse.secretKey)
                      ? API_KEY_REDACTED
                      : ''),
                })
              }
              placeholder={
                isRedactedApiKey(langfuse.secretKey) ? '設定済み（変更時のみ入力）' : 'sk-lf-…'
              }
              autoComplete="off"
            />
            {(isRedactedApiKey(langfuse.secretKey) ||
              (langfuse.secretKey && !isClearApiKey(langfuse.secretKey))) && (
              <button
                type="button"
                style={{ ...inputStyle, width: 'auto', cursor: 'pointer', whiteSpace: 'nowrap' }}
                onClick={() => setLangfuse({ ...langfuse, secretKey: API_KEY_CLEAR })}
                title="保存済みの Secret Key を削除"
              >
                削除
              </button>
            )}
          </div>
          {langfuse.secretKey === API_KEY_CLEAR && (
            <p style={{ margin: '4px 0 0', fontSize: 11, color: '#fbbf24' }}>
              保存するとこのキーは削除されます。
            </p>
          )}
        </label>
        <label style={{ display: 'block', marginTop: 8, fontSize: 11, color: '#858585' }}>
          Base URL
          <input
            style={{ ...inputStyle, marginTop: 2 }}
            value={langfuse.baseUrl}
            onChange={(e) => setLangfuse({ ...langfuse, baseUrl: e.target.value })}
            placeholder={DEFAULT_LANGFUSE.baseUrl}
          />
        </label>
      </section>

      <section>
        <h3 style={{ margin: 0, fontSize: 14, color: '#fff' }}>監査ログ</h3>
        <button
          type="button"
          style={{ ...inputStyle, width: 'auto', marginTop: 8, cursor: 'pointer' }}
          onClick={() => {
            void window.codex.audit.export({ limit: 5000 }).then((r) => {
              setAuditMsg(`Exported ${r.lines} lines → ${r.path}`)
            })
          }}
        >
          監査ログをエクスポート
        </button>
        {auditMsg && (
          <p style={{ margin: '6px 0 0', fontSize: 11, color: '#858585' }}>{auditMsg}</p>
        )}
      </section>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        {saved && <span style={{ fontSize: 12, color: '#4ade80' }}>保存しました</span>}
        <button
          type="button"
          style={{
            padding: '6px 14px',
            fontSize: 12,
            color: '#fff',
            backgroundColor: '#0078d4',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer' }}
          onClick={() => void save()}
        >
          機能設定を保存
        </button>
      </div>
    </div>
  )
}
