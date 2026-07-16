import type { MouseEvent, ReactNode } from 'react'
import { IPC_CHANNELS } from '@codex/shared'
import { useAppStore } from '@renderer/store/app-store'

function isExternalHref(href: string): boolean {
  return /^https?:\/\//i.test(href) || href.startsWith('mailto:')
}

function isInPageAnchor(href: string): boolean {
  return href.startsWith('#')
}

interface MarkdownLinkProps {
  href?: string
  baseFilePath?: string
  children?: ReactNode
}

export function MarkdownLink({ href, baseFilePath, children }: MarkdownLinkProps) {
  const openFile = useAppStore((s) => s.openFile)
  const workspace = useAppStore((s) => s.workspace)

  if (!href) {
    return <span>{children}</span>
  }

  if (isInPageAnchor(href)) {
    return (
      <a href={href} className="markdown-link">
        {children}
      </a>
    )
  }

  if (isExternalHref(href)) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="markdown-link">
        {children}
      </a>
    )
  }

  const handleClick = async (event: MouseEvent) => {
    event.preventDefault()
    if (!workspace) return
    try {
      const resolved = await window.codex.invoke(IPC_CHANNELS.FILE_RESOLVE, href, baseFilePath)
      const name = resolved.split(/[/\\]/).pop() ?? resolved
      await openFile(resolved, name)
    } catch (err) {
      console.error('[markdown] failed to open link:', href, err)
    }
  }

  return (
    <a
      href={href}
      className="markdown-link cursor-pointer"
      onClick={(event) => void handleClick(event)}
    >
      {children}
    </a>
  )
}
