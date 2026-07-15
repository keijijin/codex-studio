import ReactMarkdown from 'react-markdown'

interface MarkdownPreviewProps {
  content: string
}

export function MarkdownPreview({ content }: MarkdownPreviewProps) {
  return (
    <div className="h-full min-h-0 overflow-y-auto bg-surface">
      <article className="markdown-body mx-auto max-w-3xl px-8 py-6">
        <ReactMarkdown>{content || '(空)'}</ReactMarkdown>
      </article>
    </div>
  )
}
