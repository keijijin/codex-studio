import { randomUUID } from 'crypto'
import { isAbsolute, relative, resolve } from 'path'
import type { WebContents } from 'electron'
import * as pty from 'node-pty'
import { IPC_EVENTS } from '@codex/shared'
import { workspaceService } from './workspace'

interface TerminalSession {
  pty: pty.IPty
  webContents: WebContents
}

function defaultShell(): string {
  if (process.platform === 'win32') {
    return process.env.COMSPEC ?? 'powershell.exe'
  }
  return process.env.SHELL ?? '/bin/bash'
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

    const proc = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: resolveCwd(cwd),
      env: process.env as Record<string, string>,
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
