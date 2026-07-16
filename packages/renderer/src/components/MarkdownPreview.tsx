import { MarkdownRenderer } from './MarkdownRenderer'

interface MarkdownPreviewProps {
  content: string
  baseFilePath?: string
}

export function MarkdownPreview({ content, baseFilePath }: MarkdownPreviewProps) {
  return (
    <div className="h-full min-h-0 overflow-y-auto bg-surface">
      <article className="markdown-body mx-auto max-w-3xl px-8 py-6">
        <MarkdownRenderer content={content || '(空)'} baseFilePath={baseFilePath} />
      </article>
    </div>
  )
}
