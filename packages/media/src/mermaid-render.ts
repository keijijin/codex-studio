import { mkdir, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { spawn } from 'child_process'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

function runProcess(
  command: string,
  args: string[],
  options?: { cwd?: string; signal?: AbortSignal },
): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options?.cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stderr = ''
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    const onAbort = () => {
      child.kill('SIGTERM')
    }
    options?.signal?.addEventListener('abort', onAbort, { once: true })
    child.on('error', (err) => {
      options?.signal?.removeEventListener('abort', onAbort)
      reject(err)
    })
    child.on('close', (code) => {
      options?.signal?.removeEventListener('abort', onAbort)
      resolve({ code, stderr })
    })
  })
}

function resolveMmdcEntry(): string | null {
  try {
    const pkgJson = require.resolve('@mermaid-js/mermaid-cli/package.json')
    const pkg = require(pkgJson) as { bin?: Record<string, string> | string }
    const binRel =
      typeof pkg.bin === 'string'
        ? pkg.bin
        : pkg.bin?.mmdc || Object.values(pkg.bin ?? {})[0]
    if (!binRel) return null
    return join(dirname(pkgJson), binRel)
  } catch {
    return null
  }
}

async function renderViaMmdc(
  mmdPath: string,
  outPng: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const entry = resolveMmdcEntry()
  if (!entry) return false
  const result = await runProcess(
    process.execPath,
    [entry, '-i', mmdPath, '-o', outPng, '-b', 'transparent', '-s', '2'],
    { signal },
  )
  return result.code === 0
}

/** mermaid.ink fallback (needs network). */
async function renderViaMermaidInk(
  code: string,
  outPng: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const encoded = Buffer.from(code, 'utf-8').toString('base64url')
  const url = `https://mermaid.ink/img/${encoded}`
  const res = await fetch(url, { signal })
  if (!res.ok) return false
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length < 100) return false
  await writeFile(outPng, buf)
  return true
}

function fallbackSvg(code: string): string {
  const preview = code
    .split('\n')
    .slice(0, 12)
    .map((l) => l.replace(/[<>&]/g, ''))
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <rect width="1280" height="720" fill="#1e1e1e"/>
  <text x="64" y="80" fill="#f87171" font-size="28" font-family="sans-serif">Mermaid diagram (render failed)</text>
  <foreignObject x="64" y="120" width="1152" height="520">
    <div xmlns="http://www.w3.org/1999/xhtml" style="color:#ccc;font:16px monospace;white-space:pre-wrap">${preview.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</div>
  </foreignObject>
</svg>`
}

/**
 * Render Mermaid source to a PNG suitable for PPTX embedding.
 * Prefers local @mermaid-js/mermaid-cli, then mermaid.ink, then a fallback SVG→PNG.
 */
export async function renderMermaidToPng(
  code: string,
  outPng: string,
  options?: { signal?: AbortSignal },
): Promise<{ method: 'mmdc' | 'mermaid.ink' | 'fallback' }> {
  await mkdir(dirname(outPng), { recursive: true })
  const mmdPath = outPng.replace(/\.png$/i, '.mmd')
  await writeFile(mmdPath, `${code.trim()}\n`, 'utf-8')

  try {
    if (await renderViaMmdc(mmdPath, outPng, options?.signal)) {
      return { method: 'mmdc' }
    }
  } catch {
    /* try next */
  }

  try {
    if (await renderViaMermaidInk(code.trim(), outPng, options?.signal)) {
      return { method: 'mermaid.ink' }
    }
  } catch {
    /* try next */
  }

  const svgPath = outPng.replace(/\.png$/i, '.fallback.svg')
  await writeFile(svgPath, fallbackSvg(code), 'utf-8')
  // Dynamic import: keep @resvg/resvg-js out of the Electron main startup graph.
  const { renderSvgToPng } = await import('./svg-render')
  await renderSvgToPng(svgPath, outPng, { width: 1280, height: 720 })
  return { method: 'fallback' }
}

/** True when a fenced block should be treated as a Mermaid diagram. */
export function isMermaidLanguage(lang: string | undefined): boolean {
  const k = (lang || '').trim().toLowerCase()
  return k === 'mermaid' || k === 'mmd'
}
