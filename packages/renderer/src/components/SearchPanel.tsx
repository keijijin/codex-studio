import { useState } from 'react'
import { IPC_CHANNELS } from '@codex/shared'
import type { SearchResult } from '@codex/shared'
import { useAppStore } from '@renderer/store/app-store'

export function SearchPanel() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)
  const openFile = useAppStore((s) => s.openFile)
  const indexStatus = useAppStore((s) => s.indexStatus)
  const workspace = useAppStore((s) => s.workspace)

  const handleSearch = async () => {
    if (!query.trim() || !workspace) return
    setIsSearching(true)
    setSearchError(null)
    setSearched(true)
    try {
      const hits = await window.codex.invoke(IPC_CHANNELS.INDEX_SEARCH, query.trim())
      setResults(hits)
    } catch (err: unknown) {
      setSearchError(err instanceof Error ? err.message : '検索に失敗しました')
      setResults([])
    } finally {
      setIsSearching(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') void handleSearch()
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-surface-border p-2">
        <input
          type="text"
          className="w-full rounded border border-surface-border bg-surface px-2 py-1.5 text-sm text-text-primary focus:border-accent focus:outline-none"
          placeholder="ワークスペース内を検索..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="mt-1 flex items-center justify-between text-xs text-text-muted">
          <span>
            {!workspace
              ? 'フォルダを開いてください'
              : indexStatus.state === 'indexing'
                ? `索引中... ${indexStatus.indexedFiles} files`
                : `${indexStatus.totalFiles} files`}
          </span>
          <button
            type="button"
            onClick={() => void handleSearch()}
            disabled={isSearching || !workspace}
            className="text-accent hover:underline disabled:opacity-50"
          >
            {isSearching ? '検索中...' : 'Search'}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-2">
        {searchError && (
          <p className="mb-2 text-xs text-red-400">{searchError}</p>
        )}
        {results.length === 0 ? (
          <p className="text-xs text-text-muted">
            {!workspace
              ? 'フォルダを開いてから検索してください'
              : searched
                ? '結果が見つかりませんでした'
                : '検索語を入力して Enter'}
          </p>
        ) : (
          <div className="space-y-1">
            <p className="mb-2 text-xs text-text-muted">{results.length} 件</p>
            {results.map((r, i) => (
              <button
                key={`${r.path}:${r.line}:${i}`}
                type="button"
                className="block w-full rounded px-2 py-1.5 text-left hover:bg-white/5"
                onClick={() => void openFile(r.path, r.relativePath.split('/').pop() ?? r.path)}
              >
                <div className="truncate text-xs text-accent">{r.relativePath}:{r.line}</div>
                <div className="truncate text-xs text-text-secondary">{r.text}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
