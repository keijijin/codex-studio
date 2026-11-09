import { BrowserWindow, dialog } from 'electron'
import { resolve } from 'path'
import Store from 'electron-store'

interface TrustStore {
  trustedRoots: string[]
}

let store: Store<TrustStore> | null = null

function getStore(): Store<TrustStore> {
  if (!store) {
    // Construct lazily so unit tests can import this module without touching userData.
    store = new Store<TrustStore>({
      name: 'workspace-trust',
      defaults: { trustedRoots: [] },
    })
  }
  return store
}

function normalizeRoot(root: string): string {
  return resolve(root)
}

class WorkspaceTrustService {
  isTrusted(root: string): boolean {
    const key = normalizeRoot(root)
    const list = getStore().get('trustedRoots') ?? []
    return list.some((r) => normalizeRoot(r) === key)
  }

  trust(root: string): void {
    const key = normalizeRoot(root)
    const list = getStore().get('trustedRoots') ?? []
    if (list.some((r) => normalizeRoot(r) === key)) return
    getStore().set('trustedRoots', [...list, key])
  }

  untrust(root: string): void {
    const key = normalizeRoot(root)
    const list = getStore().get('trustedRoots') ?? []
    getStore().set(
      'trustedRoots',
      list.filter((r) => normalizeRoot(r) !== key),
    )
  }

  /**
   * Prompt once per folder. Untrusted workspaces do not run Hooks / agent.env
   * overrides / workspace Rules & Skills.
   */
  async ensureTrusted(root: string): Promise<boolean> {
    if (this.isTrusted(root)) return true
    // E2E / headless: auto-trust fixture workspaces
    if (process.env.CODEX_E2E_WORKSPACE || process.env.CODEX_TRUST_WORKSPACE === '1') {
      this.trust(root)
      return true
    }

    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const result = await dialog.showMessageBox(win ?? undefined!, {
      type: 'warning',
      buttons: ['信頼する', '信頼しない（制限モード）'],
      defaultId: 1,
      cancelId: 1,
      title: 'ワークスペースの信頼',
      message: 'このフォルダを信頼しますか？',
      detail:
        `${root}\n\n` +
        '信頼すると `.codex/hooks.json`・`agent.env`・Rules / Skills が有効になります。\n' +
        '未知のリポジトリでは「信頼しない」を選んでください。',
    })

    if (result.response === 0) {
      this.trust(root)
      return true
    }
    return false
  }
}

export const workspaceTrustService = new WorkspaceTrustService()
