import { useEffect } from 'react'
import type { FileNode } from '@codex/shared'
import { useAppStore } from '@renderer/store/app-store'

function FileTreeNode({
  node,
  depth = 0,
  activeTabPath,
}: {
  node: FileNode
  depth?: number
  activeTabPath: string | null
}) {
  const openFile = useAppStore((s) => s.openFile)
  const expanded = useAppStore((s) => Boolean(s.explorerExpanded[node.path]))
  const toggleExplorerDir = useAppStore((s) => s.toggleExplorerDir)

  const isDir = node.type === 'directory'
  const isActive = !isDir && node.path === activeTabPath
  const paddingLeft = 8 + depth * 12

  const handleClick = () => {
    if (isDir) {
      toggleExplorerDir(node.path)
    } else {
      void openFile(node.path, node.name)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        className={`flex w-full items-center gap-1 truncate py-0.5 text-left text-sm hover:bg-white/5 ${
          isActive ? 'bg-white/10 text-text-primary' : ''
        }`}
        style={{ paddingLeft }}
        title={node.path}
        aria-expanded={isDir ? expanded : undefined}
      >
        <span className="w-4 shrink-0 text-xs text-text-secondary">
          {isDir ? (expanded ? '▼' : '▶') : '📄'}
        </span>
        <span className="truncate">{node.name}</span>
      </button>
      {isDir &&
        expanded &&
        node.children?.map((child) => (
          <FileTreeNode
            key={child.path}
            node={child}
            depth={depth + 1}
            activeTabPath={activeTabPath}
          />
        ))}
    </div>
  )
}

export function Explorer() {
  const fileTree = useAppStore((s) => s.fileTree)
  const workspace = useAppStore((s) => s.workspace)
  const activeTabPath = useAppStore((s) => s.activeTabPath)
  const refreshFileTree = useAppStore((s) => s.refreshFileTree)
  const collapseExplorer = useAppStore((s) => s.collapseExplorer)

  useEffect(() => {
    if (!workspace) return
    void refreshFileTree()
  }, [workspace?.id, refreshFileTree])

  if (fileTree.length === 0) {
    return (
      <div className="p-4 text-sm text-text-secondary">
        {workspace ? 'No files found' : 'Open a folder to get started'}
      </div>
    )
  }

  return (
    <div className="py-1">
      <div className="flex items-center justify-between gap-2 px-3 py-1">
        <div className="truncate text-xs font-medium text-text-secondary">{workspace?.name}</div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => collapseExplorer()}
            className="rounded px-1.5 py-0.5 text-[11px] text-text-secondary hover:bg-white/5 hover:text-text-primary"
            title="すべて折りたたむ"
          >
            折る
          </button>
          <button
            type="button"
            onClick={() => void refreshFileTree()}
            className="rounded px-1.5 py-0.5 text-[11px] text-text-secondary hover:bg-white/5 hover:text-text-primary"
            title="Explorer を再読み込み"
          >
            更新
          </button>
        </div>
      </div>
      {fileTree.map((node) => (
        <FileTreeNode key={node.path} node={node} activeTabPath={activeTabPath} />
      ))}
    </div>
  )
}
