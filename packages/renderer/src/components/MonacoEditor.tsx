import Editor from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import { CODEX_EDITOR_THEME } from '@renderer/monaco-setup'
import { useAppStore } from '@renderer/store/app-store'
import { guessMonacoLanguage, isJavaLanguage, isXmlLanguage } from '@renderer/utils/language'

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

  const language = guessMonacoLanguage(activeTab.name)

  return (
    <Editor
      height="100%"
      path={activeTab.path}
      language={language}
      theme={CODEX_EDITOR_THEME}
      value={activeTab.content}
      loading={
        <div className="flex h-full items-center justify-center text-sm text-text-muted">
          読み込み中...
        </div>
      }
      onChange={(value) => updateTabContent(activeTab.path, value ?? '')}
      options={getEditorOptions(language)}
      onMount={(editorInstance, monaco) => {
        editorInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
          void saveActiveFile()
        })
      }}
    />
  )
}

function getEditorOptions(language: string): editor.IStandaloneEditorConstructionOptions {
  const base: editor.IStandaloneEditorConstructionOptions = {
    fontSize: 13,
    fontFamily: 'Menlo, Monaco, Consolas, monospace',
    fontLigatures: false,
    minimap: { enabled: true },
    scrollBeyondLastLine: false,
    automaticLayout: true,
    tabSize: 2,
    wordWrap: 'off',
    renderWhitespace: 'selection',
    bracketPairColorization: { enabled: true, independentColorPoolPerBracketType: true },
    guides: {
      bracketPairs: true,
      bracketPairsHorizontal: true,
      indentation: true,
      highlightActiveIndentation: true,
    },
    folding: true,
    foldingHighlight: true,
    matchBrackets: 'always',
    colorDecorators: true,
    detectIndentation: true,
  }

  if (isJavaLanguage(language)) {
    return {
      ...base,
      tabSize: 4,
      insertSpaces: true,
      wordWrap: 'off',
    }
  }

  if (isXmlLanguage(language)) {
    return {
      ...base,
      tabSize: 2,
      insertSpaces: true,
      wordWrap: 'bounded',
      wordWrapColumn: 120,
      autoIndent: 'full',
    }
  }

  return base
}
