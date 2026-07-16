import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { IPC_CHANNELS, type RuleFile, type RuleSaveParams } from '@codex/shared'
import { hasCodexApi } from './ErrorBoundary'

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
  marginTop: 12,
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

const btnSecondary: CSSProperties = {
  padding: '8px 16px',
  fontSize: 14,
  color: '#858585',
  backgroundColor: 'transparent',
  border: '1px solid #3c3c3c',
  borderRadius: 4,
  cursor: 'pointer',
}

const btnDanger: CSSProperties = {
  ...btnSecondary,
  color: '#f87171',
  borderColor: '#7f1d1d',
}

function sourceLabel(source: RuleFile['source']): string {
  if (source === 'global') return 'グローバル'
  if (source === 'workspace-cursor') return '.cursor/rules'
  return '.codex/rules'
}

const emptyDraft = (): Omit<RuleSaveParams, 'scope'> & { scope: RuleSaveParams['scope']; absolutePath?: string } => ({
  name: '',
  content: '',
  alwaysApply: true,
  globs: [],
  description: '',
  scope: 'workspace',
})

export function RulesSettings() {
  const [rules, setRules] = useState<RuleFile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(emptyDraft())
  const [globsText, setGlobsText] = useState('')
  const [saving, setSaving] = useState(false)

  const refresh = useCallback(async () => {
    if (!hasCodexApi()) return
    setLoading(true)
    setError(null)
    try {
      const list = await window.codex.invoke(IPC_CHANNELS.RULES_LIST)
      setRules(list)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Rules の読み込みに失敗しました')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const startCreate = () => {
    setDraft(emptyDraft())
    setGlobsText('')
    setEditing(true)
  }

  const startEdit = (rule: RuleFile) => {
    setDraft({
      name: rule.name,
      content: rule.content,
      alwaysApply: rule.meta.alwaysApply,
      globs: rule.meta.globs,
      description: rule.meta.description ?? '',
      scope: rule.source === 'global' ? 'global' : 'workspace',
      absolutePath: rule.absolutePath,
    })
    setGlobsText(rule.meta.globs.join(', '))
    setEditing(true)
  }

  const handleSave = async () => {
    if (!hasCodexApi()) return
    if (!draft.name.trim() && !draft.absolutePath) {
      setError('ファイル名を入力してください')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await window.codex.invoke(IPC_CHANNELS.RULES_SAVE, {
        name: draft.name.trim() || 'rule.md',
        content: draft.content,
        alwaysApply: draft.alwaysApply,
        globs: globsText
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        description: draft.description?.trim() || undefined,
        scope: draft.scope,
        absolutePath: draft.absolutePath,
      })
      setEditing(false)
      await refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (rule: RuleFile) => {
    if (!hasCodexApi()) return
    if (!window.confirm(`「${rule.name}」を削除しますか？`)) return
    setError(null)
    try {
      await window.codex.invoke(IPC_CHANNELS.RULES_DELETE, rule.absolutePath)
      if (draft.absolutePath === rule.absolutePath) setEditing(false)
      await refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '削除に失敗しました')
    }
  }

  if (editing) {
    return (
      <div>
        <h3 style={{ margin: '0 0 8px', fontSize: 15, color: '#fff' }}>
          {draft.absolutePath ? 'Rule を編集' : 'Rule を追加'}
        </h3>
        {error && (
          <p style={{ fontSize: 12, color: '#fca5a5', marginBottom: 8 }}>{error}</p>
        )}

        {!draft.absolutePath && (
          <>
            <label style={labelStyle}>保存先</label>
            <select
              style={{ ...inputStyle, cursor: 'pointer' }}
              value={draft.scope}
              onChange={(e) => setDraft((d) => ({ ...d, scope: e.target.value as 'workspace' | 'global' }))}
            >
              <option value="workspace">プロジェクト（.codex/rules）</option>
              <option value="global">グローバル（~/.codex-studio/rules）</option>
            </select>

            <label style={labelStyle}>ファイル名</label>
            <input
              style={inputStyle}
              placeholder="typescript.md"
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            />
          </>
        )}

        <label style={labelStyle}>説明（任意）</label>
        <input
          style={inputStyle}
          placeholder="この Rule の用途"
          value={draft.description ?? ''}
          onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
        />

        <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={draft.alwaysApply}
            onChange={(e) => setDraft((d) => ({ ...d, alwaysApply: e.target.checked }))}
          />
          Always Apply（常に適用）
        </label>

        <label style={labelStyle}>Globs（カンマ区切り・任意）</label>
        <input
          style={inputStyle}
          placeholder="**/*.ts, **/*.tsx"
          value={globsText}
          onChange={(e) => setGlobsText(e.target.value)}
        />

        <label style={labelStyle}>内容</label>
        <textarea
          style={{ ...inputStyle, minHeight: 180, fontFamily: 'Menlo, Monaco, Consolas, monospace', resize: 'vertical' }}
          value={draft.content}
          onChange={(e) => setDraft((d) => ({ ...d, content: e.target.value }))}
          placeholder="- Use TypeScript strict mode&#10;- Prefer functional components"
        />

        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" style={btnSecondary} onClick={() => setEditing(false)}>
            キャンセル
          </button>
          <button type="button" style={btnPrimary} disabled={saving} onClick={() => void handleSave()}>
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 15, color: '#fff' }}>Rules</h3>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: '#858585' }}>
            Cursor 互換のプロジェクト指示。Ask / Agent 両方に適用されます。
          </p>
        </div>
        <button type="button" style={btnPrimary} onClick={startCreate}>
          追加
        </button>
      </div>

      {error && (
        <p style={{ marginTop: 12, fontSize: 12, color: '#fca5a5' }}>{error}</p>
      )}

      {loading ? (
        <p style={{ marginTop: 16, fontSize: 13, color: '#858585' }}>読み込み中…</p>
      ) : rules.length === 0 ? (
        <p style={{ marginTop: 16, fontSize: 13, color: '#858585' }}>
          Rule がありません。「追加」するか、`.codex/rules/*.md` / `.cursor/rules/*.md` を配置してください。
        </p>
      ) : (
        <ul style={{ listStyle: 'none', margin: '16px 0 0', padding: 0 }}>
          {rules.map((rule) => (
            <li
              key={rule.id}
              style={{
                border: '1px solid #3c3c3c',
                borderRadius: 6,
                padding: 12,
                marginBottom: 8,
                backgroundColor: '#1e1e1e',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, color: '#fff', fontWeight: 600 }}>{rule.name}</div>
                  <div style={{ fontSize: 11, color: '#6e6e6e', marginTop: 4 }}>
                    {sourceLabel(rule.source)}
                    {rule.meta.alwaysApply ? ' · Always' : ''}
                    {rule.meta.globs.length > 0 ? ` · ${rule.meta.globs.join(', ')}` : ''}
                  </div>
                  {rule.meta.description && (
                    <div style={{ fontSize: 12, color: '#858585', marginTop: 4 }}>{rule.meta.description}</div>
                  )}
                  <pre
                    style={{
                      margin: '8px 0 0',
                      fontSize: 11,
                      color: '#aaaaaa',
                      whiteSpace: 'pre-wrap',
                      maxHeight: 72,
                      overflow: 'hidden',
                    }}
                  >
                    {rule.content.slice(0, 200)}
                    {rule.content.length > 200 ? '…' : ''}
                  </pre>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                  <button type="button" style={btnSecondary} onClick={() => startEdit(rule)}>
                    編集
                  </button>
                  <button type="button" style={btnDanger} onClick={() => void handleDelete(rule)}>
                    削除
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
