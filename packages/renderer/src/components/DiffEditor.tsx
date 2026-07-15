import { DiffEditor } from '@monaco-editor/react'

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
        theme="vs-dark"
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
        }}
      />
    </div>
  )
}

export function guessLanguageFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase()
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    json: 'json', md: 'markdown', css: 'css', html: 'html', py: 'python',
    rs: 'rust', go: 'go', yaml: 'yaml', yml: 'yaml', sh: 'shell',
  }
  return map[ext ?? ''] ?? 'plaintext'
}
