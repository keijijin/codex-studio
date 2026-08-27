import { useEffect } from 'react'
import { DEFAULT_KEYBINDINGS, IPC_CHANNELS, type KeybindingMap } from '@codex/shared'
import { useAppStore } from '@renderer/store/app-store'

function parseBinding(binding: string): { mod: boolean; shift: boolean; key: string } {
  const parts = binding.split('+').map((p) => p.trim())
  const key = parts[parts.length - 1]?.toLowerCase() ?? ''
  return {
    mod: parts.some((p) => p === 'Mod' || p === 'Cmd' || p === 'Ctrl'),
    shift: parts.some((p) => p === 'Shift'),
    key: key === '`' ? '`' : key,
  }
}

function matchEvent(e: KeyboardEvent, binding: string): boolean {
  const { mod, shift, key } = parseBinding(binding)
  const modPressed = e.metaKey || e.ctrlKey
  if (mod !== modPressed) return false
  if (shift !== e.shiftKey) return false
  const eventKey = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase()
  return eventKey === key || e.code.toLowerCase() === `key${key}` || e.code === 'Backquote' && key === '`'
}

export function useKeybindings(): void {
  const settings = useAppStore((s) => s.settings)
  const toggleAiPanel = useAppStore((s) => s.toggleAiPanel)
  const toggleTerminalPanel = useAppStore((s) => s.toggleTerminalPanel)
  const setSidebarView = useAppStore((s) => s.setSidebarView)
  const openWorkspace = useAppStore((s) => s.openWorkspace)
  const saveActiveFile = useAppStore((s) => s.saveActiveFile)
  const compactChat = useAppStore((s) => s.compactChat)

  useEffect(() => {
    const map: KeybindingMap = {
      ...DEFAULT_KEYBINDINGS,
      ...settings?.keybindings,
    }

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const typing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      if (typing && !matchEvent(e, map.saveFile)) return

      if (matchEvent(e, map.saveFile)) {
        e.preventDefault()
        void saveActiveFile()
      } else if (matchEvent(e, map.openFolder)) {
        e.preventDefault()
        void openWorkspace()
      } else if (matchEvent(e, map.toggleAiPanel)) {
        e.preventDefault()
        toggleAiPanel()
      } else if (matchEvent(e, map.toggleTerminal)) {
        e.preventDefault()
        toggleTerminalPanel()
      } else if (matchEvent(e, map.toggleSidebarSearch)) {
        e.preventDefault()
        setSidebarView('search')
      } else if (matchEvent(e, map.compactChat)) {
        e.preventDefault()
        void compactChat()
      } else if (matchEvent(e, map.checkUpdates)) {
        e.preventDefault()
        void window.codex.invoke(IPC_CHANNELS.UPDATER_CHECK)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    settings?.keybindings,
    toggleAiPanel,
    toggleTerminalPanel,
    setSidebarView,
    openWorkspace,
    saveActiveFile,
    compactChat,
  ])
}
