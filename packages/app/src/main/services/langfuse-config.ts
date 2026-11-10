import { DEFAULT_LANGFUSE, type AppSettings, type LangfuseSettings } from '@codex/shared'

/** Strip whitespace, wrapping quotes (incl. curly), and trailing slash. */
export function normalizeLangfuseBaseUrl(raw: string | undefined | null): string {
  const trimmed = (raw ?? '').trim().replace(/^["'`“”‘’]+|["'`“”‘’]+$/g, '')
  return (trimmed || DEFAULT_LANGFUSE.baseUrl).replace(/\/$/, '')
}

/** Resolve Langfuse settings with env overrides (no I/O). */
export function resolveLangfuseConfig(
  fromSettings?: LangfuseSettings | null,
): LangfuseSettings {
  const envPublic = process.env.LANGFUSE_PUBLIC_KEY?.trim()
  const envSecret = process.env.LANGFUSE_SECRET_KEY?.trim()
  const envBase =
    process.env.LANGFUSE_BASE_URL?.trim() ||
    process.env.LANGFUSE_HOST?.trim() ||
    process.env.LANGFUSE_BASEURL?.trim()

  const publicKey = (fromSettings?.publicKey || envPublic || '').trim()
  const secretKey = (fromSettings?.secretKey || envSecret || '').trim()
  const baseUrl = normalizeLangfuseBaseUrl(
    envBase || fromSettings?.baseUrl || DEFAULT_LANGFUSE.baseUrl,
  )

  return {
    enabled: Boolean(fromSettings?.enabled) || Boolean(envPublic && envSecret),
    publicKey,
    secretKey,
    baseUrl,
  }
}

export function isLangfuseConfigured(settings?: AppSettings): boolean {
  const cfg = resolveLangfuseConfig(settings?.langfuse)
  return Boolean(cfg.enabled && cfg.publicKey && cfg.secretKey)
}

/** Cloud project keys never authenticate against a self-hosted / wrong-region host. */
export function langfuseHostHint(cfg: LangfuseSettings): string | null {
  const isLocal =
    /localhost|127\.0\.0\.1/.test(cfg.baseUrl) || cfg.baseUrl.includes(':3000')
  const looksCloudKey = cfg.publicKey.startsWith('pk-lf-') || cfg.secretKey.startsWith('sk-lf-')
  if (looksCloudKey && isLocal) {
    return (
      'Langfuse Cloud のキーを使っていますが Base URL がローカルです。' +
      '設定の Base URL をキー発行元に合わせてください（日本リージョン例: https://jp.cloud.langfuse.com）。'
    )
  }
  return null
}
