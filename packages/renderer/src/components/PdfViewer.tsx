import { useEffect, useMemo, useRef, useState } from 'react'
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

export function PdfViewer({
  base64,
  mimeType = 'application/pdf',
  fileName,
}: {
  base64: string
  mimeType?: string
  fileName?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [pageCount, setPageCount] = useState(0)
  const [scale, setScale] = useState(1.25)

  const downloadUrl = useMemo(() => {
    try {
      const bytes = base64ToUint8Array(base64)
      const copy = new Uint8Array(bytes.byteLength)
      copy.set(bytes)
      return URL.createObjectURL(new Blob([copy.buffer], { type: mimeType }))
    } catch {
      return null
    }
  }, [base64, mimeType])

  useEffect(() => {
    return () => {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl)
    }
  }, [downloadUrl])

  useEffect(() => {
    let cancelled = false
    let pdf: PDFDocumentProxy | null = null

    const render = async () => {
      setLoading(true)
      setError(null)
      const host = containerRef.current
      if (!host) return
      host.replaceChildren()

      try {
        // pdf.js may transfer/detach the ArrayBuffer — pass a fresh copy.
        const data = base64ToUint8Array(base64)
        const task = getDocument({ data: data.slice() })
        pdf = await task.promise
        if (cancelled) return
        setPageCount(pdf.numPages)

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          if (cancelled) return
          const page = await pdf.getPage(pageNum)
          const viewport = page.getViewport({ scale })
          const canvas = document.createElement('canvas')
          canvas.width = Math.ceil(viewport.width)
          canvas.height = Math.ceil(viewport.height)
          canvas.style.display = 'block'
          canvas.style.margin = '0 auto 16px'
          canvas.style.maxWidth = '100%'
          canvas.style.height = 'auto'
          canvas.style.boxShadow = '0 1px 4px rgba(0,0,0,0.35)'
          canvas.style.background = '#fff'
          host.appendChild(canvas)
          const ctx = canvas.getContext('2d')
          if (!ctx) continue
          await page.render({ canvasContext: ctx, viewport, canvas }).promise
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'PDF の描画に失敗しました')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void render()
    return () => {
      cancelled = true
      void pdf?.destroy()
    }
  }, [base64, scale])

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#525659]">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-surface-border bg-surface-raised px-3 py-1.5 text-xs text-text-secondary">
        <span className="truncate">
          {fileName ?? 'PDF'}
          {pageCount > 0 ? ` · ${pageCount} ページ` : ''}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            className="rounded px-2 py-0.5 hover:bg-white/10"
            onClick={() => setScale((s) => Math.max(0.5, Math.round((s - 0.25) * 100) / 100))}
          >
            −
          </button>
          <span className="w-12 text-center">{Math.round(scale * 100)}%</span>
          <button
            type="button"
            className="rounded px-2 py-0.5 hover:bg-white/10"
            onClick={() => setScale((s) => Math.min(3, Math.round((s + 0.25) * 100) / 100))}
          >
            ＋
          </button>
          {downloadUrl && (
            <a href={downloadUrl} download={fileName ?? 'document.pdf'} className="text-accent hover:underline">
              ダウンロード
            </a>
          )}
        </div>
      </div>
      {error ? (
        <div className="flex flex-1 items-center justify-center bg-surface px-4 text-sm text-text-secondary">
          {error}
        </div>
      ) : (
        <div className="relative min-h-0 flex-1 overflow-auto p-4">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#525659]/80 text-sm text-white">
              PDF を読み込み中…
            </div>
          )}
          <div ref={containerRef} />
        </div>
      )}
    </div>
  )
}
