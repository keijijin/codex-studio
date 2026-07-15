import { useAppStore } from '@renderer/store/app-store'
import { SettingsButton } from './SettingsDialog'

export function ActivityBar() {
  const sidebarView = useAppStore((s) => s.sidebarView)
  const setSidebarView = useAppStore((s) => s.setSidebarView)
  const toggleAiPanel = useAppStore((s) => s.toggleAiPanel)
  const toggleTerminalPanel = useAppStore((s) => s.toggleTerminalPanel)
  const aiPanelOpen = useAppStore((s) => s.aiPanelOpen)
  const terminalPanelOpen = useAppStore((s) => s.terminalPanelOpen)

  const items = [
    { id: 'explorer' as const, icon: '📁', label: 'Explorer' },
    { id: 'search' as const, icon: '🔍', label: 'Search' },
    { id: 'terminal' as const, icon: '⌨️', label: 'Terminal' },
    { id: 'chat' as const, icon: '💬', label: 'AI Chat' },
  ]

  return (
    <nav className="flex w-12 flex-col items-center gap-1 border-r border-surface-border bg-[#333333] py-2">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          title={item.label}
          onClick={() => {
            if (item.id === 'chat') {
              toggleAiPanel()
            } else if (item.id === 'terminal') {
              toggleTerminalPanel()
            } else {
              setSidebarView(item.id)
            }
          }}
          className={`flex h-10 w-10 items-center justify-center rounded text-lg transition-colors hover:bg-white/10 ${
            (item.id === 'chat' && aiPanelOpen) ||
            (item.id === 'terminal' && terminalPanelOpen) ||
            (item.id !== 'chat' && item.id !== 'terminal' && sidebarView === item.id)
              ? 'border-l-2 border-accent bg-white/5'
              : ''
          }`}
        >
          {item.icon}
        </button>
      ))}
      <div className="flex-1" />
      <SettingsButton />
    </nav>
  )
}
