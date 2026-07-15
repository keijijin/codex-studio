import { useEffect, useState } from 'react'
import { useAppStore } from '@renderer/store/app-store'
import { Layout } from '@renderer/components/Layout'
import { Welcome } from '@renderer/components/Welcome'
import { ErrorBoundary } from '@renderer/components/ErrorBoundary'

export function App() {
  const workspace = useAppStore((s) => s.workspace)
  const initialize = useAppStore((s) => s.initialize)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    document.documentElement.classList.add('dark')
    void initialize().finally(() => setReady(true))
  }, [initialize])

  if (!ready) {
    return (
      <div
        style={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#1e1e1e',
          color: '#858585',
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
