import { useEffect, useState } from 'react'
import { IPC_EVENTS } from '@codex/shared'
import { useAppStore } from '@renderer/store/app-store'

export function StatusBar() {
  const workspace = useAppStore((s) => s.workspace)
  const activeTabPath = useAppStore((s) => s.activeTabPath)
  const tabs = useAppStore((s) => s.tabs)
  const indexStatus = useAppStore((s) => s.indexStatus)
  const isStreaming = useAppStore((s) => s.isStreaming)
  const runPhase = useAppStore((s) => s.runPhase)
  const sessionMode = useAppStore((s) => s.sessionMode)
  const closeWorkspace = useAppStore((s) => s.closeWorkspace)
  const setSidebarView = useAppStore((s) => s.setSidebarView)
  const [branch, setBranch] = useState<string | null>(null)
  const [trusted, setTrusted] = useState<boolean | null>(null)

  useEffect(() => {
    if (!workspace) {
      setBranch(null)
      setTrusted(null)
      return
    }
    let cancelled = false
    const load = async () => {
      try {
        const snap = await window.codex.git.status()
        if (!cancelled) setBranch(snap.isRepo ? snap.branch : null)
      } catch {
        if (!cancelled) setBranch(null)
      }
      try {
        const trust = await window.codex.workspace.trustStatus()
        if (!cancelled) setTrusted(trust.trusted)
      } catch {
        if (!cancelled) setTrusted(null)
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
              cursor: 'pointer' }}
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
              cursor: 'pointer' }}
          >
            ⎇ {branch}
          </button>
        )}
        <span>{workspace ? workspace.name : 'No folder open'}</span>
        {workspace && trusted !== null && (
          <span title={trusted ? 'ワークスペース信頼済み' : '未信頼（制限モード）'}>
            {trusted ? 'Trusted' : 'Restricted'}
          </span>
        )}
        {activeTab?.isDirty && <span>● Modified</span>}
        {indexStatus.state === 'indexing' && (
          <span>Indexing {indexStatus.indexedFiles}...</span>
        )}
      </div>
      <div className="flex items-center gap-4">
        {isStreaming || runPhase === 'running' ? (
          <span className="inline-flex items-center gap-1.5 font-medium">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
            AI 実行中
          </span>
        ) : runPhase === 'completed' ? (
          <span>AI 完了</span>
        ) : runPhase === 'error' ? (
          <span>AI エラー</span>
        ) : runPhase === 'cancelled' ? (
          <span>AI 中断</span>
        ) : null}
        <span>{indexStatus.totalFiles > 0 ? `${indexStatus.totalFiles} files` : 'UTF-8'}</span>
        <span>
          {sessionMode === 'agent' ? 'Agent' : sessionMode === 'plan' ? 'Plan' : 'Ask'} Mode
        </span>
      </div>
    </footer>
  )
}
