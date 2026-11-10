import type { IpcMainInvokeEvent } from 'electron'
import { app } from 'electron'
import { resolve } from 'path'
import { pathToFileURL } from 'url'

function allowedRendererOrigins(): string[] {
  const origins: string[] = []
  const dev = process.env.ELECTRON_RENDERER_URL?.replace(/\/$/, '')
  if (dev) origins.push(dev)

  // Packaged / built renderer entry
  try {
    const indexHtml = resolve(app.getAppPath(), 'out/renderer/index.html')
    origins.push(pathToFileURL(indexHtml).href)
  } catch {
    // ignore
  }
  return origins
}

function isTrustedRendererUrl(url: string): boolean {
  if (!url || url === 'about:blank') return false
  const allowed = allowedRendererOrigins()
  for (const origin of allowed) {
    if (url === origin || url.startsWith(`${origin}#`) || url.startsWith(`${origin}?`)) {
      return true
    }
  }
  // Exact file:// match for built renderer (no substring/includes bypass).
  if (url.startsWith('file:')) {
    try {
      const indexHtml = resolve(app.getAppPath(), 'out/renderer/index.html')
      const expected = pathToFileURL(indexHtml).href
      if (url === expected || url.startsWith(`${expected}#`) || url.startsWith(`${expected}?`)) {
        return true
      }
    } catch {
      // ignore
    }
  }
  if (process.env.ELECTRON_RENDERER_URL) {
    const base = process.env.ELECTRON_RENDERER_URL.replace(/\/$/, '')
    if (url === base || url.startsWith(`${base}/`) || url.startsWith(`${base}?`) || url.startsWith(`${base}#`)) {
      return true
    }
  }
  return false
}

/** Reject IPC from navigated-away / attacker-controlled renderer documents. */
export function assertTrustedIpcSender(event: IpcMainInvokeEvent): void {
  const frameUrl = event.senderFrame?.url
  const senderUrl = (() => {
    try {
      return event.sender.getURL()
    } catch {
      return ''
    }
  })()
  const url = frameUrl || senderUrl
  if (!isTrustedRendererUrl(url)) {
    throw new Error(`Blocked IPC from untrusted renderer: ${url || '(empty)'}`)
  }
}
