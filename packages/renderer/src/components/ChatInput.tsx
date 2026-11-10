import { useEffect, useRef, useState } from 'react'
import type { Attachment, FileNode, PersonaFile, SkillFile } from '@codex/shared'
import { useAppStore } from '@renderer/store/app-store'

interface ChatInputProps {
  onSend: (content: string, attachments: Attachment[]) => void
  onCancel: () => void
  isStreaming: boolean
  disabled?: boolean
}

type MentionSuggestion =
  | { kind: 'file'; node: FileNode }
  | { kind: 'folder'; node: FileNode }
  | { kind: 'codebase' }

function flattenNodes(nodes: FileNode[]): FileNode[] {
  const result: FileNode[] = []
  for (const node of nodes) {
    result.push(node)
    if (node.children) result.push(...flattenNodes(node.children))
  }
  return result
}

export function ChatInput({ onSend, onCancel, isStreaming, disabled }: ChatInputProps) {
  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [suggestions, setSuggestions] = useState<MentionSuggestion[]>([])
  const [skills, setSkills] = useState<SkillFile[]>([])
  const [personas, setPersonas] = useState<PersonaFile[]>([])
  const [skillSuggestions, setSkillSuggestions] = useState<SkillFile[]>([])
  const [personaSuggestions, setPersonaSuggestions] = useState<PersonaFile[]>([])
  const workspace = useAppStore((s) => s.workspace)
  const fileTree = useAppStore((s) => s.fileTree)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isComposingRef = useRef(false)

  const allNodes = flattenNodes(fileTree)

  useEffect(() => {
    if (!workspace) {
      setSkills([])
      setPersonas([])
      return
    }
    void window.codex.skills.list()
      .then(setSkills)
      .catch(() => setSkills([]))
    void window.codex.personas.list()
      .then(setPersonas)
      .catch(() => setPersonas([]))
  }, [workspace])

  const handleChange = (value: string) => {
    setText(value)

    const personaArgMatch = value.match(/^\/persona(?:\s+([a-zA-Z0-9_-]*))?$/i)
    if (personaArgMatch) {
      const query = (personaArgMatch[1] ?? '').toLowerCase()
      const clearHint: PersonaFile = {
        id: '__clear__',
        name: 'clear',
        description: 'セッションの Persona を解除',
        absolutePath: '',
        relativePath: '',
        body: '',
        scope: 'workspace',
        editable: false }
      const hits = personas.filter(
        (p) =>
          !query ||
          p.name.includes(query) ||
          p.description.toLowerCase().includes(query),
      )
      const withClear =
        !query || 'clear'.includes(query) || 'off'.includes(query)
          ? [clearHint, ...hits]
          : hits
      setPersonaSuggestions(withClear.slice(0, 8))
      setSkillSuggestions([])
      setSuggestions([])
      return
    }
    setPersonaSuggestions([])

    const skillMatch = value.match(/^\/([a-zA-Z0-9_-]*)$/)
    if (skillMatch) {
      const query = skillMatch[1].toLowerCase()
      const skillHits = skills
        .filter((s) => s.name.includes(query) || s.description.toLowerCase().includes(query))
        .slice(0, 8)
      if (!query || 'persona'.includes(query)) {
        setSkillSuggestions([
          {
            id: '__persona__',
            name: 'persona',
            description: 'Persona を適用（/persona <name>）',
            absolutePath: '',
            relativePath: '',
            body: '' },
          ...skillHits,
        ].slice(0, 8))
      } else {
        setSkillSuggestions(skillHits)
      }
      setSuggestions([])
      return
    }
    setSkillSuggestions([])

    const match = value.match(/@(\S*)$/)
    if (match) {
      const query = match[1].toLowerCase()
      const items: MentionSuggestion[] = []
      if (!query || 'codebase'.startsWith(query) || 'codebase'.includes(query)) {
        items.push({ kind: 'codebase' })
      }
      for (const node of allNodes) {
        if (!node.name.toLowerCase().includes(query)) continue
        if (node.type === 'directory') items.push({ kind: 'folder', node })
        else items.push({ kind: 'file', node })
        if (items.length >= 10) break
      }
      setSuggestions(items.slice(0, 10))
    } else {
      setSuggestions([])
    }
  }

  const selectSkill = (skill: SkillFile) => {
    if (skill.name === 'persona') {
      setText('/persona ')
    } else {
      setText(`/${skill.name} `)
    }
    setSkillSuggestions([])
    setPersonaSuggestions([])
    textareaRef.current?.focus()
  }

  const selectPersona = (persona: PersonaFile) => {
    setText(persona.name === 'clear' ? '/persona clear' : `/persona ${persona.name} `)
    setPersonaSuggestions([])
    setSkillSuggestions([])
    textareaRef.current?.focus()
  }

  const selectMention = async (item: MentionSuggestion) => {
    if (item.kind === 'codebase') {
      const attachment: Attachment = {
        type: 'codebase',
        path: 'codebase',
        name: 'codebase' }
      setAttachments((prev) => [
        ...prev.filter((a) => !(a.type === 'codebase' && a.path === 'codebase')),
        attachment,
      ])
      setText(text.replace(/@\S*$/, '@codebase '))
      setSuggestions([])
      textareaRef.current?.focus()
      return
    }

    if (item.kind === 'folder') {
      const attachment: Attachment = {
        type: 'folder',
        path: item.node.path,
        name: item.node.name }
      setAttachments((prev) => [...prev.filter((a) => a.path !== item.node.path), attachment])
      setText(text.replace(/@\S*$/, `@${item.node.name}/ `))
      setSuggestions([])
      textareaRef.current?.focus()
      return
    }

    const content = await window.codex.file.read(item.node.path)
    const attachment: Attachment = {
      type: 'file',
      path: item.node.path,
      name: item.node.name,
      content }
    setAttachments((prev) => [...prev.filter((a) => a.path !== item.node.path), attachment])
    setText(text.replace(/@\S*$/, `@${item.node.name} `))
    setSuggestions([])
    textareaRef.current?.focus()
  }

  const handleSubmit = () => {
    const trimmed = text.trim()
    if (!trimmed || isStreaming || disabled) return
    onSend(trimmed, attachments)
    setText('')
    setAttachments([])
    setSkillSuggestions([])
    setPersonaSuggestions([])
    setSuggestions([])
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      if (e.nativeEvent.isComposing || isComposingRef.current || e.keyCode === 229) {
        return
      }
      e.preventDefault()
      handleSubmit()
    }
    if (e.key === 'Escape' && isStreaming) {
      onCancel()
    }
  }

  const imageInputRef = useRef<HTMLInputElement>(null)

  const chipLabel = (a: Attachment) => {
    if (a.type === 'codebase') return '@codebase'
    if (a.type === 'folder') return `📁 ${a.name}/`
    if (a.type === 'image') return `🖼 ${a.name}`
    return `📎 ${a.name}`
  }

  const addImages = (files: FileList | null) => {
    if (!files?.length) return
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue
      const reader = new FileReader()
      reader.onload = () => {
        const content = typeof reader.result === 'string' ? reader.result : ''
        if (!content.startsWith('data:')) return
        const attachment: Attachment = {
          type: 'image',
          path: `image:${file.name}:${Date.now()}`,
          name: file.name,
          mimeType: file.type || 'image/png',
          content }
        setAttachments((prev) => [...prev, attachment])
      }
      reader.readAsDataURL(file)
    }
  }

  return (
    <div className="border-t border-surface-border p-3">
      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        className="hidden"
        onChange={(e) => {
          addImages(e.target.files)
          e.target.value = ''
        }}
      />
      {attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {attachments.map((a) => (
            <span
              key={`${a.type}:${a.path}`}
              className="flex items-center gap-1 rounded bg-accent-muted px-2 py-0.5 text-xs text-accent"
            >
              {chipLabel(a)}
              <button
                type="button"
                className="hover:text-white"
                onClick={() =>
                  setAttachments((prev) =>
                    prev.filter((x) => !(x.path === a.path && x.type === a.type)),
                  )
                }
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {personaSuggestions.length > 0 && (
        <div className="mb-2 max-h-40 overflow-auto rounded border border-surface-border bg-surface">
          {personaSuggestions.map((p) => (
            <button
              key={p.id}
              type="button"
              className="block w-full truncate px-3 py-1.5 text-left text-xs hover:bg-white/10"
              onClick={() => selectPersona(p)}
            >
              <span className="text-accent">/persona {p.name}</span>
              {p.description ? (
                <span className="ml-2 text-text-muted">{p.description}</span>
              ) : null}
            </button>
          ))}
        </div>
      )}

      {skillSuggestions.length > 0 && (
        <div className="mb-2 max-h-40 overflow-auto rounded border border-surface-border bg-surface">
          {skillSuggestions.map((s) => (
            <button
              key={s.id}
              type="button"
              className="block w-full truncate px-3 py-1.5 text-left text-xs hover:bg-white/10"
              onClick={() => selectSkill(s)}
            >
              <span className="text-accent">/{s.name}</span>
              {s.description ? (
                <span className="ml-2 text-text-muted">{s.description}</span>
              ) : null}
            </button>
          ))}
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="mb-2 max-h-40 overflow-auto rounded border border-surface-border bg-surface">
          {suggestions.map((item) => {
            if (item.kind === 'codebase') {
              return (
                <button
                  key="codebase"
                  type="button"
                  className="block w-full truncate px-3 py-1 text-left text-xs hover:bg-white/10"
                  onClick={() => void selectMention(item)}
                >
                  🔎 @codebase — キーワードで関連箇所を拾う
                </button>
              )
            }
            const icon = item.kind === 'folder' ? '📁' : '📄'
            const suffix = item.kind === 'folder' ? '/' : ''
            return (
              <button
                key={`${item.kind}:${item.node.path}`}
                type="button"
                className="block w-full truncate px-3 py-1 text-left text-xs hover:bg-white/10"
                onClick={() => void selectMention(item)}
              >
                {icon} {item.node.name}
                {suffix}
              </button>
            )
          })}
        </div>
      )}

      <textarea
        ref={textareaRef}
        className="w-full resize-none rounded border border-surface-border bg-surface px-3 py-2 text-sm placeholder:text-text-muted focus:border-accent focus:outline-none disabled:opacity-50"
        rows={3}
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        onCompositionStart={() => {
          isComposingRef.current = true
        }}
        onCompositionEnd={() => {
          isComposingRef.current = false
        }}
        onKeyDown={handleKeyDown}
        placeholder="メッセージ… (/skill · @file · @folder · @codebase · 画像 · Enter 送信)"
        disabled={disabled}
      />

      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            disabled={disabled || isStreaming}
            onClick={() => imageInputRef.current?.click()}
            className="shrink-0 rounded border border-surface-border px-2 py-1 text-xs text-text-secondary hover:bg-white/5 disabled:opacity-50"
            title="画像を添付（ビジョン対応モデル向け）"
          >
            画像
          </button>
          <span className="truncate text-xs text-text-muted">
            {isStreaming
              ? '生成中... (Esc で中断)'
              : skills.length > 0 || personas.length > 0
                ? `Shift+Enter で改行 · / で Skills・Personas（${skills.length + personas.length}）`
                : 'Shift+Enter で改行'}
          </span>
        </div>
        {isStreaming ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded bg-surface-overlay px-3 py-1 text-xs hover:bg-white/10"
          >
            中断
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!text.trim() || disabled}
            className="rounded bg-accent px-3 py-1 text-xs text-white hover:bg-accent-hover disabled:opacity-50"
          >
            送信
          </button>
        )}
      </div>
    </div>
  )
}
