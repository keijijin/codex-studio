import { useEffect } from 'react'
import { ActivityBar } from './ActivityBar'
import { Sidebar } from './Sidebar'
import { EditorArea } from './EditorArea'
import { AIPanel } from './AIPanel'
import { ApprovalDialog } from './ApprovalDialog'
import { CeoApprovalDialog } from './CeoApprovalDialog'
import { StatusBar } from './StatusBar'
import { TerminalPanel } from './TerminalPanel'
import { useAppStore } from '@renderer/store/app-store'

export function Layout() {
  const aiPanelOpen = useAppStore((s) => s.aiPanelOpen)
  const terminalPanelOpen = useAppStore((s) => s.terminalPanelOpen)
  const pendingApproval = useAppStore((s) => s.pendingApproval)
  const pendingCeoApproval = useAppStore((s) => s.pendingCeoApproval)
  const respondApproval = useAppStore((s) => s.respondApproval)
  const respondCeoApproval = useAppStore((s) => s.respondCeoApproval)
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
      {/* Approvals must stay mounted even when the AI panel is closed */}
      {pendingApproval && (
        <ApprovalDialog
          request={pendingApproval}
          onRespond={(approved) => void respondApproval(approved)}
        />
      )}
      {pendingCeoApproval && (
        <CeoApprovalDialog
          request={pendingCeoApproval}
          onRespond={(decision, note) => void respondCeoApproval(decision, note)}
        />
      )}
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
