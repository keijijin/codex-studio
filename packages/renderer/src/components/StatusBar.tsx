import { useEffect, useState } from 'react'
import { IPC_CHANNELS, IPC_EVENTS } from '@codex/shared'
import { useAppStore } from '@renderer/store/app-store'

export function StatusBar() {
  const workspace = useAppStore((s) => s.workspace)
  const activeTabPath = useAppStore((s) => s.activeTabPath)
  const tabs = useAppStore((s) => s.tabs)
  const indexStatus = useAppStore((s) => s.indexStatus)
  const isStreaming = useAppStore((s) => s.isStreaming)
  const sessionMode = useAppStore((s) => s.sessionMode)
  const closeWorkspace = useAppStore((s) => s.closeWorkspace)
  const setSidebarView = useAppStore((s) => s.setSidebarView)
  const [branch, setBranch] = useState<string | null>(null)

  useEffect(() => {
    if (!workspace) {
      setBranch(null)
      return
    }
    let cancelled = false
    const load = async () => {
      try {
        const snap = await window.codex.invoke(IPC_CHANNELS.GIT_STATUS)
        if (!cancelled) setBranch(snap.isRepo ? snap.branch : null)
      } catch {
        if (!cancelled) setBranch(null)
      }
    }
    void load()
    const unsub = window.codex.on(IPC_EVENTS.WORKSPACE_TREE_CHANGED, () => {
      void load()
    })
    return () => {
      cancelled = true
      unsub()
    }
  }, [workspace])

  const activeTab = tabs.find((t) => t.path === activeTabPath)

  return (
    <footer className="flex h-6 shrink-0 items-center justify-between border-t border-surface-border bg-accent px-3 text-xs text-white">
      <div className="flex items-center gap-4">
        {workspace && (
          <button
            type="button"
            title="Welcome 画面に戻る"
            onClick={() => void closeWorkspace()}
            style={{
              padding: '0 6px',
              fontSize: 11,
              color: '#fff',
              backgroundColor: 'rgba(255,255,255,0.15)',
              border: 'none',
              borderRadius: 3,
              cursor: 'pointer',
            }}
          >
            ← Welcome
          </button>
        )}
        {branch && (
          <button
            type="button"
            title="Source Control"
            onClick={() => setSidebarView('git')}
            style={{
              padding: '0 6px',
              fontSize: 11,
              color: '#fff',
              backgroundColor: 'rgba(255,255,255,0.15)',
              border: 'none',
              borderRadius: 3,
              cursor: 'pointer',
            }}
          >
            ⎇ {branch}
          </button>
        )}
        <span>{workspace ? workspace.name : 'No folder open'}</span>
        {activeTab?.isDirty && <span>● Modified</span>}
        {indexStatus.state === 'indexing' && (
          <span>Indexing {indexStatus.indexedFiles}...</span>
        )}
      </div>
      <div className="flex items-center gap-4">
        {isStreaming && <span>AI generating...</span>}
        <span>{indexStatus.totalFiles > 0 ? `${indexStatus.totalFiles} files` : 'UTF-8'}</span>
        <span>
          {sessionMode === 'agent' ? 'Agent' : sessionMode === 'plan' ? 'Plan' : 'Ask'} Mode
        </span>
      </div>
    </footer>
  )
}
