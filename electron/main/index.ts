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

// Intercept fechamento: se há writes pendentes, bloqueia e pergunta
app.on('before-quit', async (event) => {
  if (isQuitting) return // já tratado, deixa fechar

  const pending = writeQueue.pending
  if (pending === 0) return // nada pendente, fecha normalmente

  event.preventDefault()
  console.log(`[App] before-quit interceptado: ${pending} write(s) pendente(s)`)

  const { response } = await dialog.showMessageBox({
    type: 'warning',
    title: 'Gravações pendentes',
    message: `Há ${pending} gravação(ões) pendente(s) no Excel.\n\nO que deseja fazer?`,
    buttons: ['Aguardar conclusão', 'Fechar sem salvar'],
    defaultId: 0,
    cancelId: 1
  })

  if (response === 0) {
    console.log('[App] aguardando drain antes de fechar...')
    await writeQueue.drain()
    console.log('[App] drain concluído, fechando')
  } else {
    console.log('[App] usuário optou por fechar sem salvar')
  }

  isQuitting = true
  app.quit()
})

app.on('window-all-closed', () => {
  removeIpcHandlers()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
