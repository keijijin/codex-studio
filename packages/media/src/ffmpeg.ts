import { access, writeFile } from 'fs/promises'
import { constants } from 'fs'
import { join } from 'path'
import { spawn } from 'child_process'

export async function findFfmpeg(envPath?: string): Promise<string | null> {
  const candidates = [
    envPath,
    process.env.FFMPEG_PATH,
    'ffmpeg',
    '/opt/homebrew/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
    '/usr/bin/ffmpeg',
  ].filter(Boolean) as string[]

  for (const bin of candidates) {
    if (bin === 'ffmpeg') {
      const ok = await new Promise<boolean>((resolve) => {
        const child = spawn(bin, ['-version'], { stdio: 'ignore' })
        child.on('error', () => resolve(false))
        child.on('exit', (code) => resolve(code === 0))
      })
      if (ok) return bin
      continue
    }
    try {
      await access(bin, constants.X_OK)
      return bin
    } catch {
      // next
    }
  }
  return null
}

/** Probe media duration in seconds via ffprobe (same prefix as ffmpeg when possible). */
export async function probeMediaDurationSec(
  ffmpegBin: string,
  mediaPath: string,
  signal?: AbortSignal,
): Promise<number | null> {
  const ffprobe = ffmpegBin.replace(/ffmpeg(\.exe)?$/i, (_m, exe) =>
    exe ? 'ffprobe.exe' : 'ffprobe',
  )
  const candidates = [ffprobe, 'ffprobe', '/opt/homebrew/bin/ffprobe', '/usr/local/bin/ffprobe']
  for (const bin of candidates) {
    try {
      const duration = await new Promise<number | null>((resolve) => {
        const child = spawn(
          bin,
          [
            '-v',
            'error',
            '-show_entries',
            'format=duration',
            '-of',
            'default=noprint_wrappers=1:nokey=1',
            mediaPath,
          ],
          { stdio: ['ignore', 'pipe', 'ignore'] },
        )
        let out = ''
        child.stdout?.on('data', (d) => {
          out += String(d)
        })
        const onAbort = () => {
          child.kill('SIGTERM')
          resolve(null)
        }
        signal?.addEventListener('abort', onAbort, { once: true })
        child.on('error', () => {
          signal?.removeEventListener('abort', onAbort)
          resolve(null)
        })
        child.on('exit', (code) => {
          signal?.removeEventListener('abort', onAbort)
          if (code !== 0) {
            resolve(null)
            return
          }
          const n = Number.parseFloat(out.trim())
          resolve(Number.isFinite(n) && n > 0 ? n : null)
        })
      })
      if (duration != null) return duration
    } catch {
      // try next
    }
  }
  return null
}

function run(
  bin: string,
  args: string[],
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    child.stderr?.on('data', (d) => {
      stderr += String(d)
    })
    const onAbort = () => {
      child.kill('SIGTERM')
      reject(new Error('ffmpeg cancelled'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    child.on('error', (err) => {
      signal?.removeEventListener('abort', onAbort)
      reject(err)
    })
    child.on('exit', (code) => {
      signal?.removeEventListener('abort', onAbort)
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg failed (${code}): ${stderr.slice(-400)}`))
    })
  })
}

/**
 * Convert SVG to PNG. Prefers resvg (reliable); falls back to ffmpeg SVG decode.
 * Never substitutes a blank color frame — that silently destroyed slide content.
 */
export async function svgToPng(
  _ffmpeg: string,
  svgPath: string,
  pngPath: string,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) throw new Error('ffmpeg cancelled')
  try {
    const { renderSvgToPng } = await import('./svg-render')
    await renderSvgToPng(svgPath, pngPath)
    return
  } catch (resvgErr) {
    try {
      await run(
        _ffmpeg,
        ['-y', '-width', '1280', '-height', '720', '-i', svgPath, pngPath],
        signal,
      )
    } catch (ffmpegErr) {
      const a = resvgErr instanceof Error ? resvgErr.message : String(resvgErr)
      const b = ffmpegErr instanceof Error ? ffmpegErr.message : String(ffmpegErr)
      throw new Error(`SVG→PNG failed (resvg: ${a}; ffmpeg: ${b})`)
    }
  }
}

export async function imageAndAudioToClip(options: {
  ffmpeg: string
  imagePath: string
  audioPath?: string
  silentDurationSec: number
  outPath: string
  signal?: AbortSignal
}): Promise<void> {
  const { ffmpeg, imagePath, audioPath, silentDurationSec, outPath, signal } = options
  if (audioPath) {
    await run(
      ffmpeg,
      [
        '-y',
        '-loop',
        '1',
        '-i',
        imagePath,
        '-i',
        audioPath,
        '-c:v',
        'libx264',
        '-tune',
        'stillimage',
        '-c:a',
        'aac',
        '-pix_fmt',
        'yuv420p',
        '-shortest',
        '-vf',
        'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2',
        outPath,
      ],
      signal,
    )
    return
  }

  await run(
    ffmpeg,
    [
      '-y',
      '-loop',
      '1',
      '-i',
      imagePath,
      '-f',
      'lavfi',
      '-i',
      `anullsrc=r=44100:cl=stereo`,
      '-t',
      String(Math.max(1, silentDurationSec)),
      '-c:v',
      'libx264',
      '-tune',
      'stillimage',
      '-c:a',
      'aac',
      '-pix_fmt',
      'yuv420p',
      '-shortest',
      '-vf',
      'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2',
      outPath,
    ],
    signal,
  )
}

export async function normalizeVideoClip(options: {
  ffmpeg: string
  inputPath: string
  outPath: string
  durationSec?: number
  signal?: AbortSignal
}): Promise<void> {
  const args = [
    '-y',
    '-i',
    options.inputPath,
    '-c:v',
    'libx264',
    '-c:a',
    'aac',
    '-pix_fmt',
    'yuv420p',
    '-vf',
    'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2',
    '-r',
    '24',
  ]
  if (options.durationSec) {
    args.push('-t', String(options.durationSec))
  }
  args.push(options.outPath)
  await run(options.ffmpeg, args, options.signal)
}

export async function muxVideoAndAudio(options: {
  ffmpeg: string
  videoPath: string
  audioPath: string
  outPath: string
  signal?: AbortSignal
}): Promise<void> {
  await run(
    options.ffmpeg,
    [
      '-y',
      '-i',
      options.videoPath,
      '-i',
      options.audioPath,
      '-c:v',
      'copy',
      '-c:a',
      'aac',
      '-shortest',
      '-map',
      '0:v:0',
      '-map',
      '1:a:0',
      options.outPath,
    ],
    options.signal,
  )
}

export async function concatClips(options: {
  ffmpeg: string
  clipPaths: string[]
  listPath: string
  outPath: string
  signal?: AbortSignal
}): Promise<void> {
  const body = options.clipPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n')
  await writeFile(options.listPath, body, 'utf-8')
  await run(
    options.ffmpeg,
    [
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      options.listPath,
      '-c',
      'copy',
      options.outPath,
    ],
    options.signal,
  )
}

export function videoWorkDir(workspaceRoot: string, slug: string, outputDirRel = 'videos'): string {
  return join(workspaceRoot, outputDirRel, slug)
}
