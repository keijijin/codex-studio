import { app, BrowserWindow, dialog } from 'electron'
import { autoUpdater, type UpdateInfo } from 'electron-updater'
import { IPC_EVENTS, type UpdaterStatus } from '@codex/shared'

export type { UpdaterStatus }

let lastStatus: UpdaterStatus = { state: 'idle' }
let initialized = false
let pendingVersion: string | null = null

function broadcast(status: UpdaterStatus): void {
  lastStatus = status
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC_EVENTS.UPDATER_STATUS, status)
  }
}

function canUseUpdater(): boolean {
  return app.isPackaged && !process.env.ELECTRON_RENDERER_URL
}

export function getUpdaterStatus(): UpdaterStatus {
  return lastStatus
}

export function initAutoUpdater(): void {
  if (initialized) return
  initialized = true

  if (!canUseUpdater()) {
    lastStatus = { state: 'skipped', reason: '開発モードでは自動更新を無効にしています' }
    return
  }

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    broadcast({ state: 'checking' })
  })

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    pendingVersion = info.version
    broadcast({
      state: 'available',
      version: info.version,
      releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : null,
    })
  })

  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    broadcast({ state: 'not-available', version: info.version })
  })

  autoUpdater.on('download-progress', (p) => {
    broadcast({ state: 'downloading', percent: Math.round(p.percent) })
  })

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    broadcast({ state: 'downloaded', version: info.version })
  })

  autoUpdater.on('error', (err) => {
    broadcast({
      state: 'error',
      message: err instanceof Error ? err.message : String(err),
    })
  })

  setTimeout(() => {
    void checkForUpdates({ manual: false }).catch(() => undefined)
  }, 15_000)
}

export async function checkForUpdates(options?: {
  manual?: boolean
}): Promise<UpdaterStatus> {
  const manual = Boolean(options?.manual)

  if (!canUseUpdater()) {
    const status: UpdaterStatus = {
      state: 'skipped',
      reason: '開発モードでは更新チェックを利用できません（パッケージ版でお試しください）',
    }
    broadcast(status)
    if (manual) {
      await dialog.showMessageBox({
        type: 'info',
        message: '更新チェック',
        detail: status.reason,
      })
    }
    return status
  }

  try {
    broadcast({ state: 'checking' })
    await autoUpdater.checkForUpdates()
    // Events update lastStatus; give the emitter a tick
    await new Promise((r) => setTimeout(r, 50))

    if (manual) {
      if (lastStatus.state === 'available') {
        const { response } = await dialog.showMessageBox({
          type: 'info',
          message: `新しいバージョン ${lastStatus.version} があります`,
          detail: 'ダウンロードしてインストールしますか？',
          buttons: ['ダウンロード', '後で'],
          defaultId: 0,
          cancelId: 1,
        })
        if (response === 0) {
          return downloadUpdate()
        }
      } else if (lastStatus.state === 'not-available') {
        await dialog.showMessageBox({
          type: 'info',
          message: '更新はありません',
          detail: `現在のバージョン ${app.getVersion()} が最新です。`,
        })
      } else if (lastStatus.state === 'error') {
        await dialog.showMessageBox({
          type: 'error',
          message: '更新の確認に失敗しました',
          detail: lastStatus.message,
        })
      }
    }

    return lastStatus
  } catch (err) {
    const status: UpdaterStatus = {
      state: 'error',
      message: err instanceof Error ? err.message : String(err),
    }
    broadcast(status)
    if (manual) {
      await dialog.showMessageBox({
        type: 'error',
        message: '更新の確認に失敗しました',
        detail: status.message,
      })
    }
    return status
  }
}

export async function downloadUpdate(): Promise<UpdaterStatus> {
  try {
    await autoUpdater.downloadUpdate()
    const version = pendingVersion ?? app.getVersion()
    const status: UpdaterStatus = { state: 'downloaded', version }
    broadcast(status)
    const { response } = await dialog.showMessageBox({
      type: 'info',
      message: '更新のダウンロードが完了しました',
      detail: '今すぐ再起動してインストールしますか？',
      buttons: ['再起動', '後で'],
      defaultId: 0,
      cancelId: 1,
    })
    if (response === 0) {
      autoUpdater.quitAndInstall()
    }
    return status
  } catch (err) {
    const status: UpdaterStatus = {
      state: 'error',
      message: err instanceof Error ? err.message : String(err),
    }
    broadcast(status)
    await dialog.showMessageBox({
      type: 'error',
      message: '更新のダウンロードに失敗しました',
      detail: status.message,
    })
    return status
  }
}
