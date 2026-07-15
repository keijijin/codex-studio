import { useEffect, useState } from 'react'
import { IPC_CHANNELS } from '@codex/shared'
import { useAppStore } from '@renderer/store/app-store'
import { SettingsForm } from './SettingsDialog'
import { hasCodexApi } from './ErrorBoundary'

export function Welcome() {
  const openWorkspace = useAppStore((s) => s.openWorkspace)
  const isLoading = useAppStore((s) => s.isLoading)
  const loadSettings = useAppStore((s) => s.loadSettings)
  const [showSettings, setShowSettings] = useState(false)
  const [recentWorkspaces, setRecentWorkspaces] = useState<string[]>([])
  const ipcReady = hasCodexApi()

  useEffect(() => {
    if (!ipcReady) return
    void window.codex.invoke(IPC_CHANNELS.WORKSPACE_RECENT_LIST).then(setRecentWorkspaces)
  }, [ipcReady])

  return (
    <div
      style={{
        minHeight: '100%',
        height: '100%',
        overflow: 'auto',
        backgroundColor: '#1e1e1e',
        color: '#cccccc',
        padding: '48px 24px',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ maxWidth: 520, margin: '0 auto' }}>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 600, color: '#ffffff' }}>
            Codex Studio
          </h1>
          <p style={{ marginTop: 12, color: '#858585' }}>AI ネイティブ開発環境</p>

          {!ipcReady && (
            <p
              style={{
                marginTop: 16,
                padding: 12,
                fontSize: 13,
                color: '#fca5a5',
                backgroundColor: '#450a0a',
                borderRadius: 6,
                border: '1px solid #991b1b',
              }}
            >
              バックエンドとの接続に失敗しました。ターミナルで Ctrl+C → pnpm dev を再実行してください。
            </p>
          )}

          <button
            type="button"
            disabled={isLoading || !ipcReady}
            onClick={() => void openWorkspace()}
            style={{
              marginTop: 24,
              padding: '12px 24px',
              fontSize: 14,
              fontWeight: 500,
              color: '#fff',
              backgroundColor: '#0078d4',
              border: 'none',
              borderRadius: 8,
              cursor: isLoading ? 'wait' : 'pointer',
              opacity: isLoading ? 0.6 : 1,
            }}
          >
            {isLoading ? 'Opening...' : 'Open Folder'}
          </button>

          {recentWorkspaces.length > 0 && (
            <div style={{ marginTop: 24, textAlign: 'left' }}>
              <p style={{ margin: '0 0 8px', fontSize: 12, color: '#858585' }}>最近開いたフォルダ</p>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {recentWorkspaces.slice(0, 5).map((path) => (
                  <li key={path} style={{ marginBottom: 6 }}>
                    <button
                      type="button"
                      disabled={isLoading || !ipcReady}
                      onClick={() => void openWorkspace(path)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        fontSize: 13,
                        color: '#cccccc',
                        backgroundColor: '#252526',
                        border: '1px solid #3c3c3c',
                        borderRadius: 6,
                        cursor: 'pointer',
                        textAlign: 'left',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={path}
                    >
                      {path}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div style={{ marginTop: 16 }}>
            <button
              type="button"
              onClick={() => setShowSettings((v) => !v)}
              style={{
                padding: '8px 16px',
                fontSize: 13,
                color: '#cccccc',
                backgroundColor: 'transparent',
                border: '1px solid #3c3c3c',
                borderRadius: 6,
                cursor: 'pointer',
              }}
            >
              {showSettings ? '▲ API キー設定を閉じる' : '▼ API キー設定を開く'}
            </button>
          </div>
        </div>

        {showSettings && ipcReady && (
          <div style={{ marginTop: 24 }}>
            <SettingsForm compact onSaved={() => void loadSettings()} />
          </div>
        )}

        {showSettings && !ipcReady && (
          <p style={{ marginTop: 24, textAlign: 'center', color: '#f87171', fontSize: 13 }}>
            バックエンドとの接続に失敗しました。pnpm dev を再起動してください。
          </p>
        )}
      </div>
    </div>
  )
}
