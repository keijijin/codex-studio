import { useAppStore } from '@renderer/store/app-store'
import { isMarkdownFile } from '@renderer/utils/files'
import { MarkdownPreview } from './MarkdownPreview'
import { MonacoEditor } from './MonacoEditor'

export function FileEditor() {
  const tabs = useAppStore((s) => s.tabs)
  const activeTabPath = useAppStore((s) => s.activeTabPath)

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

  if (isMarkdownFile(activeTab.name) && (activeTab.mdViewMode ?? 'preview') === 'preview') {
    return <MarkdownPreview content={activeTab.content} />
  }

  return <MonacoEditor />
}
