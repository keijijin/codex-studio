import { isValidElement, useEffect, useId, useRef, type ReactElement, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import mermaid from 'mermaid'

let mermaidInitialized = false

function ensureMermaid(): void {
  if (mermaidInitialized) return
  mermaid.initialize({
    startOnLoad: false,
    theme: 'dark',
    securityLevel: 'strict',
  })
  mermaidInitialized = true
}

function MermaidBlock({ chart }: { chart: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const renderId = useId().replace(/:/g, '')

  useEffect(() => {
    ensureMermaid()
    const container = containerRef.current
    if (!container) return

    let cancelled = false

    void (async () => {
      try {
        const { svg } = await mermaid.render(`mermaid-${renderId}`, chart.trim())
        if (!cancelled) {
          container.innerHTML = svg
        }
      } catch (error) {
        if (!cancelled) {
          container.innerHTML = `<pre class="mermaid-error">${String(error)}</pre>`
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [chart, renderId])

  return <div ref={containerRef} className="mermaid-diagram my-4 overflow-x-auto" />
}

function extractMermaidChart(children: ReactNode): string | null {
  if (typeof children === 'string') {
    return children.replace(/\n$/, '')
  }
  if (Array.isArray(children) && children.length === 1 && typeof children[0] === 'string') {
    return children[0].replace(/\n$/, '')
  }
  return null
}

interface MarkdownRendererProps {
  content: string
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        pre({ children }) {
          const child = isValidElement(children) ? (children as ReactElement<{ className?: string; children?: ReactNode }>) : null
          const className = child?.props?.className ?? ''
          if (className.includes('language-mermaid')) {
            const chart = extractMermaidChart(child?.props?.children)
            if (chart) {
              return <MermaidBlock chart={chart} />
            }
          }
          return <pre>{children}</pre>
        },
        table({ children }) {
          return (
            <div className="table-wrapper">
              <table>{children}</table>
            </div>
          )
        },
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className ?? '')
          if (match?.[1] === 'mermaid') {
            const chart = extractMermaidChart(children)
            if (chart) {
              return <MermaidBlock chart={chart} />
            }
          }
          const isBlock = Boolean(match)
          if (isBlock) {
            return (
              <code className={className} {...props}>
                {children}
              </code>
            )
          }
          return (
            <code className={className} {...props}>
              {children}
            </code>
          )
        },
      }}
    >
      {content}
    </ReactMarkdown>
  )
}
