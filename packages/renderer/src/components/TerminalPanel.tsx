import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { IPC_CHANNELS, IPC_EVENTS } from '@codex/shared'
import { hasCodexApi } from '@renderer/components/ErrorBoundary'
import { useAppStore } from '@renderer/store/app-store'

const TERMINAL_THEME = {
  background: '#1e1e1e',
  foreground: '#cccccc',
  cursor: '#cccccc',
  selectionBackground: '#264f78',
}

export function TerminalPanel() {
  const workspace = useAppStore((s) => s.workspace)
  const toggleTerminalPanel = useAppStore((s) => s.toggleTerminalPanel)
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalIdRef = useRef<string | null>(null)
  const [containerReady, setContainerReady] = useState(false)
  const [syncStatus, setSyncStatus] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)

  const syncEnvToAgent = async () => {
    const id = terminalIdRef.current
    if (!id || !hasCodexApi()) return
    setSyncing(true)
    setSyncStatus(null)
    try {
      const result = await window.codex.invoke(IPC_CHANNELS.TERMINAL_CAPTURE_ENV, id)
      setSyncStatus(`Agent に同期済み (${result.keyCount} 変数)`)
    } catch (err) {
      setSyncStatus(`同期失敗: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSyncing(false)
    }
  }

  useEffect(() => {
    if (!hasCodexApi() || !workspace || !containerReady || !containerRef.current) {
      return
    }

    const container = containerRef.current
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: TERMINAL_THEME,
      scrollback: 5000,
    })
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(container)

    let disposed = false

    const fitAndResize = () => {
      if (disposed || !containerRef.current) return
      if (containerRef.current.clientWidth === 0 || containerRef.current.clientHeight === 0) {
        return
      }
      fitAddon.fit()
      const id = terminalIdRef.current
      if (id) {
        void window.codex.invoke(IPC_CHANNELS.TERMINAL_RESIZE, id, term.cols, term.rows)
      }
    }

    const resizeObserver = new ResizeObserver(() => {
      fitAndResize()
    })
    resizeObserver.observe(container)
    requestAnimationFrame(() => {
      fitAndResize()
    })

    const setup = async () => {
      try {
        const { id } = await window.codex.invoke(IPC_CHANNELS.TERMINAL_CREATE)
        if (disposed) {
          void window.codex.invoke(IPC_CHANNELS.TERMINAL_DESTROY, id)
          return
        }
        terminalIdRef.current = id
        fitAndResize()
        term.focus()
      } catch (err) {
        term.writeln(`\r\n\x1b[31mFailed to start terminal: ${String(err)}\x1b[0m`)
      }
    }

    void setup()

    const unsubscribeOutput = window.codex.on(IPC_EVENTS.TERMINAL_OUTPUT, ({ id, data }) => {
      if (id === terminalIdRef.current) {
        term.write(data)
      }
    })

    const unsubscribeExit = window.codex.on(IPC_EVENTS.TERMINAL_EXIT, ({ id, exitCode }) => {
      if (id === terminalIdRef.current) {
        term.writeln(`\r\n\x1b[33m[Process exited with code ${exitCode}]\x1b[0m`)
        terminalIdRef.current = null
      }
    })

    const dataDisposable = term.onData((data) => {
      const id = terminalIdRef.current
      if (id) {
        void window.codex.invoke(IPC_CHANNELS.TERMINAL_WRITE, id, data)
      }
    })

    return () => {
      disposed = true
      resizeObserver.disconnect()
      unsubscribeOutput()
      unsubscribeExit()
      dataDisposable.dispose()
      const id = terminalIdRef.current
      if (id) {
        void window.codex.invoke(IPC_CHANNELS.TERMINAL_DESTROY, id)
      }
      terminalIdRef.current = null
      term.dispose()
    }
  }, [workspace?.id, containerReady])

  return (
    <section className="flex h-64 min-h-48 shrink-0 flex-col border-t border-surface-border bg-[#1e1e1e]">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-surface-border bg-surface-raised px-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-xs font-medium text-text-primary">Terminal</span>
          {syncStatus && (
            <span className="truncate text-[11px] text-text-secondary" title={syncStatus}>
              {syncStatus}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-secondary">{workspace?.name ?? ''}</span>
          <button
            type="button"
            className="rounded px-2 py-0.5 text-xs text-text-secondary hover:bg-white/10 hover:text-text-primary disabled:opacity-40"
            onClick={() => void syncEnvToAgent()}
            disabled={syncing || !workspace}
            title="このターミナルの環境変数を Agent の Shell に同期（oc login や export した変数など）"
          >
            {syncing ? '同期中…' : '環境を Agent に同期'}
          </button>
          <button
            type="button"
            className="rounded px-2 py-0.5 text-xs text-text-secondary hover:bg-white/10 hover:text-text-primary"
            onClick={toggleTerminalPanel}
            title="Close terminal panel"
          >
            ×
          </button>
        </div>
      </div>
      <div
        ref={(node) => {
          containerRef.current = node
          setContainerReady(node !== null)
        }}
        className="min-h-0 flex-1 overflow-hidden p-1"
      />
    </section>
  )
}
