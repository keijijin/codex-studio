import { useEffect, useState } from 'react'
import { useAppStore } from '@renderer/store/app-store'

const COMPLETED_HOLD_MS = 12_000

function elapsedLabel(startedAt: number): string {
  const sec = Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}m${String(s).padStart(2, '0')}s`
}

/** Re-render about once per second while `active`. */
function useElapsedTick(active: boolean): number {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => setTick((n) => n + 1), 1000)
    return () => window.clearInterval(id)
  }, [active])
  return tick
}

/**
 * Sticky banner so users can tell whether the agent is still working.
 */
export function AiRunStatus() {
  const isStreaming = useAppStore((s) => s.isStreaming)
  const runPhase = useAppStore((s) => s.runPhase)
  const runPhaseAt = useAppStore((s) => s.runPhaseAt)
  const streamingContent = useAppStore((s) => s.streamingContent)
  const streamingToolCalls = useAppStore((s) => s.streamingToolCalls)
  const teamStage = useAppStore((s) => s.teamStage)
  const pendingApproval = useAppStore((s) => s.pendingApproval)
  const pendingCeoApproval = useAppStore((s) => s.pendingCeoApproval)
  const chatError = useAppStore((s) => s.chatError)
  const lastTrace = useAppStore((s) => s.lastTrace)
  useElapsedTick(isStreaming || runPhase === 'running')

  useEffect(() => {
    if (runPhase !== 'completed' && runPhase !== 'cancelled') return
    const t = window.setTimeout(() => {
      const s = useAppStore.getState()
      if (s.runPhase === 'completed' || s.runPhase === 'cancelled') {
        useAppStore.setState({ runPhase: 'idle' })
      }
    }, COMPLETED_HOLD_MS)
    return () => window.clearTimeout(t)
  }, [runPhase, runPhaseAt])

  if (runPhase === 'idle' && !isStreaming) return null

  if (isStreaming || runPhase === 'running') {
    const runningTools = streamingToolCalls.filter((t) => t.status === 'running')
    const detail = pendingCeoApproval
      ? '社長承認待ち'
      : pendingApproval
        ? `承認待ち · ${pendingApproval.tool}`
        : teamStage
          ? `Team · ${teamStage.stage}`
          : runningTools.length > 0
            ? `ツール実行中 · ${runningTools.map((t) => t.name).join(', ')}`
            : streamingContent.trim()
              ? '応答を生成中…'
              : 'モデル応答待ち…（ローカル LLM は数十秒かかることがあります）'

    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-2 border-b border-amber-700/50 bg-amber-950/40 px-3 py-1.5 text-xs text-amber-100"
      >
        <span
          className="inline-block h-2 w-2 shrink-0 animate-pulse rounded-full bg-amber-400"
          aria-hidden
        />
        <span className="font-medium">実行中</span>
        <span className="min-w-0 flex-1 truncate text-amber-200/90">{detail}</span>
        {runPhaseAt > 0 && (
          <span className="shrink-0 tabular-nums text-amber-200/70">{elapsedLabel(runPhaseAt)}</span>
        )}
      </div>
    )
  }

  if (runPhase === 'error') {
    return (
      <div
        role="status"
        aria-live="assertive"
        className="flex items-center gap-2 border-b border-red-800/60 bg-red-950/50 px-3 py-1.5 text-xs text-red-200"
      >
        <span className="font-medium">エラーで終了</span>
        <span className="min-w-0 flex-1 truncate">{chatError ?? '失敗しました'}</span>
      </div>
    )
  }

  if (runPhase === 'cancelled') {
    return (
      <div
        role="status"
        className="flex items-center gap-2 border-b border-surface-border bg-surface px-3 py-1.5 text-xs text-text-secondary"
      >
        <span className="font-medium">中断しました</span>
      </div>
    )
  }

  const tools = typeof lastTrace?.toolCount === 'number' ? lastTrace.toolCount : null
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 border-b border-emerald-800/50 bg-emerald-950/35 px-3 py-1.5 text-xs text-emerald-100"
    >
      <span className="font-medium">完了</span>
      <span className="min-w-0 flex-1 truncate text-emerald-200/90">
        応答が確定しました
        {tools != null ? ` · ツール ${tools} 件` : ''}
        {lastTrace?.model ? ` · ${lastTrace.model}` : ''}
      </span>
    </div>
  )
}
