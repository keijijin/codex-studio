import { contextBridge, ipcRenderer } from 'electron'
import type { CodexApi, IpcEventMap, IpcInvokeMap } from '@codex/shared'

const codex: CodexApi = {
  invoke(channel, ...args) {
    return ipcRenderer.invoke(channel, ...args) as Promise<IpcInvokeMap[typeof channel]['result']>
  },
  on(channel, listener) {
    const wrapper = (_event: Electron.IpcRendererEvent, payload: unknown) => {
      listener(payload as IpcEventMap[typeof channel])
    }
    ipcRenderer.on(channel, wrapper)
    return () => ipcRenderer.removeListener(channel, wrapper)
  },
}

contextBridge.exposeInMainWorld('codex', codex)
