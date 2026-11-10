import { basename, extname, join } from 'path'
import { slugifyTitle } from './shotlist'

/** Visible workspace folders for generated media (not under .codex). */
export const DEFAULT_PRESENTATION_OUTPUT_DIR = 'presentations'
export const DEFAULT_VIDEO_OUTPUT_DIR = 'videos'

export function resolveOutputSlug(options: {
  slug?: string
  title: string
  sourcePath: string
  fallbackPrefix: 'deck' | 'video'
}): string {
  if (options.slug?.trim()) {
    return slugifyTitle(options.slug.trim())
  }
  const fromTitle = slugifyTitle(options.title)
  if (fromTitle && !fromTitle.startsWith('video-') && !fromTitle.startsWith('deck-')) {
    return fromTitle
  }
  const fromFile = slugifyTitle(basename(options.sourcePath, extname(options.sourcePath)))
  if (fromFile && !fromFile.startsWith('video-') && !fromFile.startsWith('deck-')) {
    return fromFile
  }
  return fromTitle || `${options.fallbackPrefix}-${Date.now()}`
}

export function resolveMediaOutput(options: {
  workspaceRoot: string
  /** Relative to workspace, e.g. presentations / videos */
  outputDirRel: string
  slug: string
  /** Final artifact filename including extension */
  artifactFileName: string
}): { workDir: string; artifactPath: string; outputDirRel: string } {
  const rel = options.outputDirRel.replace(/^[/\\]+/, '').replace(/^\.codex[/\\]/, '')
  const safeRel =
    rel.trim() ||
    (options.artifactFileName.endsWith('.pptx')
      ? DEFAULT_PRESENTATION_OUTPUT_DIR
      : DEFAULT_VIDEO_OUTPUT_DIR)
  const workDir = join(options.workspaceRoot, safeRel, options.slug)
  return {
    workDir,
    artifactPath: join(workDir, options.artifactFileName),
    outputDirRel: safeRel,
  }
}
