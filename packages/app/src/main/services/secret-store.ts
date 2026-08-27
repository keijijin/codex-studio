import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { app, safeStorage } from 'electron'
import type { AppSettings } from '@codex/shared'

export type SecretKeyName =
  | 'openaiApiKey'
  | 'anthropicApiKey'
  | 'xaiApiKey'
  | 'runwayApiKey'
  | 'langfuseSecretKey'

export type SecretBag = Partial<Record<SecretKeyName, string>>

interface SecretsFile {
  v: 1
  /** base64 ciphertext per key */
  keys: Record<string, string>
}

const FILE_NAME = 'secrets.enc.json'

function secretsPath(): string {
  return join(app.getPath('userData'), FILE_NAME)
}

function readFile(): SecretsFile {
  const path = secretsPath()
  if (!existsSync(path)) return { v: 1, keys: {} }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as SecretsFile
    if (raw?.v !== 1 || typeof raw.keys !== 'object' || !raw.keys) {
      return { v: 1, keys: {} }
    }
    return raw
  } catch {
    return { v: 1, keys: {} }
  }
}

function writeFile(data: SecretsFile): void {
  const path = secretsPath()
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, 'utf-8')
}

export function isSecretEncryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

export function secretsFileExists(): boolean {
  return existsSync(secretsPath())
}

/** Decrypt all stored secrets (empty if encryption unavailable). */
export function loadPlainSecrets(): SecretBag {
  if (!isSecretEncryptionAvailable()) return {}
  const file = readFile()
  const out: SecretBag = {}
  for (const [name, b64] of Object.entries(file.keys)) {
    if (!b64) continue
    try {
      const plain = safeStorage.decryptString(Buffer.from(b64, 'base64'))
      if (plain) out[name as SecretKeyName] = plain
    } catch {
      console.warn(`[secret-store] failed to decrypt ${name}`)
    }
  }
  return out
}

/** Merge and encrypt secrets. Pass empty string to delete a key. */
export function savePlainSecrets(partial: SecretBag): void {
  if (!isSecretEncryptionAvailable()) {
    throw new Error('OS secret encryption is not available')
  }
  const file = readFile()
  for (const [name, value] of Object.entries(partial)) {
    if (value === undefined) continue
    if (value === '') {
      delete file.keys[name]
      continue
    }
    const buf = safeStorage.encryptString(value)
    file.keys[name] = Buffer.from(buf).toString('base64')
  }
  writeFile(file)
}

export function extractSecretsFromSettings(settings: AppSettings): SecretBag {
  return {
    openaiApiKey: settings.models.openaiApiKey,
    anthropicApiKey: settings.models.anthropicApiKey,
    xaiApiKey: settings.models.xaiApiKey,
    runwayApiKey: settings.video?.runwayApiKey,
    langfuseSecretKey: settings.langfuse?.secretKey,
  }
}

export function applySecretsToSettings(settings: AppSettings, secrets: SecretBag): AppSettings {
  return {
    ...settings,
    models: {
      ...settings.models,
      openaiApiKey: secrets.openaiApiKey ?? settings.models.openaiApiKey,
      anthropicApiKey: secrets.anthropicApiKey ?? settings.models.anthropicApiKey,
      xaiApiKey: secrets.xaiApiKey ?? settings.models.xaiApiKey,
    },
    video: {
      ...settings.video,
      runwayApiKey: secrets.runwayApiKey ?? settings.video?.runwayApiKey,
    },
    langfuse: {
      ...settings.langfuse,
      secretKey: secrets.langfuseSecretKey ?? settings.langfuse?.secretKey ?? '',
    },
  }
}

/** Remove API key fields before writing settings JSON to disk. */
export function stripSecretsForDisk(settings: AppSettings): AppSettings {
  return {
    ...settings,
    models: {
      ...settings.models,
      openaiApiKey: undefined,
      anthropicApiKey: undefined,
      xaiApiKey: undefined,
    },
    video: {
      ...settings.video,
      runwayApiKey: undefined,
    },
    langfuse: {
      ...settings.langfuse,
      secretKey: '',
    },
  }
}

export function hasPlaintextSecrets(settings: AppSettings): boolean {
  const s = extractSecretsFromSettings(settings)
  return Boolean(
    (s.openaiApiKey && s.openaiApiKey.length > 0) ||
      (s.anthropicApiKey && s.anthropicApiKey.length > 0) ||
      (s.xaiApiKey && s.xaiApiKey.length > 0) ||
      (s.runwayApiKey && s.runwayApiKey.length > 0) ||
      (s.langfuseSecretKey && s.langfuseSecretKey.length > 0),
  )
}

/**
 * One-shot: move plaintext keys from settings into OS-backed encrypted file.
 * Returns settings with secrets still populated in memory.
 */
export function migratePlaintextSecrets(settings: AppSettings): {
  settings: AppSettings
  migrated: boolean
} {
  if (!isSecretEncryptionAvailable()) {
    return { settings, migrated: false }
  }
  if (!hasPlaintextSecrets(settings)) {
    return { settings, migrated: false }
  }
  const fromSettings = extractSecretsFromSettings(settings)
  const existing = loadPlainSecrets()
  const toSave: SecretBag = { ...existing }
  for (const key of [
    'openaiApiKey',
    'anthropicApiKey',
    'xaiApiKey',
    'runwayApiKey',
    'langfuseSecretKey',
  ] as SecretKeyName[]) {
    const v = fromSettings[key]
    if (v && v.length > 0) toSave[key] = v
  }
  savePlainSecrets(toSave)
  const merged = applySecretsToSettings(stripSecretsForDisk(settings), loadPlainSecrets())
  return { settings: merged, migrated: true }
}
