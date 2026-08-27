import { useEffect, useState } from 'react'
import {
  API_KEY_REDACTED,
  DEFAULT_KEYBINDINGS,
  DEFAULT_LANGFUSE,
  IPC_CHANNELS,
  isRedactedApiKey,
  type KeybindingMap,
  type LangfuseSettings,
  type McpServerConfig,
  type SemanticSearchSettings,
  type TabCompletionSettings,
} from '@codex/shared'
import { useAppStore } from '@renderer/store/app-store'
import { applyTheme } from '@renderer/theme'

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  fontSize: 12,
  color: '#cccccc',
  backgroundColor: '#252526',
  border: '1px solid #3c3c3c',
  borderRadius: 4,
}

export function FeaturesSettings() {
  const settings = useAppStore((s) => s.settings)
  const loadSettings = useAppStore((s) => s.loadSettings)
  const [theme, setTheme] = useState<'dark' | 'light' | 'system'>('dark')
  const [tabCompletion, setTabCompletion] = useState<TabCompletionSettings>({
    enabled: true,
    debounceMs: 400,
    maxTokens: 64,
  })
  const [semantic, setSemantic] = useState<SemanticSearchSettings>({
    enabled: false,
    preferSemantic: true,
    embeddingModel: 'text-embedding-3-small',
    maxChunks: 24,
  })
  const [keybindings, setKeybindings] = useState<KeybindingMap>({ ...DEFAULT_KEYBINDINGS })
  const [mcpServers, setMcpServers] = useState<McpServerConfig[]>([])
  const [mcpStatus, setMcpStatus] = useState<string>('')
  const [semanticStats, setSemanticStats] = useState('')
  const [auditMsg, setAuditMsg] = useState('')
  const [langfuse, setLangfuse] = useState<LangfuseSettings>({ ...DEFAULT_LANGFUSE })
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!settings) return
    setTheme(settings.general.theme)
    setTabCompletion({ ...settings.tabCompletion })
    setSemantic({ ...settings.semanticSearch })
    setKeybindings({ ...DEFAULT_KEYBINDINGS, ...settings.keybindings })
    setMcpServers([...(settings.mcpServers ?? [])])
    setLangfuse({ ...DEFAULT_LANGFUSE, ...settings.langfuse })
  }, [settings])

  const save = async () => {
    await window.codex.invoke(IPC_CHANNELS.SETTINGS_SET, {
      general: { ...settings!.general, theme },
      tabCompletion,
      semanticSearch: semantic,
      keybindings,
      mcpServers,
      langfuse,
    })
    applyTheme(theme)
    await loadSettings()
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
              void window.codex.invoke(IPC_CHANNELS.SEMANTIC_STATS).then((s) => {
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
              void window.codex
                .invoke(IPC_CHANNELS.SEMANTIC_REINDEX, { limit: 80 })
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
              marginBottom: 8,
            }}
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
                  args: e.target.value.split(/\s+/).filter(Boolean),
                }
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
                args: ['-y', '@modelcontextprotocol/server-everything'],
              },
            ])
          }
        >
          + MCP を追加
        </button>
        <button
          type="button"
          style={{ ...inputStyle, width: 'auto', marginLeft: 8, cursor: 'pointer' }}
          onClick={() => {
            void window.codex.invoke(IPC_CHANNELS.MCP_SYNC).then((r) => {
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
          <input
            style={{ ...inputStyle, marginTop: 2 }}
            type="password"
            value={langfuse.secretKey}
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
            placeholder="sk-lf-…"
            autoComplete="off"
          />
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
            void window.codex.invoke(IPC_CHANNELS.AUDIT_EXPORT, { limit: 5000 }).then((r) => {
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
            cursor: 'pointer',
          }}
          onClick={() => void save()}
        >
          機能設定を保存
        </button>
      </div>
    </div>
  )
}
