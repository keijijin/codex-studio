import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { type PersonaFile, type PersonaSaveParams } from '@codex/shared'
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
  boxSizing: 'border-box' }

const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: 12,
  color: '#858585',
  marginTop: 12 }

const btnPrimary: CSSProperties = {
  padding: '8px 16px',
  fontSize: 14,
  color: '#fff',
  backgroundColor: '#0078d4',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer' }

const btnSecondary: CSSProperties = {
  padding: '8px 16px',
  fontSize: 14,
  color: '#858585',
  backgroundColor: 'transparent',
  border: '1px solid #3c3c3c',
  borderRadius: 4,
  cursor: 'pointer' }

const btnDanger: CSSProperties = {
  ...btnSecondary,
  color: '#f87171',
  borderColor: '#7f1d1d' }

const emptyDraft = (): PersonaSaveParams & { absolutePath?: string } => ({
  name: '',
  description: '',
  content: '',
  scope: 'workspace' })

export function PersonasSettings() {
  const [personas, setPersonas] = useState<PersonaFile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(emptyDraft())
  const [saving, setSaving] = useState(false)

  const refresh = useCallback(async () => {
    if (!hasCodexApi()) return
    setLoading(true)
    setError(null)
    try {
      const list = await window.codex.personas.list()
      setPersonas(list)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Personas の読み込みに失敗しました')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const startCreate = () => {
    setDraft(emptyDraft())
    setEditing(true)
  }

  const startEdit = (persona: PersonaFile) => {
    setDraft({
      name: persona.name,
      description: persona.description,
      content: persona.body,
      scope: persona.scope,
      absolutePath: persona.absolutePath })
    setEditing(true)
  }

  const handleSave = async () => {
    if (!draft.name.trim() || !draft.content.trim()) {
      setError('名前と本文は必須です')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await window.codex.personas.save({
        name: draft.name.trim(),
        description: draft.description?.trim() || undefined,
        content: draft.content,
        scope: draft.scope,
        absolutePath: draft.absolutePath })
      setEditing(false)
      await refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (persona: PersonaFile) => {
    if (!window.confirm(`Persona「${persona.name}」を削除しますか？`)) return
    setError(null)
    try {
      await window.codex.personas.delete(persona.absolutePath)
      await refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '削除に失敗しました')
    }
  }

  if (editing) {
    return (
      <div>
        <p style={{ margin: '0 0 8px', fontSize: 13, color: '#cccccc' }}>
          {draft.absolutePath ? 'Persona を編集' : 'Persona を新規作成'}
        </p>
        {error && <p style={{ color: '#f87171', fontSize: 12 }}>{error}</p>}
        <label style={labelStyle} htmlFor="persona-name">
          名前（英数字・-_）
        </label>
        <input
          id="persona-name"
          style={inputStyle}
          value={draft.name}
          disabled={Boolean(draft.absolutePath)}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          placeholder="mentor"
        />
        <label style={labelStyle} htmlFor="persona-desc">
          説明
        </label>
        <input
          id="persona-desc"
          style={inputStyle}
          value={draft.description ?? ''}
          onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          placeholder="短い説明"
        />
        {!draft.absolutePath && (
          <>
            <label style={labelStyle} htmlFor="persona-scope">
              保存先
            </label>
            <select
              id="persona-scope"
              style={{ ...inputStyle, cursor: 'pointer' }}
              value={draft.scope}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  scope: e.target.value as PersonaSaveParams['scope'] }))
              }
            >
              <option value="workspace">ワークスペース（.codex/personas）</option>
              <option value="global">グローバル（~/.codex-studio/personas）</option>
            </select>
          </>
        )}
        <label style={labelStyle} htmlFor="persona-body">
          指示本文
        </label>
        <textarea
          id="persona-body"
          style={{ ...inputStyle, minHeight: 160, fontFamily: 'ui-monospace, monospace', resize: 'vertical' }}
          value={draft.content}
          onChange={(e) => setDraft((d) => ({ ...d, content: e.target.value }))}
          placeholder="口調・優先順位・禁止事項など"
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button type="button" style={btnPrimary} disabled={saving} onClick={() => void handleSave()}>
            {saving ? '保存中…' : '保存'}
          </button>
          <button type="button" style={btnSecondary} onClick={() => setEditing(false)}>
            キャンセル
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p style={{ margin: 0, fontSize: 13, color: '#cccccc' }}>
          Personas AI — 声と優先順位（Rules / Skills とは別）
        </p>
        <button type="button" style={btnPrimary} onClick={startCreate}>
          + 新規
        </button>
      </div>
      <p style={{ margin: '8px 0 0', fontSize: 11, color: '#6e6e6e' }}>
        `/persona &lt;name&gt;` または AI パネルのピッカーで適用。セッションに固定されます。
      </p>
      {error && <p style={{ color: '#f87171', fontSize: 12 }}>{error}</p>}
      {loading ? (
        <p style={{ fontSize: 12, color: '#858585' }}>読み込み中…</p>
      ) : personas.length === 0 ? (
        <p style={{ fontSize: 12, color: '#858585', marginTop: 16 }}>Persona がありません</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0' }}>
          {personas.map((p) => (
            <li
              key={p.id}
              style={{
                border: '1px solid #3c3c3c',
                borderRadius: 6,
                padding: 12,
                marginBottom: 8 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 13, color: '#fff' }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: '#858585', marginTop: 4 }}>
                    {p.scope === 'global' ? 'グローバル' : 'ワークスペース'}
                    {p.description ? ` · ${p.description}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button type="button" style={btnSecondary} onClick={() => startEdit(p)}>
                    編集
                  </button>
                  <button type="button" style={btnDanger} onClick={() => void handleDelete(p)}>
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
