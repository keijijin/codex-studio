import { useEffect } from 'react'
import { ActivityBar } from './ActivityBar'
import { Sidebar } from './Sidebar'
import { EditorArea } from './EditorArea'
import { AIPanel } from './AIPanel'
import { StatusBar } from './StatusBar'
import { TerminalPanel } from './TerminalPanel'
import { useAppStore } from '@renderer/store/app-store'

export function Layout() {
  const aiPanelOpen = useAppStore((s) => s.aiPanelOpen)
  const terminalPanelOpen = useAppStore((s) => s.terminalPanelOpen)
  const toggleTerminalPanel = useAppStore((s) => s.toggleTerminalPanel)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '`' || (!event.ctrlKey && !event.metaKey)) {
        return
      }
      const target = event.target
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        return
      }
      event.preventDefault()
      toggleTerminalPanel()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggleTerminalPanel])

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1">
        <ActivityBar />
        <Sidebar />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <EditorArea />
          {terminalPanelOpen && <TerminalPanel />}
        </div>
        {aiPanelOpen && <AIPanel />}
      </div>
      <StatusBar />
    </div>
  )
}
