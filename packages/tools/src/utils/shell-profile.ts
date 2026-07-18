import { existsSync } from 'fs'
import { homedir } from 'os'
import { basename, join, posix } from 'path'

export type ProfileBootstrapOptions = {
  home?: string
  exists?: (path: string) => boolean
  platform?: NodeJS.Platform
}

export function shellBaseName(shell: string): string {
  return basename(shell).toLowerCase().replace(/\.exe$/, '')
}

export function isPowerShell(shell: string): boolean {
  const name = shellBaseName(shell)
  return name === 'powershell' || name === 'pwsh'
}

export function isCmd(shell: string): boolean {
  return shellBaseName(shell) === 'cmd'
}

export function isUnixLikeShell(shell: string): boolean {
  const name = shellBaseName(shell)
  return name === 'bash' || name === 'zsh' || name === 'sh' || name === 'fish'
}

/** Prefer a user-friendly interactive shell (PowerShell on Windows). */
export function defaultShell(platform: NodeJS.Platform = process.platform): string {
  if (platform === 'win32') {
    if (
      process.platform === 'win32' &&
      process.env.SHELL &&
      isUnixLikeShell(process.env.SHELL)
    ) {
      return process.env.SHELL
    }
    if (process.env.POWERSHELL) {
      return process.env.POWERSHELL
    }
    const comspec = process.env.ComSpec ?? process.env.COMSPEC
    if (comspec && isPowerShell(comspec)) {
      return comspec
    }
    return 'powershell.exe'
  }
  return process.env.SHELL ?? '/bin/bash'
}

/** Login shell so PATH / env from profile files are applied (Unix interactive terminals). */
export function shellArgs(
  shell: string,
  platform: NodeJS.Platform = process.platform,
): string[] {
  if (platform === 'win32') {
    if (isPowerShell(shell)) {
      return ['-NoLogo']
    }
    return []
  }
  if (isUnixLikeShell(shell) && shellBaseName(shell) !== 'fish') {
    return ['-l']
  }
  return []
}

function sourceIfExists(
  path: string,
  exists: (p: string) => boolean,
  style: 'unix' | 'powershell' | 'cmd',
): string | null {
  if (!exists(path)) return null
  if (style === 'powershell') {
    return `. "${path}"`
  }
  if (style === 'cmd') {
    return `call "${path}"`
  }
  return `source "${path}"`
}

/**
 * Command to inherit the user login environment (PATH, nvm, conda, etc.).
 * Adapts to Windows (PowerShell / cmd) and macOS/Linux (bash / zsh / fish).
 */
export function profileBootstrapCommand(
  shell: string,
  options: ProfileBootstrapOptions = {},
): string | null {
  const platform = options.platform ?? process.platform
  const home = options.home ?? homedir()
  const exists = options.exists ?? existsSync
  const name = shellBaseName(shell)

  if (platform === 'win32' || isPowerShell(shell) || isCmd(shell)) {
    if (isPowerShell(shell)) {
      const userHome = options.home ?? process.env.USERPROFILE ?? home
      const documents = join(userHome, 'Documents')
      const candidates = [
        join(documents, 'PowerShell', 'Microsoft.PowerShell_profile.ps1'),
        join(documents, 'WindowsPowerShell', 'Microsoft.PowerShell_profile.ps1'),
      ]
      const parts = candidates
        .map((p) => sourceIfExists(p, exists, 'powershell'))
        .filter((c): c is string => Boolean(c))
      if (parts.length === 0) {
        return 'if (Test-Path -LiteralPath $PROFILE) { . $PROFILE }'
      }
      return [...new Set(parts)].join('; ')
    }

    if (isCmd(shell)) {
      const userHome = options.home ?? process.env.USERPROFILE ?? home
      const candidates = [
        join(userHome, 'profile.cmd'),
        join(userHome, 'codex-studio-profile.cmd'),
      ]
      const parts = candidates
        .map((p) => sourceIfExists(p, exists, 'cmd'))
        .filter((c): c is string => Boolean(c))
      return parts.length > 0 ? [...new Set(parts)].join(' & ') : null
    }
  }

  const unixJoin = platform === 'win32' ? join : posix.join
  const bashProfile = unixJoin(home, '.bash_profile')
  const bashrc = unixJoin(home, '.bashrc')
  const zprofile = unixJoin(home, '.zprofile')
  const zshrc = unixJoin(home, '.zshrc')
  const profile = unixJoin(home, '.profile')

  if (name === 'bash' || name === 'sh') {
    // Prefer login-style files, then bashrc (non-login interactive).
    // Source all that exist so PATH (profile) + aliases (bashrc) both apply.
    const parts = [
      sourceIfExists(bashProfile, exists, 'unix'),
      sourceIfExists(bashrc, exists, 'unix'),
      sourceIfExists(profile, exists, 'unix'),
    ].filter((c): c is string => Boolean(c))
    return parts.length > 0 ? [...new Set(parts)].join('; ') : null
  }

  if (name === 'zsh') {
    const parts = [
      sourceIfExists(zprofile, exists, 'unix'),
      sourceIfExists(zshrc, exists, 'unix'),
      // Many macOS setups still keep Homebrew / nvm PATH in bash_profile
      sourceIfExists(bashProfile, exists, 'unix'),
    ].filter((c): c is string => Boolean(c))
    return parts.length > 0 ? parts.join('; ') : null
  }

  if (name === 'fish') {
    const fishConfig = unixJoin(home, '.config', 'fish', 'config.fish')
    return sourceIfExists(fishConfig, exists, 'unix')
  }

  return (
    sourceIfExists(bashProfile, exists, 'unix') ??
    sourceIfExists(profile, exists, 'unix')
  )
}

/** Wrap a bootstrap command so it doesn't spam the terminal. */
export function quietBootstrapCommand(shell: string, command: string): string {
  if (isPowerShell(shell)) {
    return `& { ${command} } *> $null\r`
  }
  if (isCmd(shell)) {
    return `${command} >nul 2>&1\r`
  }
  return `${command} >/dev/null 2>&1\n`
}

export interface WrappedShellSpawn {
  /** Executable (bash / zsh / powershell / …) */
  file: string
  args: string[]
  /** User-facing command without profile preamble */
  displayCommand: string
  /** Which profile bootstrap was prepended (if any) */
  bootstrap: string | null
}

/**
 * Wrap a user command so login / interactive profile files are sourced first.
 * Use this for Agent Shell and Hooks — Electron's non-login PATH is often incomplete.
 */
export function wrapShellCommand(
  command: string,
  options: ProfileBootstrapOptions & { shell?: string } = {},
): WrappedShellSpawn {
  const platform = options.platform ?? process.platform
  const shell = options.shell ?? defaultShell(platform)
  const bootstrap = profileBootstrapCommand(shell, options)

  if (isPowerShell(shell)) {
    const body = bootstrap
      ? `& { ${bootstrap} } *> $null; ${command}`
      : command
    return {
      file: shell,
      args: ['-NoLogo', '-Command', body],
      displayCommand: command,
      bootstrap,
    }
  }

  if (isCmd(shell)) {
    const body = bootstrap
      ? `${bootstrap} >nul 2>&1 & ${command}`
      : command
    return {
      file: shell,
      args: ['/d', '/s', '/c', body],
      displayCommand: command,
      bootstrap,
    }
  }

  const body = bootstrap
    ? `${bootstrap} >/dev/null 2>&1; ${command}`
    : command
  return {
    file: shell,
    args: ['-c', body],
    displayCommand: command,
    bootstrap,
  }
}
