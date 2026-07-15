import { DiffEditor } from '@monaco-editor/react'
import { CODEX_EDITOR_THEME } from '@renderer/monaco-setup'
import { guessMonacoLanguage } from '@renderer/utils/language'

interface FileDiffViewProps {
  oldContent: string
  newContent: string
  language?: string
}

export function FileDiffView({ oldContent, newContent, language = 'plaintext' }: FileDiffViewProps) {
  return (
    <div className="h-64 overflow-hidden rounded border border-surface-border">
      <DiffEditor
        height="100%"
        language={language}
        theme={CODEX_EDITOR_THEME}
        original={oldContent}
        modified={newContent}
        loading={
          <div className="flex h-full items-center justify-center text-xs text-text-muted">
            読み込み中...
          </div>
        }
        options={{
          readOnly: true,
          renderSideBySide: true,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          automaticLayout: true,
          fontSize: 12,
          bracketPairColorization: { enabled: true },
        }}
      />
    </div>
  )
}

export function guessLanguageFromPath(path: string): string {
  const filename = path.split(/[/\\]/).pop() ?? path
  return guessMonacoLanguage(filename)
}
