import { useAppStore } from '@renderer/store/app-store'
import { isMarkdownFile } from '@renderer/utils/files'
import { FileEditor } from './FileEditor'

export function EditorArea() {
  const tabs = useAppStore((s) => s.tabs)
  const activeTabPath = useAppStore((s) => s.activeTabPath)
  const setActiveTab = useAppStore((s) => s.setActiveTab)
  const closeTab = useAppStore((s) => s.closeTab)
  const closeAllTabs = useAppStore((s) => s.closeAllTabs)
  const saveActiveFile = useAppStore((s) => s.saveActiveFile)
  const setTabMdViewMode = useAppStore((s) => s.setTabMdViewMode)

  const activeTab = tabs.find((t) => t.path === activeTabPath)
  const showMdToggle = activeTab ? isMarkdownFile(activeTab.name) : false

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface">
      {tabs.length > 0 && (
        <div className="flex h-9 shrink-0 items-end overflow-x-auto border-b border-surface-border bg-surface-raised">
          {tabs.map((tab) => (
            <div
              key={tab.path}
              className={`group flex max-w-[200px] cursor-pointer items-center gap-2 border-r border-surface-border px-3 py-2 text-sm ${
                activeTabPath === tab.path
                  ? 'bg-surface text-text-primary'
                  : 'bg-surface-raised text-text-secondary hover:bg-surface-overlay'
              }`}
              onClick={() => setActiveTab(tab.path)}
            >
              <span className="truncate">{tab.name}{tab.isDirty ? ' •' : ''}</span>
              <button
                type="button"
                className="ml-auto hidden shrink-0 rounded p-0.5 hover:bg-white/10 group-hover:inline"
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(tab.path)
                }}
              >
                ×
              </button>
            </div>
          ))}
          {showMdToggle && activeTab && (
            <div className="ml-2 flex shrink-0 items-center gap-1 border-l border-surface-border pl-2">
              <button
                type="button"
                className={`rounded px-2 py-1 text-xs ${
                  (activeTab.mdViewMode ?? 'preview') === 'edit'
                    ? 'bg-accent text-white'
                    : 'text-text-secondary hover:bg-white/10'
                }`}
                onClick={() => setTabMdViewMode(activeTab.path, 'edit')}
              >
                編集
              </button>
              <button
                type="button"
                className={`rounded px-2 py-1 text-xs ${
                  (activeTab.mdViewMode ?? 'preview') === 'preview'
                    ? 'bg-accent text-white'
                    : 'text-text-secondary hover:bg-white/10'
                }`}
                onClick={() => setTabMdViewMode(activeTab.path, 'preview')}
              >
                プレビュー
              </button>
            </div>
          )}
          <div className="ml-auto flex shrink-0 items-center">
            <button
              type="button"
              className="px-3 text-xs text-text-secondary hover:text-text-primary"
              title="タブをすべて閉じる"
              onClick={() => closeAllTabs()}
            >
              すべて閉じる
            </button>
            <button
              type="button"
              className="px-3 text-xs text-text-secondary hover:text-text-primary"
              onClick={() => void saveActiveFile()}
            >
              Save
            </button>
          </div>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-hidden">
        <FileEditor />
      </div>
    </main>
  )
}
