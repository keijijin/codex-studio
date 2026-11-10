/**
 * Vitest shim for Electron APIs used by main-process services.
 * Real `electron` package exports only the binary path outside Electron.
 */
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const userData =
  process.env.ELECTRON_USER_DATA ||
  mkdtempSync(join(tmpdir(), 'codex-vitest-userdata-'))

export const app = {
  getPath(name: string): string {
    switch (name) {
      case 'userData':
        return userData
      case 'appData':
        return join(userData, '..')
      case 'home':
        return process.env.HOME || tmpdir()
      case 'temp':
        return tmpdir()
      default:
        return join(userData, name)
    }
  },
  getName(): string {
    return 'codex-studio'
  },
  getVersion(): string {
    return '0.0.0-test'
  },
  isReady(): boolean {
    return true
  },
  whenReady(): Promise<void> {
    return Promise.resolve()
  },
}

export const safeStorage = {
  isEncryptionAvailable(): boolean {
    return false
  },
  encryptString(plain: string): Buffer {
    return Buffer.from(plain, 'utf-8')
  },
  decryptString(buf: Buffer): string {
    return buf.toString('utf-8')
  },
  async isAsyncEncryptionAvailable(): Promise<boolean> {
    return false
  },
  async encryptStringAsync(plain: string): Promise<Buffer> {
    return Buffer.from(plain, 'utf-8')
  },
  async decryptStringAsync(buf: Buffer): Promise<{ result: string; shouldReEncrypt: boolean }> {
    return { result: buf.toString('utf-8'), shouldReEncrypt: false }
  },
}

export const BrowserWindow = {
  getAllWindows(): unknown[] {
    return []
  },
}

export const ipcMain = {
  handle(): void {},
  on(): void {},
  removeHandler(): void {},
}

export const dialog = {
  showOpenDialog: async () => ({ canceled: true, filePaths: [] as string[] }),
  showMessageBox: async () => ({ response: 0 }),
}

export const Menu = {
  buildFromTemplate: () => ({}),
  setApplicationMenu: () => {},
}

export const shell = {
  openExternal: async () => {},
  openPath: async () => '',
}

export const nativeImage = {
  createFromPath: () => ({}),
}

export const session = {
  defaultSession: {},
}

export default {
  app,
  safeStorage,
  BrowserWindow,
  ipcMain,
  dialog,
  Menu,
  shell,
  nativeImage,
  session,
}
