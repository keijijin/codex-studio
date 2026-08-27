import { useEffect, useState } from 'react'
import { useAppStore } from '@renderer/store/app-store'
import { Layout } from '@renderer/components/Layout'
import { Welcome } from '@renderer/components/Welcome'
import { ErrorBoundary } from '@renderer/components/ErrorBoundary'
import { applyTheme } from '@renderer/theme'
import { useKeybindings } from '@renderer/hooks/useKeybindings'

export function App() {
  const workspace = useAppStore((s) => s.workspace)
  const initialize = useAppStore((s) => s.initialize)
  const settings = useAppStore((s) => s.settings)
  const [ready, setReady] = useState(false)

  useKeybindings()

  useEffect(() => {
    void initialize().finally(() => setReady(true))
  }, [initialize])

  useEffect(() => {
    const pref = settings?.general?.theme ?? 'dark'
    applyTheme(pref)
    if (pref !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = () => applyTheme('system')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [settings?.general?.theme])

  if (!ready) {
    return (
      <div
        style={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'var(--surface, #1e1e1e)',
          color: 'var(--text-secondary, #858585)',
          fontSize: 14,
        }}
      >
        読み込み中...
      </div>
    )
  }

  if (!workspace) {
    return (
      <ErrorBoundary>
        <Welcome />
      </ErrorBoundary>
    )
  }

  return (
    <ErrorBoundary>
      <Layout />
    </ErrorBoundary>
  )
}
