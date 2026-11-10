import { BrowserWindow, dialog } from 'electron'
import { resolve } from 'path'
import Store from 'electron-store'
import {
  computeTrustContentHashes,
  trustHashesEqual,
  type TrustContentHashes,
} from './trust-hashes'

export { computeTrustContentHashes } from './trust-hashes'

export interface TrustedWorkspaceRecord {
  root: string
  trustedAt: string
  contentHashes: TrustContentHashes
}

interface TrustStore {
  /** Legacy flat list — migrated on read. */
  trustedRoots: string[]
  workspaces: TrustedWorkspaceRecord[]
}

let store: Store<TrustStore> | null = null

function getStore(): Store<TrustStore> {
  if (!store) {
    store = new Store<TrustStore>({
      name: 'workspace-trust',
      defaults: { trustedRoots: [], workspaces: [] },
    })
  }
  return store
}

function normalizeRoot(root: string): string {
  return resolve(root)
}

function migrateLegacyRoots(): void {
  const s = getStore()
  const legacy = s.get('trustedRoots') ?? []
  if (!legacy.length) return
  const existing = s.get('workspaces') ?? []
  const byRoot = new Map(existing.map((w) => [normalizeRoot(w.root), w]))
  for (const root of legacy) {
    const key = normalizeRoot(root)
    if (byRoot.has(key)) continue
    byRoot.set(key, {
      root: key,
      trustedAt: new Date().toISOString(),
      contentHashes: computeTrustContentHashes(key),
    })
  }
  s.set('workspaces', [...byRoot.values()])
  s.set('trustedRoots', [])
}

function listRecords(): TrustedWorkspaceRecord[] {
  migrateLegacyRoots()
  return getStore().get('workspaces') ?? []
}

function saveRecords(records: TrustedWorkspaceRecord[]): void {
  getStore().set('workspaces', records)
  getStore().set('trustedRoots', [])
}

export interface WorkspaceTrustStatus {
  root: string | null
  trusted: boolean
  trustedAt: string | null
  contentChanged: boolean
}

class WorkspaceTrustService {
  isTrusted(root: string): boolean {
    const key = normalizeRoot(root)
    return listRecords().some((r) => normalizeRoot(r.root) === key)
  }

  getRecord(root: string): TrustedWorkspaceRecord | undefined {
    const key = normalizeRoot(root)
    return listRecords().find((r) => normalizeRoot(r.root) === key)
  }

  listTrusted(): TrustedWorkspaceRecord[] {
    return listRecords()
  }

  trust(root: string): void {
    const key = normalizeRoot(root)
    const records = listRecords().filter((r) => normalizeRoot(r.root) !== key)
    records.push({
      root: key,
      trustedAt: new Date().toISOString(),
      contentHashes: computeTrustContentHashes(key),
    })
    saveRecords(records)
  }

  /** Refresh stored hashes after re-confirmation without changing trustedAt. */
  refreshHashes(root: string): void {
    const key = normalizeRoot(root)
    const records = listRecords()
    const idx = records.findIndex((r) => normalizeRoot(r.root) === key)
    if (idx < 0) {
      this.trust(root)
      return
    }
    records[idx] = {
      ...records[idx]!,
      contentHashes: computeTrustContentHashes(key),
    }
    saveRecords(records)
  }

  untrust(root: string): void {
    const key = normalizeRoot(root)
    saveRecords(listRecords().filter((r) => normalizeRoot(r.root) !== key))
  }

  status(root: string | null | undefined): WorkspaceTrustStatus {
    if (!root) {
      return { root: null, trusted: false, trustedAt: null, contentChanged: false }
    }
    const key = normalizeRoot(root)
    const record = this.getRecord(key)
    if (!record) {
      return { root: key, trusted: false, trustedAt: null, contentChanged: false }
    }
    const current = computeTrustContentHashes(key)
    return {
      root: key,
      trusted: true,
      trustedAt: record.trustedAt,
      contentChanged: !trustHashesEqual(record.contentHashes, current),
    }
  }

  /**
   * Prompt once per folder. Re-prompt when hooks.json / agent.env hashes change.
   * Untrusted workspaces do not run Hooks / agent.env / workspace Rules & Skills.
   */
  async ensureTrusted(root: string): Promise<boolean> {
    // E2E / headless: auto-trust fixture workspaces
    if (process.env.CODEX_E2E_WORKSPACE || process.env.CODEX_TRUST_WORKSPACE === '1') {
      this.trust(root)
      return true
    }

    const key = normalizeRoot(root)
    const record = this.getRecord(key)
    const current = computeTrustContentHashes(key)

    if (record && trustHashesEqual(record.contentHashes, current)) {
      return true
    }

    const contentChanged = Boolean(record)
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const result = await dialog.showMessageBox(win ?? undefined!, {
      type: 'warning',
      buttons: contentChanged
        ? ['再信頼する', '信頼を解除（制限モード）']
        : ['信頼する', '信頼しない（制限モード）'],
      defaultId: 1,
      cancelId: 1,
      title: contentChanged ? 'ワークスペース信頼の再確認' : 'ワークスペースの信頼',
      message: contentChanged
        ? '信頼済みフォルダの設定ファイルが変更されています'
        : 'このフォルダを信頼しますか？',
      detail:
        `${key}\n\n` +
        (contentChanged
          ? '`.codex/hooks.json` または `.codex/agent.env` の内容が、前回信頼時と異なります。\n' +
            '再信頼すると新しい内容で Hooks / agent.env が有効になります。\n'
          : '信頼すると `.codex/hooks.json`・`agent.env`・Rules / Skills が有効になります。\n') +
        '未知のリポジトリでは制限モードを選んでください。',
    })

    if (result.response === 0) {
      this.trust(key)
      return true
    }
    if (contentChanged) {
      this.untrust(key)
    }
    return false
  }
}

export const workspaceTrustService = new WorkspaceTrustService()
