import { useState } from 'react'
import type { FileNode } from '@codex/shared'
import { useAppStore } from '@renderer/store/app-store'

function FileTreeNode({ node, depth = 0 }: { node: FileNode; depth?: number }) {
  const [expanded, setExpanded] = useState(depth < 2)
  const openFile = useAppStore((s) => s.openFile)

  const isDir = node.type === 'directory'
  const paddingLeft = 8 + depth * 12

  const handleClick = () => {
    if (isDir) {
      setExpanded(!expanded)
    } else {
      void openFile(node.path, node.name)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        className="flex w-full items-center gap-1 truncate py-0.5 text-left text-sm hover:bg-white/5"
        style={{ paddingLeft }}
        title={node.path}
      >
        <span className="w-4 shrink-0 text-xs text-text-secondary">
          {isDir ? (expanded ? '▼' : '▶') : '📄'}
        </span>
        <span className="truncate">{node.name}</span>
      </button>
      {isDir && expanded && node.children?.map((child) => (
        <FileTreeNode key={child.path} node={child} depth={depth + 1} />
      ))}
    </div>
  )
}

export function Explorer() {
  const fileTree = useAppStore((s) => s.fileTree)
  const workspace = useAppStore((s) => s.workspace)

  if (fileTree.length === 0) {
    return (
      <div className="p-4 text-sm text-text-secondary">
        {workspace ? 'No files found' : 'Open a folder to get started'}
      </div>
    )
  }

  return (
    <div className="py-1">
      <div className="px-3 py-1 text-xs font-medium text-text-secondary">{workspace?.name}</div>
      {fileTree.map((node) => (
        <FileTreeNode key={node.path} node={node} />
      ))}
    </div>
  )
}
