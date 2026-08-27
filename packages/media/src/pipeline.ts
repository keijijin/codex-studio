import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { buildShotlist } from './director'
import {
  concatClips,
  findFfmpeg,
  imageAndAudioToClip,
  muxVideoAndAudio,
  normalizeVideoClip,
  probeMediaDurationSec,
  svgToPng,
} from './ffmpeg'
import { generateRunwayClip } from './runway'
import { writeSlideSvg } from './slides'
import {
  DEFAULT_VIDEO_OUTPUT_DIR,
  resolveMediaOutput,
  resolveOutputSlug,
} from './output-paths'
import { synthesizeSpeech } from './tts'
import type { VideoPipelineOptions, VideoPipelineResult } from './types'

export async function runVideoPipeline(
  options: VideoPipelineOptions,
): Promise<VideoPipelineResult> {
  const warnings: string[] = []
  const progress = (msg: string) => options.onProgress?.(msg)

  const ffmpeg = await findFfmpeg()
  if (!ffmpeg) {
    return {
      success: false,
      outputDir: '',
      warnings,
      message:
        'ffmpeg が見つかりません。Homebrew 等で ffmpeg をインストールするか、FFMPEG_PATH を設定してください。',
    }
  }

  progress('Building shotlist…')
  let shotlist = options.shotlist
  if (!shotlist) {
    const built = await buildShotlist({
      markdown: options.markdown,
      mode: options.mode,
      maxShots: options.maxShots,
      maxGenerativeShots: options.maxGenerativeShots,
      openaiApiKey: options.openaiApiKey,
      signal: options.signal,
    })
    shotlist = built.shotlist
    if (!built.usedLlm && built.fallbackReason) {
      warnings.push(built.fallbackReason)
    }
  }

  const slug = resolveOutputSlug({
    slug: options.slug,
    title: shotlist.title,
    sourcePath: options.sourcePath,
    fallbackPrefix: 'video',
  })
  const { workDir: outputDir, artifactPath: outputMp4 } = resolveMediaOutput({
    workspaceRoot: options.workspaceRoot,
    outputDirRel: options.outputDir || DEFAULT_VIDEO_OUTPUT_DIR,
    slug,
    artifactFileName: `${slug}.mp4`,
  })
  const slidesDir = join(outputDir, 'slides')
  const audioDir = join(outputDir, 'audio')
  const clipsDir = join(outputDir, 'clips')
  await mkdir(slidesDir, { recursive: true })
  await mkdir(audioDir, { recursive: true })
  await mkdir(clipsDir, { recursive: true })

  const shotlistPath = join(outputDir, 'shotlist.json')
  await writeFile(shotlistPath, JSON.stringify(shotlist, null, 2), 'utf-8')

  const clipPaths: string[] = []
  let generativeCount = 0

  for (const shot of shotlist.shots) {
    if (options.signal?.aborted) {
      return {
        success: false,
        outputDir,
        shotlistPath,
        warnings,
        message: 'Cancelled',
      }
    }

    progress(`Rendering shot ${shot.id} (${shot.kind})…`)
    const voice = shotlist.voice || options.ttsVoice
    const audioPath = join(audioDir, `${shot.id}.mp3`)
    const speech = await synthesizeSpeech({
      text: shot.narration,
      outPath: audioPath,
      openaiApiKey: options.openaiApiKey,
      voice,
      provider: options.ttsProvider,
      signal: options.signal,
    })
    if (speech.silent) {
      warnings.push(`Shot ${shot.id}: TTS unavailable — silent segment`)
    } else {
      const audioDur = await probeMediaDurationSec(ffmpeg, audioPath, options.signal)
      if (audioDur != null) {
        shot.durationSec = Math.min(16, Math.max(3, Math.ceil(audioDur + 0.35)))
      }
    }

    const outClip = join(clipsDir, `${shot.id}.mp4`)
    let kind = shot.kind

    if (kind === 'generative') {
      generativeCount++
      const canRunway =
        Boolean(options.runwayApiKey) &&
        options.mode !== 'slides' &&
        generativeCount <= options.maxGenerativeShots

      if (canRunway && shot.runwayPrompt) {
        try {
          const clip = await generateRunwayClip({
            apiKey: options.runwayApiKey!,
            prompt: shot.runwayPrompt,
            outDir: join(clipsDir, 'runway'),
            fileBase: shot.id,
            model: options.runwayModel,
            durationSec: shot.durationSec,
            signal: options.signal,
          })
          const normalized = join(clipsDir, `${shot.id}.norm.mp4`)
          await normalizeVideoClip({
            ffmpeg,
            inputPath: clip.localPath,
            outPath: normalized,
            durationSec: shot.durationSec,
            signal: options.signal,
          })
          if (!speech.silent) {
            try {
              await muxVideoAndAudio({
                ffmpeg,
                videoPath: normalized,
                audioPath,
                outPath: outClip,
                signal: options.signal,
              })
            } catch {
              await normalizeVideoClip({
                ffmpeg,
                inputPath: normalized,
                outPath: outClip,
                signal: options.signal,
              })
              warnings.push(`Shot ${shot.id}: could not mux narration onto Runway clip`)
            }
          } else {
            await normalizeVideoClip({
              ffmpeg,
              inputPath: normalized,
              outPath: outClip,
              signal: options.signal,
            })
          }
          clipPaths.push(outClip)
          continue
        } catch (err) {
          warnings.push(
            `Shot ${shot.id}: Runway failed (${err instanceof Error ? err.message : String(err)}) — slide fallback`,
          )
          kind = 'slide'
        }
      } else {
        if (!options.runwayApiKey) {
          warnings.push(`Shot ${shot.id}: no Runway API key — slide fallback`)
        }
        kind = 'slide'
      }
    }

    // title / slide path
    const svgPath = join(slidesDir, `${shot.id}.svg`)
    const pngPath = join(slidesDir, `${shot.id}.png`)
    await writeSlideSvg({ ...shot, kind }, svgPath)
    await svgToPng(ffmpeg, svgPath, pngPath, options.signal)
    await imageAndAudioToClip({
      ffmpeg,
      imagePath: pngPath,
      audioPath: speech.silent ? undefined : audioPath,
      silentDurationSec: shot.durationSec,
      outPath: outClip,
      signal: options.signal,
    })
    clipPaths.push(outClip)
  }

  if (clipPaths.length === 0) {
    return {
      success: false,
      outputDir,
      shotlistPath,
      warnings,
      message: 'No clips were produced',
    }
  }

  progress('Concatenating…')
  const listPath = join(clipsDir, 'concat.txt')
  await concatClips({
    ffmpeg,
    clipPaths,
    listPath,
    outPath: outputMp4,
    signal: options.signal,
  })

  // Persist final durations (synced to TTS) and intent for debugging / re-edit
  await writeFile(shotlistPath, JSON.stringify(shotlist, null, 2), 'utf-8')

  return {
    success: true,
    outputDir,
    outputMp4,
    shotlistPath,
    warnings,
    message: `Video written to ${outputMp4}${warnings.length ? ` (${warnings.length} warning(s))` : ''}`,
  }
}
