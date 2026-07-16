import './bootstrap-app'
import { app, BrowserWindow, dialog, ipcMain, nativeImage, session, shell } from 'electron'
import { join } from 'path'
import { APP_NAME, IPC_CHANNELS } from '@codex/shared'
import { indexService } from '@codex/indexer'
import { registerIpcHandlers } from './ipc/handlers'
import { settingsService } from './services/settings'
import { workspaceService } from './services/workspace'
import { terminalService } from './services/terminal-service'
import { fileWatcherService } from './services/file-watcher'
import { setupApplicationMenu } from './menu'
import { resolveAppIconPath, resolvePreloadPath } from './utils/paths'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  const iconPath = resolveAppIconPath()
  const icon = iconPath ? nativeImage.createFromPath(iconPath) : undefined

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: APP_NAME,
    ...(icon && !icon.isEmpty() ? { icon } : {}),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: resolvePreloadPath(__dirname),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (process.platform === 'darwin' && icon && !icon.isEmpty() && app.dock) {
    app.dock.setIcon(icon)
  }

  // Keep native title as Codex Studio (Vite / document title must not revert to Electron).
  mainWindow.on('page-title-updated', (event) => {
    event.preventDefault()
    mainWindow?.setTitle(APP_NAME)
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.setTitle(APP_NAME)
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  app.setAboutPanelOptions({
    applicationName: APP_NAME,
    applicationVersion: app.getVersion(),
    copyright: `Copyright © ${new Date().getFullYear()} ${APP_NAME}`,
  })

  if (!process.env.ELECTRON_RENDERER_URL) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https: http://localhost:* ws://localhost:*",
          ],
        },
      })
    })
  }

  registerIpcHandlers()
  setupApplicationMenu()

  const e2eWorkspace = process.env.CODEX_E2E_WORKSPACE
  if (e2eWorkspace) {
    await workspaceService.open(e2eWorkspace)
    fileWatcherService.start(e2eWorkspace)
    void indexService.scan(e2eWorkspace)
  }

  ipcMain.handle(IPC_CHANNELS.DIALOG_OPEN_DIRECTORY, async () => {
    const win = mainWindow ?? BrowserWindow.getFocusedWindow()
    const options = {
      properties: ['openDirectory', 'createDirectory'] as Array<'openDirectory' | 'createDirectory'>,
      title: 'フォルダーを開く',
      buttonLabel: '開く',
    }
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  fileWatcherService.stop()
  terminalService.destroyAll()
  settingsService.save()
})
