import { useAppStore } from '@renderer/store/app-store'
import { isMarkdownFile, isPdfFile } from '@renderer/utils/files'
import { MarkdownPreview } from './MarkdownPreview'
import { MonacoEditor } from './MonacoEditor'
import { PdfViewer } from './PdfViewer'

export function FileEditor({
  tabPath,
  pane,
}: {
  tabPath?: string | null
  pane?: 'primary' | 'secondary'
}) {
  const tabs = useAppStore((s) => s.tabs)
  const activeTabPath = useAppStore((s) => s.activeTabPath)
  const setActivePane = useAppStore((s) => s.setActivePane)
  const path = tabPath ?? activeTabPath
  const activeTab = tabs.find((t) => t.path === path)

  if (!activeTab) {
    return (
      <div
        className="flex h-full min-h-0 items-center justify-center text-text-secondary"
        onMouseDown={() => {
          if (pane) setActivePane(pane)
        }}
      >
        <div className="text-center">
          <p className="text-lg">Codex Studio</p>
          <p className="mt-2 text-sm">左の Explorer からファイルを開いてください</p>
          <p className="mt-4 text-xs text-text-muted">Cmd+S で保存 / Cmd+F で検索</p>
        </div>
      </div>
    )
  }

  return (
    <div
      className="h-full min-h-0"
      onMouseDown={() => {
        if (pane) setActivePane(pane)
      }}
    >
      {activeTab.kind === 'pdf' || isPdfFile(activeTab.name) ? (
        activeTab.binaryBase64 ? (
          <PdfViewer
            base64={activeTab.binaryBase64}
            mimeType={activeTab.mimeType ?? 'application/pdf'}
            fileName={activeTab.name}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-text-secondary">
            PDF を読み込み中…
          </div>
        )
      ) : isMarkdownFile(activeTab.name) && (activeTab.mdViewMode ?? 'preview') === 'preview' ? (
        <MarkdownPreview content={activeTab.content} baseFilePath={activeTab.path} />
      ) : (
        <MonacoEditor tabPath={activeTab.path} />
      )}
    </div>
  )
}
