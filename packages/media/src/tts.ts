import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'

export async function synthesizeSpeech(options: {
  text: string
  outPath: string
  openaiApiKey?: string
  voice: string
  provider: 'openai' | 'none'
  signal?: AbortSignal
}): Promise<{ path: string; silent: boolean }> {
  await mkdir(join(options.outPath, '..'), { recursive: true })

  if (options.provider === 'openai' && options.openaiApiKey && options.text.trim()) {
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini-tts',
        voice: options.voice || 'alloy',
        input: options.text.slice(0, 4000),
        response_format: 'mp3',
      }),
      signal: options.signal,
    })

    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer())
      await writeFile(options.outPath, buf)
      return { path: options.outPath, silent: false }
    }

    // Fallback: try tts-1 if mini-tts unavailable
    const res2 = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        voice: options.voice || 'alloy',
        input: options.text.slice(0, 4000),
        response_format: 'mp3',
      }),
      signal: options.signal,
    })
    if (res2.ok) {
      const buf = Buffer.from(await res2.arrayBuffer())
      await writeFile(options.outPath, buf)
      return { path: options.outPath, silent: false }
    }
  }

  // Marker for silent — pipeline will generate silence with ffmpeg
  await writeFile(options.outPath.replace(/\.mp3$/i, '.silent'), '1', 'utf-8')
  return { path: options.outPath, silent: true }
}
