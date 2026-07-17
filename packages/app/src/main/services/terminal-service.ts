import { randomUUID } from 'crypto'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { basename, isAbsolute, join, relative, resolve } from 'path'
import type { WebContents } from 'electron'
import * as pty from 'node-pty'
import { IPC_EVENTS } from '@codex/shared'
import { workspaceService } from './workspace'

interface TerminalSession {
  pty: pty.IPty
  webContents: WebContents
}

export type ProfileBootstrapOptions = {
  home?: string
  exists?: (path: string) => boolean
  platform?: NodeJS.Platform
}

function shellBaseName(shell: string): string {
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
    // Git Bash only when we are actually running on Windows
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
    // Prefer PowerShell over cmd.exe (COMSPEC) for profile support
    return 'powershell.exe'
  }
  return process.env.SHELL ?? '/bin/bash'
}

/** Login shell so PATH / env from profile files are applied (Unix). */
export function shellArgs(
  shell: string,
  platform: NodeJS.Platform = process.platform,
): string[] {
  if (platform === 'win32') {
    // PowerShell: -NoLogo keeps startup quieter; profile is loaded via bootstrap.
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
 * Adapts to Windows (PowerShell / cmd) and macOS/Linux (bash / zsh).
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
      // CurrentUserCurrentHost profiles for Windows PowerShell 5 and PowerShell 7+
      const userHome = options.home ?? process.env.USERPROFILE ?? home
      const documents = join(userHome, 'Documents')
      const candidates = [
        join(documents, 'PowerShell', 'Microsoft.PowerShell_profile.ps1'),
        join(documents, 'WindowsPowerShell', 'Microsoft.PowerShell_profile.ps1'),
      ]
      const parts = candidates
        .map((p) => sourceIfExists(p, exists, 'powershell'))
        .filter((c): c is string => Boolean(c))
      // Also try $PROFILE when no known file was found (works at runtime in PS).
      if (parts.length === 0) {
        return 'if (Test-Path $PROFILE) { . $PROFILE }'
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

  // Unix / Git Bash on Windows
  const bashProfile = join(home, '.bash_profile')
  const bashrc = join(home, '.bashrc')
  const zprofile = join(home, '.zprofile')
  const zshrc = join(home, '.zshrc')
  const profile = join(home, '.profile')

  if (name === 'bash' || name === 'sh') {
    return (
      sourceIfExists(bashProfile, exists, 'unix') ??
      sourceIfExists(bashrc, exists, 'unix') ??
      sourceIfExists(profile, exists, 'unix')
    )
  }

  if (name === 'zsh') {
    // Login (-l) already loads zprofile; also source bash_profile when present
    // because many macOS setups still keep PATH / tooling there.
    const parts = [
      sourceIfExists(zprofile, exists, 'unix'),
      sourceIfExists(zshrc, exists, 'unix'),
      sourceIfExists(bashProfile, exists, 'unix'),
    ].filter((c): c is string => Boolean(c))
    return parts.length > 0 ? parts.join('; ') : null
  }

  if (name === 'fish') {
    const fishConfig = join(home, '.config', 'fish', 'config.fish')
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
    return `${command} | Out-Null\r`
  }
  if (isCmd(shell)) {
    return `${command} >nul 2>&1\r`
  }
  return `${command} >/dev/null 2>&1\n`
}

function resolveCwd(requested?: string): string {
  const root = workspaceService.getRoot()
  if (!root) {
    throw new Error('Open a workspace before starting a terminal')
  }

  if (!requested) {
    return root
  }

  const cwd = resolve(root, requested)
  const normalizedRoot = resolve(root)
  const rel = relative(normalizedRoot, cwd)
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error('Terminal cwd must stay within the workspace')
  }
  return cwd
}

export class TerminalService {
  private sessions = new Map<string, TerminalSession>()

  create(webContents: WebContents, cwd?: string): { id: string } {
    const id = randomUUID()
    const shell = defaultShell()
    const cols = 80
    const rows = 24

    const proc = pty.spawn(shell, shellArgs(shell), {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: resolveCwd(cwd),
      env: {
        ...(process.env as Record<string, string>),
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
      },
    })

    proc.onData((data) => {
      if (!webContents.isDestroyed()) {
        webContents.send(IPC_EVENTS.TERMINAL_OUTPUT, { id, data })
      }
    })

    proc.onExit(({ exitCode }) => {
      this.sessions.delete(id)
      if (!webContents.isDestroyed()) {
        webContents.send(IPC_EVENTS.TERMINAL_EXIT, { id, exitCode })
      }
    })

    this.sessions.set(id, { pty: proc, webContents })

    // After the shell starts, load profile so PATH / env match a normal terminal.
    const bootstrap = profileBootstrapCommand(shell)
    if (bootstrap) {
      setTimeout(() => {
        if (!this.sessions.has(id)) return
        try {
          proc.write(quietBootstrapCommand(shell, bootstrap))
        } catch {
          // session may have exited
        }
      }, 120)
    }

    return { id }
  }

  write(id: string, data: string): void {
    const session = this.getSession(id)
    session.pty.write(data)
  }

  resize(id: string, cols: number, rows: number): void {
    const session = this.getSession(id)
    if (cols > 0 && rows > 0) {
      session.pty.resize(cols, rows)
    }
  }

  destroy(id: string): void {
    const session = this.sessions.get(id)
    if (!session) return
    this.sessions.delete(id)
    try {
      session.pty.kill()
    } catch {
      // already exited
    }
  }

  destroyAll(): void {
    for (const id of [...this.sessions.keys()]) {
      this.destroy(id)
    }
  }

  private getSession(id: string): TerminalSession {
    const session = this.sessions.get(id)
    if (!session) {
      throw new Error('Terminal session not found')
    }
    return session
  }
}

export const terminalService = new TerminalService()
