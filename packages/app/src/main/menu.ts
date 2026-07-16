import { Menu, BrowserWindow, type MenuItemConstructorOptions } from 'electron'
import { APP_NAME, IPC_EVENTS } from '@codex/shared'

function sendToFocusedWindow(event: string): void {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  win?.webContents.send(event)
}

export function createApplicationMenu(): Menu {
  const isMac = process.platform === 'darwin'

  const fileMenu: MenuItemConstructorOptions = {
    label: 'ファイル',
    submenu: [
      {
        label: 'フォルダーを開く…',
        accelerator: 'CmdOrCtrl+O',
        click: () => sendToFocusedWindow(IPC_EVENTS.MENU_OPEN_FOLDER),
      },
      {
        label: 'フォルダーを閉じる',
        accelerator: 'CmdOrCtrl+Shift+W',
        click: () => sendToFocusedWindow(IPC_EVENTS.MENU_CLOSE_FOLDER),
      },
      { type: 'separator' },
      {
        label: 'タブをすべて閉じる',
        accelerator: 'CmdOrCtrl+Alt+W',
        click: () => sendToFocusedWindow(IPC_EVENTS.MENU_CLOSE_ALL_TABS),
      },
      { type: 'separator' },
      isMac
        ? { role: 'close', label: 'ウィンドウを閉じる' }
        : { role: 'quit', label: '終了' },
    ],
  }

  const editMenu: MenuItemConstructorOptions = {
    label: '編集',
    submenu: [
      { role: 'undo', label: '元に戻す' },
      { role: 'redo', label: 'やり直す' },
      { type: 'separator' },
      { role: 'cut', label: '切り取り' },
      { role: 'copy', label: 'コピー' },
      { role: 'paste', label: '貼り付け' },
      { role: 'selectAll', label: 'すべて選択' },
    ],
  }

  const viewMenu: MenuItemConstructorOptions = {
    label: '表示',
    submenu: [
      { role: 'reload', label: '再読み込み' },
      { role: 'toggleDevTools', label: '開発者ツール' },
      { type: 'separator' },
      { role: 'resetZoom', label: '実際のサイズ' },
      { role: 'zoomIn', label: '拡大' },
      { role: 'zoomOut', label: '縮小' },
      { type: 'separator' },
      { role: 'togglefullscreen', label: 'フルスクリーン' },
    ],
  }

  const windowMenu: MenuItemConstructorOptions = {
    label: 'ウィンドウ',
    submenu: [
      { role: 'minimize', label: '最小化' },
      { role: 'zoom', label: 'ズーム' },
      ...(isMac
        ? ([
            { type: 'separator' as const },
            { role: 'front' as const, label: 'すべてを手前に移動' },
          ] as MenuItemConstructorOptions[])
        : ([{ role: 'close' as const, label: '閉じる' }] as MenuItemConstructorOptions[])),
    ],
  }

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([
          {
            label: APP_NAME,
            submenu: [
              { role: 'about', label: `${APP_NAME} について` },
              { type: 'separator' },
              { role: 'services', label: 'サービス' },
              { type: 'separator' },
              { role: 'hide', label: `${APP_NAME} を隠す` },
              { role: 'hideOthers', label: 'ほかを隠す' },
              { role: 'unhide', label: 'すべてを表示' },
              { type: 'separator' },
              { role: 'quit', label: `${APP_NAME} を終了` },
            ],
          },
        ] as MenuItemConstructorOptions[])
      : []),
    fileMenu,
    editMenu,
    viewMenu,
    windowMenu,
  ]

  return Menu.buildFromTemplate(template)
}

export function setupApplicationMenu(): void {
  Menu.setApplicationMenu(createApplicationMenu())
}
