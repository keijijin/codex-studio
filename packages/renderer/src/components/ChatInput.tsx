import { useRef, useState } from 'react'
import type { Attachment, FileNode } from '@codex/shared'
import { IPC_CHANNELS } from '@codex/shared'
import { useAppStore } from '@renderer/store/app-store'

interface ChatInputProps {
  onSend: (content: string, attachments: Attachment[]) => void
  onCancel: () => void
  isStreaming: boolean
  disabled?: boolean
}

function flattenFiles(nodes: FileNode[]): FileNode[] {
  const result: FileNode[] = []
  for (const node of nodes) {
    if (node.type === 'file') result.push(node)
    if (node.children) result.push(...flattenFiles(node.children))
  }
  return result
}

export function ChatInput({ onSend, onCancel, isStreaming, disabled }: ChatInputProps) {
  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [suggestions, setSuggestions] = useState<FileNode[]>([])
  const fileTree = useAppStore((s) => s.fileTree)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isComposingRef = useRef(false)

  const allFiles = flattenFiles(fileTree)

  const handleChange = (value: string) => {
    setText(value)
    const match = value.match(/@(\S*)$/)
    if (match) {
      const query = match[1].toLowerCase()
      setSuggestions(
        allFiles
          .filter((f) => f.name.toLowerCase().includes(query))
          .slice(0, 8),
      )
    } else {
      setSuggestions([])
    }
  }

  const selectFile = async (file: FileNode) => {
    const content = await window.codex.invoke(IPC_CHANNELS.FILE_READ, file.path)
    const attachment: Attachment = {
      type: 'file',
      path: file.path,
      name: file.name,
      content,
    }
    setAttachments((prev) => [...prev.filter((a) => a.path !== file.path), attachment])

    const newText = text.replace(/@\S*$/, `@${file.name} `)
    setText(newText)
    setSuggestions([])
    textareaRef.current?.focus()
  }

  const handleSubmit = () => {
    const trimmed = text.trim()
    if (!trimmed || isStreaming || disabled) return
    onSend(trimmed, attachments)
    setText('')
    setAttachments([])
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      // IME 変換確定の Enter では送信しない
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

  return (
    <div className="border-t border-surface-border p-3">
      {attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {attachments.map((a) => (
            <span
              key={a.path}
              className="flex items-center gap-1 rounded bg-accent-muted px-2 py-0.5 text-xs text-accent"
            >
              📎 {a.name}
              <button
                type="button"
                className="hover:text-white"
                onClick={() => setAttachments((prev) => prev.filter((x) => x.path !== a.path))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="mb-2 max-h-32 overflow-auto rounded border border-surface-border bg-surface">
          {suggestions.map((f) => (
            <button
              key={f.path}
              type="button"
              className="block w-full truncate px-3 py-1 text-left text-xs hover:bg-white/10"
              onClick={() => void selectFile(f)}
            >
              📄 {f.name}
            </button>
          ))}
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
        placeholder="メッセージを入力... (@file で添付、Enter で送信)"
        disabled={disabled}
      />

      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-text-muted">
          {isStreaming ? '生成中... (Esc で中断)' : 'Shift+Enter で改行'}
        </span>
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
