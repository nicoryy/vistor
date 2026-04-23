import { contextBridge, ipcRenderer } from 'electron'
import type { AppConfig, ShortcutChannel } from '../../shared/types'

contextBridge.exposeInMainWorld('electronAPI', {
  selectFile: () => ipcRenderer.invoke('dialog:select-file'),

  readColumns: (filePath: string, sheetName: string) =>
    ipcRenderer.invoke('excel:read-columns', filePath, sheetName),

  startWorkflow: (config: AppConfig) =>
    ipcRenderer.invoke('workflow:start', config),

  writeResult: () =>
    ipcRenderer.invoke('workflow:write-result'),

  clearResult: () =>
    ipcRenderer.invoke('workflow:clear-result'),

  nextRef: () =>
    ipcRenderer.invoke('workflow:next-ref'),

  prevRef: () =>
    ipcRenderer.invoke('workflow:prev-ref'),

  restartRef: () =>
    ipcRenderer.invoke('workflow:restart-ref'),

  endWorkflow: () =>
    ipcRenderer.invoke('workflow:end'),

  // Retorna true se o usuário clicou no botão positivo, false se cancelou
  showConfirm: (message: string, positiveLabel: string) =>
    ipcRenderer.invoke('dialog:confirm', message, positiveLabel),

  // Adiciona listener para um canal de shortcut (retorna o listener para remoção)
  onShortcut: (channel: ShortcutChannel, callback: () => void) => {
    const listener = (): void => callback()
    ipcRenderer.on(channel, listener)
    return listener
  },

  // Remove listener específico pelo canal
  offShortcut: (channel: ShortcutChannel, listener: () => void) =>
    ipcRenderer.off(channel, listener),

  // Remove todos os listeners de um canal (usado no cleanup)
  removeAllShortcuts: (channel: ShortcutChannel) =>
    ipcRenderer.removeAllListeners(channel)
})
