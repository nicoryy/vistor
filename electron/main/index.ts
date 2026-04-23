import { app, BrowserWindow, shell, dialog } from 'electron'
import { join } from 'path'
import { registerIpcHandlers, removeIpcHandlers } from './ipcHandlers'
import { writeQueue } from './writeQueue'

let mainWin: BrowserWindow | null = null
let isQuitting = false

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Vistor',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  // Abre links externos no browser do sistema
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.whenReady().then(() => {
  mainWin = createWindow()
  registerIpcHandlers(mainWin)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWin = createWindow()
      registerIpcHandlers(mainWin)
    }
  })
})

// Intercept fechamento: força flush de qualquer write com debounce pendente
app.on('before-quit', async (event) => {
  if (isQuitting) return // já tratado, deixa fechar

  event.preventDefault()
  console.log('[App] before-quit: garantindo flush de writes pendentes...')

  await writeQueue.drain()
  console.log('[App] drain concluído, fechando')

  isQuitting = true
  app.quit()
})

app.on('window-all-closed', () => {
  removeIpcHandlers()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
