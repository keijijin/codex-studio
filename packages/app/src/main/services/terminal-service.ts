import { randomUUID } from 'crypto'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { dirname, isAbsolute, join, relative, resolve } from 'path'
import type { WebContents } from 'electron'
import * as pty from 'node-pty'
import { IPC_EVENTS, envWithoutElectronOnlyNodeOptions } from '@codex/shared'
import {
  defaultShell,
  isCmd,
  isPowerShell,
  parseEnvFile,
  profileBootstrapCommand,
  quietBootstrapCommand,
  shellArgs,
} from '@codex/tools'
import { workspaceService } from './workspace'
import { agentEnvService } from './agent-env-service'

export {
  defaultShell,
  isCmd,
  isPowerShell,
  isUnixLikeShell,
  profileBootstrapCommand,
  quietBootstrapCommand,
  shellArgs,
  type ProfileBootstrapOptions,
} from '@codex/tools'

interface TerminalSession {
  pty: pty.IPty
  webContents: WebContents
  shell: string
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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
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
        ...envWithoutElectronOnlyNodeOptions(process.env),
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

    this.sessions.set(id, { pty: proc, webContents, shell })

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

  /**
   * Dump the integrated terminal's current environment into Agent Shell overlay.
   * Writes a temp file via the PTY, then parses KEY=VALUE lines.
   */
  async captureEnvForAgent(id: string): Promise<{ keyCount: number; capturedAt: string }> {
    const root = workspaceService.getRoot()
    if (!root) {
      throw new Error('Open a workspace before syncing terminal environment')
    }

    const session = this.getSession(id)
    const stamp = randomUUID().replace(/-/g, '').slice(0, 12)
    const dumpPath = join(root, '.codex', `.agent-env-dump-${stamp}`)
    mkdirSync(dirname(dumpPath), { recursive: true })
    // Ensure empty file so we can detect rewrite
    writeFileSync(dumpPath, '', 'utf-8')

    const quoted = dumpPath.replace(/'/g, `'\\''`)
    let dumpCmd: string
    if (isPowerShell(session.shell)) {
      const psPath = dumpPath.replace(/'/g, "''")
      dumpCmd =
        `Get-ChildItem Env: | ForEach-Object { \"$($_.Name)=$($_.Value)\" } | ` +
        `Set-Content -LiteralPath '${psPath}' -Encoding utf8; ` +
        `Add-Content -LiteralPath '${psPath}' -Value '__CODEX_ENV_DONE__=${stamp}'\r`
    } else if (isCmd(session.shell)) {
      dumpCmd = `set > "${dumpPath}" & echo __CODEX_ENV_DONE__=${stamp}>> "${dumpPath}"\r`
    } else {
      dumpCmd =
        `/usr/bin/env > '${quoted}'; printf '\\n__CODEX_ENV_DONE__=${stamp}\\n' >> '${quoted}'\n`
    }

    session.pty.write(dumpCmd)

    const deadline = Date.now() + 8_000
    let content = ''
    while (Date.now() < deadline) {
      await sleep(100)
      if (!existsSync(dumpPath)) continue
      try {
        content = readFileSync(dumpPath, 'utf-8')
      } catch {
        continue
      }
      if (content.includes(`__CODEX_ENV_DONE__=${stamp}`)) break
    }

    try {
      unlinkSync(dumpPath)
    } catch {
      // best-effort cleanup
    }

    if (!content.includes(`__CODEX_ENV_DONE__=${stamp}`)) {
      throw new Error('Timed out capturing terminal environment. Try again when the shell is idle.')
    }

    const cleaned = content
      .split(/\r?\n/)
      .filter((line) => !line.startsWith('__CODEX_ENV_DONE__='))
      .join('\n')

    // cmd `set` uses KEY=VALUE; PowerShell dump same. Filter noise.
    const env = parseEnvFile(cleaned)
    // Drop empty / internal markers
    delete env.__CODEX_ENV_DONE__

    if (Object.keys(env).length === 0) {
      throw new Error('Captured environment was empty')
    }

    agentEnvService.setCaptured(env, root)
    const status = agentEnvService.status(root)
    return {
      keyCount: status.capturedKeyCount,
      capturedAt: status.capturedAt ?? new Date().toISOString(),
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
