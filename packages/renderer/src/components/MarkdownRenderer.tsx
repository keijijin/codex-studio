import { isValidElement, useEffect, useId, useRef, type ReactElement, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import mermaid from 'mermaid'
import { MarkdownLink } from './MarkdownLink'

let mermaidInitialized = false
let mermaidRenderSeq = 0

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

    const trimmed = chart.trim()
    if (!trimmed) return

    let cancelled = false
    const timer = window.setTimeout(() => {
      void (async () => {
        const id = `mermaid-${renderId}-${++mermaidRenderSeq}`
        try {
          const { svg } = await mermaid.render(id, trimmed)
          if (!cancelled) {
            container.innerHTML = svg
          }
        } catch (error) {
          if (!cancelled) {
            container.innerHTML = `<pre class="mermaid-error">${String(error)}</pre>`
          }
        }
      })()
    }, 200)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
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
  /** Absolute path of the markdown file being previewed (for relative links). */
  baseFilePath?: string
  /** When false, mermaid fences stay as code blocks (safer while streaming). */
  enableMermaid?: boolean
}

export function MarkdownRenderer({
  content,
  baseFilePath,
  enableMermaid = true,
}: MarkdownRendererProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a({ href, children }) {
          return (
            <MarkdownLink href={href} baseFilePath={baseFilePath}>
              {children}
            </MarkdownLink>
          )
        },
        pre({ children }) {
          const child = isValidElement(children)
            ? (children as ReactElement<{ className?: string; children?: ReactNode }>)
            : null
          const className = child?.props?.className ?? ''
          if (enableMermaid && className.includes('language-mermaid')) {
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
          if (enableMermaid && match?.[1] === 'mermaid') {
            const chart = extractMermaidChart(children)
            if (chart) {
              return <MermaidBlock chart={chart} />
            }
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
