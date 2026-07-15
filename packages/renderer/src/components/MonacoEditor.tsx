import Editor from '@monaco-editor/react'
import { useAppStore } from '@renderer/store/app-store'

export function MonacoEditor() {
  const tabs = useAppStore((s) => s.tabs)
  const activeTabPath = useAppStore((s) => s.activeTabPath)
  const updateTabContent = useAppStore((s) => s.updateTabContent)
  const saveActiveFile = useAppStore((s) => s.saveActiveFile)

  const activeTab = tabs.find((t) => t.path === activeTabPath)

  if (!activeTab) {
    return (
      <div className="flex h-full items-center justify-center text-text-secondary">
        <div className="text-center">
          <p className="text-lg">Codex Studio</p>
          <p className="mt-2 text-sm">左の Explorer からファイルを開いてください</p>
          <p className="mt-4 text-xs text-text-muted">Cmd+S で保存</p>
        </div>
      </div>
    )
  }

  return (
    <Editor
      height="100%"
      path={activeTab.path}
      language={guessLanguage(activeTab.name)}
      theme="vs-dark"
      value={activeTab.content}
      loading={
        <div className="flex h-full items-center justify-center text-sm text-text-muted">
          読み込み中...
        </div>
      }
      onChange={(value) => updateTabContent(activeTab.path, value ?? '')}
      options={{
        fontSize: 13,
        fontFamily: 'Menlo, Monaco, Consolas, monospace',
        minimap: { enabled: true },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 2,
        wordWrap: 'off',
      }}
      onMount={(editor, monaco) => {
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
          void saveActiveFile()
        })
      }}
    />
  )
}

function guessLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase()
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    json: 'json',
    md: 'markdown',
    css: 'css',
    html: 'html',
    py: 'python',
    rs: 'rust',
    go: 'go',
    yaml: 'yaml',
    yml: 'yaml',
    sql: 'sql',
    sh: 'shell',
  }
  return map[ext ?? ''] ?? 'plaintext'
}
