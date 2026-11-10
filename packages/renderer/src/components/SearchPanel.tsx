import { useMemo, useState } from 'react'
import type { SearchResult } from '@codex/shared'
import { useAppStore } from '@renderer/store/app-store'

export function SearchPanel() {
  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [showReplace, setShowReplace] = useState(false)
  const [results, setResults] = useState<SearchResult[]>([])
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [isSearching, setIsSearching] = useState(false)
  const [isReplacing, setIsReplacing] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [replaceMsg, setReplaceMsg] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)
  const openFile = useAppStore((s) => s.openFile)
  const indexStatus = useAppStore((s) => s.indexStatus)
  const workspace = useAppStore((s) => s.workspace)

  const grouped = useMemo(() => {
    const map = new Map<string, SearchResult[]>()
    for (const r of results) {
      const list = map.get(r.path) ?? []
      list.push(r)
      map.set(r.path, list)
    }
    return [...map.entries()].sort((a, b) =>
      (a[1][0]?.relativePath ?? a[0]).localeCompare(b[1][0]?.relativePath ?? b[0]),
    )
  }, [results])

  const fileCount = grouped.length
  const matchCount = results.length

  const handleSearch = async () => {
    if (!query.trim() || !workspace) return
    setIsSearching(true)
    setSearchError(null)
    setReplaceMsg(null)
    setSearched(true)
    try {
      const hits = await window.codex.index.search(query.trim())
      setResults(hits)
      setSelectedPaths(new Set(hits.map((h) => h.path)))
    } catch (err: unknown) {
      setSearchError(err instanceof Error ? err.message : '検索に失敗しました')
      setResults([])
      setSelectedPaths(new Set())
    } finally {
      setIsSearching(false)
    }
  }

  const handleReplace = async () => {
    if (!query.trim() || !workspace || selectedPaths.size === 0) return
    const ok = window.confirm(
      `${selectedPaths.size} ファイル内の「${query.trim()}」を置換します。よろしいですか？`,
    )
    if (!ok) return
    setIsReplacing(true)
    setSearchError(null)
    setReplaceMsg(null)
    try {
      const result = await window.codex.index.replace({
        query: query.trim(),
        replacement,
        paths: [...selectedPaths] })
      setReplaceMsg(
        `${result.filesChanged} ファイル / ${result.occurrences} 箇所を置換` +
          (result.errors.length ? `（エラー ${result.errors.length}）` : ''),
      )
      if (result.errors.length) {
        setSearchError(result.errors.slice(0, 5).join('\n'))
      }
      await handleSearch()
    } catch (err: unknown) {
      setSearchError(err instanceof Error ? err.message : '置換に失敗しました')
    } finally {
      setIsReplacing(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') void handleSearch()
  }

  const togglePath = (path: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const allSelected = fileCount > 0 && selectedPaths.size === fileCount

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
        {showReplace && (
          <input
            type="text"
            className="mt-1 w-full rounded border border-surface-border bg-surface px-2 py-1.5 text-sm text-text-primary focus:border-accent focus:outline-none"
            placeholder="置換後の文字列"
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        )}
        <div className="mt-1 flex items-center justify-between gap-2 text-xs text-text-muted">
          <span>
            {!workspace
              ? 'フォルダを開いてください'
              : indexStatus.state === 'indexing'
                ? `索引中... ${indexStatus.indexedFiles} files`
                : `${indexStatus.totalFiles} files`}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="text-text-secondary hover:underline"
              onClick={() => setShowReplace((v) => !v)}
            >
              {showReplace ? '置換を隠す' : '置換'}
            </button>
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
        {showReplace && (
          <button
            type="button"
            className="mt-1 w-full rounded bg-accent px-2 py-1 text-xs text-white disabled:opacity-50"
            disabled={isReplacing || !workspace || selectedPaths.size === 0 || !query.trim()}
            onClick={() => void handleReplace()}
          >
            {isReplacing ? '置換中...' : `選択ファイルを置換 (${selectedPaths.size})`}
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-2">
        {searchError && (
          <p className="mb-2 whitespace-pre-wrap text-xs text-red-400">{searchError}</p>
        )}
        {replaceMsg && <p className="mb-2 text-xs text-accent">{replaceMsg}</p>}
        {results.length === 0 ? (
          <p className="text-xs text-text-muted">
            {!workspace
              ? 'フォルダを開いてから検索してください'
              : searched
                ? '結果が見つかりませんでした'
                : '検索語を入力して Enter'}
          </p>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-text-muted">
              <span>
                {matchCount} 件 / {fileCount} ファイル
              </span>
              {showReplace && (
                <button
                  type="button"
                  className="text-accent hover:underline"
                  onClick={() => {
                    if (allSelected) setSelectedPaths(new Set())
                    else setSelectedPaths(new Set(grouped.map(([p]) => p)))
                  }}
                >
                  {allSelected ? '選択解除' : 'すべて選択'}
                </button>
              )}
            </div>
            {grouped.map(([path, hits]) => {
              const rel = hits[0]?.relativePath ?? path
              return (
                <div key={path} className="rounded border border-surface-border/60">
                  <div className="flex items-center gap-1 bg-white/5 px-2 py-1">
                    {showReplace && (
                      <input
                        type="checkbox"
                        checked={selectedPaths.has(path)}
                        onChange={() => togglePath(path)}
                        aria-label={`${rel} を置換対象にする`}
                      />
                    )}
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate text-left text-xs text-accent"
                      onClick={() => void openFile(path, rel.split('/').pop() ?? path)}
                    >
                      {rel}
                      <span className="ml-1 text-text-muted">({hits.length})</span>
                    </button>
                  </div>
                  <ul>
                    {hits.slice(0, 20).map((r, i) => (
                      <li key={`${r.path}:${r.line}:${i}`}>
                        <button
                          type="button"
                          className="block w-full truncate px-2 py-0.5 text-left text-[11px] text-text-secondary hover:bg-white/5"
                          onClick={() => void openFile(r.path, rel.split('/').pop() ?? r.path)}
                        >
                          <span className="text-text-muted">{r.line}:</span> {r.text.trim()}
                        </button>
                      </li>
                    ))}
                    {hits.length > 20 && (
                      <li className="px-2 py-0.5 text-[11px] text-text-muted">
                        …他 {hits.length - 20} 件
                      </li>
                    )}
                  </ul>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
