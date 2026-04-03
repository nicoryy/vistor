import { globalShortcut, BrowserWindow } from 'electron'

let registeredWindow: BrowserWindow | null = null

export function registerShortcuts(win: BrowserWindow): void {
  registeredWindow = win

  globalShortcut.register('F1', () => {
    win.webContents.send('shortcut:f1')
  })

  globalShortcut.register('F2', () => {
    win.webContents.send('shortcut:f2')
  })

  globalShortcut.register('F3', () => {
    win.webContents.send('shortcut:f3')
  })
}

export function unregisterShortcuts(): void {
  globalShortcut.unregisterAll()
  registeredWindow = null
}
