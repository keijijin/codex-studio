import { writeFile, mkdir } from 'fs/promises'
import { dirname, join } from 'path'
import type { VideoProviderClipResult } from './types'

const RUNWAY_BASE = 'https://api.dev.runwayml.com'
const RUNWAY_VERSION = '2024-11-06'

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t)
        reject(new Error('Runway cancelled'))
      },
      { once: true },
    )
  })
}

/**
 * Generate a short clip via Runway text_to_video (gen4.5 by default).
 * Falls back with thrown errors for the pipeline to demote to slides.
 */
export async function generateRunwayClip(options: {
  apiKey: string
  prompt: string
  outDir: string
  fileBase: string
  model?: string
  durationSec?: number
  ratio?: string
  signal?: AbortSignal
}): Promise<VideoProviderClipResult> {
  const model = options.model || 'gen4.5'
  const duration = Math.min(10, Math.max(2, Math.round(options.durationSec ?? 5)))
  const ratio = options.ratio || '1280:720'

  const createRes = await fetch(`${RUNWAY_BASE}/v1/text_to_video`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
      'X-Runway-Version': RUNWAY_VERSION,
    },
    body: JSON.stringify({
      model,
      promptText: options.prompt.slice(0, 1000),
      ratio,
      duration,
    }),
    signal: options.signal,
  })

  if (!createRes.ok) {
    const text = await createRes.text().catch(() => '')
    throw new Error(`Runway create failed (${createRes.status}): ${text.slice(0, 240)}`)
  }

  const created = (await createRes.json()) as { id?: string }
  const jobId = created.id
  if (!jobId) throw new Error('Runway create returned no task id')

  const deadline = Date.now() + 6 * 60_000
  let outputUrl: string | undefined

  while (Date.now() < deadline) {
    if (options.signal?.aborted) throw new Error('Runway cancelled')
    await sleep(5000, options.signal)

    const statusRes = await fetch(`${RUNWAY_BASE}/v1/tasks/${jobId}`, {
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        'X-Runway-Version': RUNWAY_VERSION,
      },
      signal: options.signal,
    })
    if (!statusRes.ok) {
      const text = await statusRes.text().catch(() => '')
      throw new Error(`Runway poll failed (${statusRes.status}): ${text.slice(0, 200)}`)
    }

    const task = (await statusRes.json()) as {
      status?: string
      failure?: string
      output?: string[] | string
    }

    if (task.status === 'FAILED' || task.status === 'CANCELLED') {
      throw new Error(`Runway task ${task.status}: ${task.failure ?? 'unknown'}`)
    }
    if (task.status === 'SUCCEEDED') {
      const out = task.output
      outputUrl = Array.isArray(out) ? out[0] : typeof out === 'string' ? out : undefined
      break
    }
  }

  if (!outputUrl) throw new Error('Runway task timed out')

  const videoRes = await fetch(outputUrl, { signal: options.signal })
  if (!videoRes.ok) throw new Error(`Runway download failed (${videoRes.status})`)
  const buf = Buffer.from(await videoRes.arrayBuffer())

  await mkdir(options.outDir, { recursive: true })
  const localPath = join(options.outDir, `${options.fileBase}.mp4`)
  await writeFile(localPath, buf)
  await writeFile(
    join(dirname(localPath), `${options.fileBase}.runway.json`),
    JSON.stringify({ jobId, outputUrl, model }, null, 2),
    'utf-8',
  )

  return { localPath, remoteUrl: outputUrl, jobId }
}
