import { useEffect, useMemo, useRef, useState } from 'react'
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
  type RenderTask,
} from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import pdfRendererUrl from 'pdfjs-dist/build/pdf.renderer.min.mjs?url'

GlobalWorkerOptions.workerSrc = pdfWorkerUrl
GlobalWorkerOptions.rendererSrc = pdfRendererUrl

/**
 * Asset dirs are copied verbatim (original filenames) by the Vite plugin
 * `copy-pdfjs-assets` into `pdfjs/{cmaps,standard_fonts,wasm}/`.
 * Do not use hashed `?url` samples for directory bases — production filenames diverge.
 */
const assetBase = import.meta.env.BASE_URL || '/'
const PDFJS_ASSETS = {
  wasmUrl: `${assetBase}pdfjs/wasm/`,
  standardFontDataUrl: `${assetBase}pdfjs/standard_fonts/`,
  cMapUrl: `${assetBase}pdfjs/cmaps/`,
  cMapPacked: true as const,
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function formatPdfError(err: unknown): string {
  if (!(err instanceof Error)) return 'PDF の描画に失敗しました'
  const msg = err.message || String(err)
  if (/wasm/i.test(msg) || /Unable to load/i.test(msg) || /Ensure that the/i.test(msg)) {
    return `PDF アセットの読み込みに失敗しました（${msg}）`
  }
  if (/worker/i.test(msg)) {
    return `PDF Worker の初期化に失敗しました（${msg}）`
  }
  return msg
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
      return URL.createObjectURL(new Blob([copy], { type: mimeType }))
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
    let loadingTask: PDFDocumentLoadingTask | null = null
    const renderTasks: RenderTask[] = []

    const render = async () => {
      setLoading(true)
      setError(null)
      const host = containerRef.current
      if (!host) return
      host.replaceChildren()

      try {
        // Fresh copy: pdf.js may transfer/detach the ArrayBuffer.
        const data = base64ToUint8Array(base64).slice()
        loadingTask = getDocument({
          data,
          ...PDFJS_ASSETS,
          useSystemFonts: true,
        })
        pdf = await loadingTask.promise
        if (cancelled) {
          await loadingTask.destroy()
          return
        }
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
          const task = page.render({ canvasContext: ctx, viewport, canvas })
          renderTasks.push(task)
          await task.promise
        }
      } catch (err) {
        if (!cancelled) {
          console.error('[PdfViewer]', err)
          setError(formatPdfError(err))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void render()
    return () => {
      cancelled = true
      for (const task of renderTasks) {
        try {
          task.cancel()
        } catch {
          // ignore
        }
      }
      if (loadingTask) {
        void loadingTask.destroy().catch(() => {})
      } else if (pdf) {
        void pdf.cleanup()
      }
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
        <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-surface px-4 text-sm text-text-secondary">
          <p className="max-w-lg text-center">{error}</p>
          {downloadUrl && (
            <a href={downloadUrl} download={fileName ?? 'document.pdf'} className="text-accent hover:underline">
              代わりにダウンロード
            </a>
          )}
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
