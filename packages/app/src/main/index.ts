import { app, BrowserWindow, dialog, ipcMain, session, shell } from 'electron'
import { join } from 'path'
import { IPC_CHANNELS } from '@codex/shared'
import { indexService } from '@codex/indexer'
import { registerIpcHandlers } from './ipc/handlers'
import { settingsService } from './services/settings'
import { workspaceService } from './services/workspace'
import { terminalService } from './services/terminal-service'
import { resolvePreloadPath } from './utils/paths'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: resolvePreloadPath(__dirname),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow.on('ready-to-show', () => {
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

  const e2eWorkspace = process.env.CODEX_E2E_WORKSPACE
  if (e2eWorkspace) {
    await workspaceService.open(e2eWorkspace)
    void indexService.scan(e2eWorkspace)
  }

  ipcMain.handle(IPC_CHANNELS.DIALOG_OPEN_DIRECTORY, async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory', 'createDirectory'],
    })
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
  terminalService.destroyAll()
  settingsService.save()
})
