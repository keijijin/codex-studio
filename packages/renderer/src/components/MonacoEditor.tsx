import Editor from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import { CODEX_EDITOR_THEME, CODEX_EDITOR_THEME_LIGHT } from '@renderer/monaco-setup'
import { ensureInlineCompletionProvider } from '@renderer/inline-completion'
import { useAppStore } from '@renderer/store/app-store'
import { guessMonacoLanguage, isJavaLanguage, isXmlLanguage } from '@renderer/utils/language'
import { resolveTheme } from '@renderer/theme'

export function MonacoEditor({ tabPath }: { tabPath?: string | null }) {
  const tabs = useAppStore((s) => s.tabs)
  const activeTabPath = useAppStore((s) => s.activeTabPath)
  const updateTabContent = useAppStore((s) => s.updateTabContent)
  const saveActiveFile = useAppStore((s) => s.saveActiveFile)
  const setActiveTab = useAppStore((s) => s.setActiveTab)
  const themePref = useAppStore((s) => s.settings?.general?.theme ?? 'dark')
  const editorTheme =
    resolveTheme(themePref) === 'light' ? CODEX_EDITOR_THEME_LIGHT : CODEX_EDITOR_THEME

  const path = tabPath ?? activeTabPath
  const activeTab = tabs.find((t) => t.path === path)

  if (!activeTab) {
    return (
      <div className="flex h-full items-center justify-center text-text-secondary">
        <div className="text-center">
          <p className="text-lg">Codex Studio</p>
          <p className="mt-2 text-sm">左の Explorer からファイルを開いてください</p>
          <p className="mt-4 text-xs text-text-muted">Cmd+S で保存 / Cmd+F で検索</p>
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
      theme={editorTheme}
      value={activeTab.content}
      loading={
        <div className="flex h-full items-center justify-center text-sm text-text-muted">
          読み込み中...
        </div>
      }
      onChange={(value) => updateTabContent(activeTab.path, value ?? '')}
      options={getEditorOptions(language)}
      onMount={(editorInstance, monaco) => {
        ensureInlineCompletionProvider(monaco)
        editorInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
          setActiveTab(activeTab.path)
          void saveActiveFile()
        })
        editorInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF, () => {
          void editorInstance.getAction('actions.find')?.run()
        })
        editorInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyH, () => {
          void editorInstance.getAction('editor.action.startFindReplaceAction')?.run()
        })
        editorInstance.onDidFocusEditorText(() => {
          setActiveTab(activeTab.path)
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
    inlineSuggest: {
      enabled: true,
      mode: 'subwordSmart',
    },
    quickSuggestions: {
      other: true,
      comments: false,
      strings: false,
    },
    find: {
      seedSearchStringFromSelection: 'always',
      autoFindInSelection: 'never',
      addExtraSpaceOnTop: false,
    },
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
