/**
 * Paths that may contain credentials / machine-local secrets.
 * Used by Read (and later Grep) for S3 exfiltration controls.
 */

const ALWAYS_DENY = [
  /(^|\/)\.codex\/\.agent-env\.captured$/i,
  /(^|\/)secrets\.enc\.json$/i,
]

const SECRET_ENV = /(^|\/)\.env(\..+)?$/i
const SECRET_KEY = /\.(pem|key)$/i

/** `.env.example` / `.env.sample` are templates — not treated as secrets. */
function isEnvTemplate(rel: string): boolean {
  return /(^|\/)\.env\.(example|sample|template)$/i.test(rel)
}

export function isAlwaysDenySecretPath(relativePath: string): boolean {
  const rel = relativePath.replace(/\\/g, '/')
  return ALWAYS_DENY.some((re) => re.test(rel))
}

export function isSecretPath(relativePath: string): boolean {
  const rel = relativePath.replace(/\\/g, '/')
  if (isAlwaysDenySecretPath(rel)) return true
  if (isEnvTemplate(rel)) return false
  if (SECRET_ENV.test(rel)) return true
  if (SECRET_KEY.test(rel)) return true
  return false
}

export type SecretReadPolicy = 'allow' | 'ask' | 'deny'

/**
 * Resolve read policy for a workspace-relative path.
 * - always-deny paths never leave `deny`
 * - other secrets use `defaultPolicy` (ask when trusted, deny when untrusted)
 */
export function secretReadDecision(
  relativePath: string,
  defaultPolicy: SecretReadPolicy,
): 'allow' | 'ask' | 'deny' {
  if (isAlwaysDenySecretPath(relativePath)) return 'deny'
  if (!isSecretPath(relativePath)) return 'allow'
  if (defaultPolicy === 'allow') return 'allow'
  return defaultPolicy
}
