import { useCallback, useEffect, useState } from 'react'
import { IPC_EVENTS, type GitChange, type GitStatusSnapshot } from '@codex/shared'
import { useAppStore } from '@renderer/store/app-store'

function statusLabel(c: GitChange): string {
  if (c.index === '?' || c.workingTree === '?') return 'U'
  if (c.staged && c.unstaged) return `${c.index}${c.workingTree}`.trim()
  if (c.staged) return c.index
  return c.workingTree === ' ' ? c.index : c.workingTree
}

export function SourceControl() {
  const workspace = useAppStore((s) => s.workspace)
  const openFile = useAppStore((s) => s.openFile)
  const [status, setStatus] = useState<GitStatusSnapshot | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [branches, setBranches] = useState<string[]>([])

  const refresh = useCallback(async () => {
    if (!workspace) {
      setStatus(null)
      return
    }
    try {
      const snap = await window.codex.git.status()
      setStatus(snap)
      setError(snap.error && !snap.isRepo ? snap.error : null)
      if (snap.isRepo) {
        const list = await window.codex.git.branches()
        setBranches(list)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'git status failed')
    }
  }, [workspace])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    return window.codex.on(IPC_EVENTS.WORKSPACE_TREE_CHANGED, () => {
      void refresh()
    })
  }, [refresh])

  const staged = status?.changes.filter((c) => c.staged && !c.unstaged) ?? []
  const unstaged = status?.changes.filter((c) => c.unstaged && !c.staged) ?? []
  const both = status?.changes.filter((c) => c.staged && c.unstaged) ?? []

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作に失敗しました')
    } finally {
      setBusy(false)
    }
  }

  if (!workspace) {
    return <p className="p-3 text-sm text-text-secondary">フォルダを開いてください</p>
  }

  if (status && !status.isRepo) {
    return (
      <div className="p-3 text-sm text-text-secondary">
        <p>{status.error ?? 'Git リポジトリではありません'}</p>
        <button
          type="button"
          className="mt-2 text-accent underline"
          onClick={() => void refresh()}
        >
          再読込
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 p-2 text-sm">
      <div className="flex items-center justify-between gap-2 px-1">
        <select
          className="min-w-0 flex-1 truncate rounded border border-surface-border bg-surface px-1 py-0.5 text-xs"
          value={status?.branch ?? ''}
          disabled={busy || branches.length === 0}
          onChange={(e) => {
            const b = e.target.value
            if (!b || b === status?.branch) return
            if (!window.confirm(`ブランチ「${b}」に切り替えますか？`)) {
              void refresh()
              return
            }
            void run(async () => {
              const r = await window.codex.git.checkout(b)
              if (!r.success) throw new Error(r.message)
            })
          }}
        >
          {status?.branch ? (
            <option value={status.branch}>{status.branch}</option>
          ) : (
            <option value="">(branch)</option>
          )}
          {branches
            .filter((b) => b !== status?.branch)
            .map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
        </select>
        <button
          type="button"
          className="shrink-0 rounded px-1.5 py-0.5 text-[11px] text-text-secondary hover:bg-white/5"
          disabled={busy}
          onClick={() => void refresh()}
        >
          更新
        </button>
      </div>

      {status?.ahead || status?.behind ? (
        <p className="px-1 text-[11px] text-text-muted">
          {status.ahead ? `↑${status.ahead} ` : ''}
          {status.behind ? `↓${status.behind}` : ''}
        </p>
      ) : null}

      {error && (
        <p className="rounded border border-red-900/50 bg-red-950/40 px-2 py-1 text-xs text-red-300">
          {error}
        </p>
      )}

      <ChangeSection
        title="Staged"
        items={[...staged, ...both]}
        empty="ステージ済みの変更なし"
        actionLabel="Unstage"
        onAction={(paths) =>
          void run(async () => {
            await window.codex.git.unstage(paths)
          })
        }
        onOpen={(c) => void openFile(c.absolutePath, c.path.split('/').pop() ?? c.path)}
        busy={busy}
      />

      <ChangeSection
        title="Changes"
        items={unstaged}
        empty="未ステージの変更なし"
        actionLabel="Stage"
        onAction={(paths) =>
          void run(async () => {
            await window.codex.git.stage(paths)
          })
        }
        onOpen={(c) => void openFile(c.absolutePath, c.path.split('/').pop() ?? c.path)}
        busy={busy}
      />

      <div className="mt-2 border-t border-surface-border px-1 pt-2">
        <textarea
          className="w-full resize-none rounded border border-surface-border bg-surface px-2 py-1 text-xs"
          rows={3}
          placeholder="コミットメッセージ"
          value={message}
          disabled={busy}
          onChange={(e) => setMessage(e.target.value)}
        />
        <button
          type="button"
          className="mt-1 w-full rounded bg-accent px-2 py-1 text-xs text-white disabled:opacity-50"
          disabled={busy || !message.trim() || staged.length + both.length === 0}
          onClick={() =>
            void run(async () => {
              const r = await window.codex.git.commit(message)
              if (!r.success) throw new Error(r.message)
              setMessage('')
            })
          }
        >
          Commit
        </button>
      </div>
    </div>
  )
}

function ChangeSection({
  title,
  items,
  empty,
  actionLabel,
  onAction,
  onOpen,
  busy }: {
  title: string
  items: GitChange[]
  empty: string
  actionLabel: string
  onAction: (paths: string[]) => void
  onOpen: (c: GitChange) => void
  busy: boolean
}) {
  return (
    <div>
      <div className="flex items-center justify-between px-1 py-1">
        <span className="text-[11px] font-semibold uppercase text-text-secondary">
          {title} ({items.length})
        </span>
        {items.length > 0 && (
          <button
            type="button"
            className="text-[11px] text-accent disabled:opacity-50"
            disabled={busy}
            onClick={() => onAction(items.map((c) => c.absolutePath))}
          >
            {actionLabel} all
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <p className="px-1 text-[11px] text-text-muted">{empty}</p>
      ) : (
        <ul className="max-h-40 overflow-auto">
          {items.map((c) => (
            <li
              key={`${title}-${c.path}`}
              className="flex items-center gap-1 truncate px-1 py-0.5 hover:bg-white/5"
            >
              <span className="w-5 shrink-0 font-mono text-[10px] text-accent">
                {statusLabel(c)}
              </span>
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left text-xs"
                title={c.path}
                onClick={() => onOpen(c)}
              >
                {c.path}
              </button>
              <button
                type="button"
                className="shrink-0 text-[10px] text-text-secondary hover:text-text-primary"
                disabled={busy}
                onClick={() => onAction([c.absolutePath])}
              >
                {actionLabel}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
