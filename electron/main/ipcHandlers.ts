import { ipcMain, dialog, BrowserWindow } from 'electron'
import type { WorkBook } from 'xlsx'
import { appState } from './appState'
import { writeQueue } from './writeQueue'
import { registerShortcuts, unregisterShortcuts } from './shortcutManager'
import { loadWorkbook, getSheetNames, getColumnsAndPreview } from '../../shared/excel/excelService'
import type { AppConfig } from '../../shared/types'

// Cache do workbook para evitar re-leitura do arquivo a cada troca de aba no setup
let wbCache: { filePath: string; wb: WorkBook } | null = null

function getCachedWorkbook(filePath: string): WorkBook {
  if (wbCache?.filePath === filePath) {
    console.log(`[IPC] getCachedWorkbook: usando cache para "${filePath}"`)
    return wbCache.wb
  }
  console.log(`[IPC] getCachedWorkbook: lendo arquivo "${filePath}"`)
  const wb = loadWorkbook(filePath)
  wbCache = { filePath, wb }
  return wb
}

export function registerIpcHandlers(win: BrowserWindow): void {
  // Abre dialog para selecionar arquivo .xlsx
  ipcMain.handle('dialog:select-file', async () => {
    console.log('[IPC] dialog:select-file: abrindo dialog')
    const result = await dialog.showOpenDialog(win, {
      title: 'Selecionar planilha Excel',
      filters: [{ name: 'Excel', extensions: ['xlsx', 'xls'] }],
      properties: ['openFile']
    })

    if (result.canceled || result.filePaths.length === 0) {
      console.log('[IPC] dialog:select-file: cancelado')
      return null
    }

    const filePath = result.filePaths[0]
    console.log(`[IPC] dialog:select-file: arquivo selecionado "${filePath}"`)

    // Carrega e cacheia o workbook
    const wb = getCachedWorkbook(filePath)
    const sheetNames = getSheetNames(wb)
    console.log(`[IPC] dialog:select-file: ${sheetNames.length} abas → [${sheetNames.join(', ')}]`)

    return { filePath, sheetNames }
  })

  // Lê colunas de uma aba usando o workbook cacheado
  ipcMain.handle('excel:read-columns', (_event, filePath: string, sheetName: string) => {
    console.log(`[IPC] excel:read-columns: "${sheetName}"`)
    const wb = getCachedWorkbook(filePath)
    const result = getColumnsAndPreview(wb, sheetName)
    console.log(`[IPC] excel:read-columns: ${result.columns.length} colunas`)
    return result
  })

  // Inicia o workflow: carrega dados, inicia worker de escrita e registra shortcuts
  ipcMain.handle('workflow:start', async (_event, config: AppConfig) => {
    console.log('[IPC] workflow:start:', JSON.stringify({
      baseSheet: config.baseSheet.name,
      listSheet: config.listSheet.name,
      condicaoValue: config.condicaoValue
    }))

    // Invalida o cache do setup (o appState vai carregar o workbook próprio)
    wbCache = null

    // initialize é async — aguarda o worker de escrita estar pronto
    await appState.initialize(config)
    registerShortcuts(win)

    const snapshot = appState.getSnapshot()
    console.log(`[IPC] workflow:start: ${snapshot.allRefs.length} REFs carregados, primeira ref="${snapshot.allRefs[0]}"`)

    return {
      allRefs: snapshot.allRefs,
      currentRef: appState.getCurrentRef(),
      currentImages: snapshot.currentImages
    }
  })

  // Grava o resultado — modifica em memória (sync) + enfileira write async
  // Retorna IMEDIATAMENTE sem aguardar a escrita no disco
  ipcMain.handle('workflow:write-result', () => {
    console.log('[IPC] workflow:write-result: iniciando')
    const result = appState.writeCurrentResult()
    console.log(`[IPC] workflow:write-result: célula modificada em memória → ID="${result.selectedId}"`)
    return { success: true, ...result }
  })

  // Remove a condição da imagem atual (grava '' na célula)
  ipcMain.handle('workflow:clear-result', () => {
    console.log('[IPC] workflow:clear-result: iniciando')
    const result = appState.clearCurrentResult()
    console.log(`[IPC] workflow:clear-result: condição removida → ID="${result.selectedId}"`)
    return { success: true, ...result }
  })

  // Avança para o próximo REF
  ipcMain.handle('workflow:next-ref', () => {
    const snapshot = appState.advanceRef()
    console.log(`[IPC] workflow:next-ref: refIndex=${snapshot.currentRefIndex} finished=${snapshot.isFinished}`)
    return snapshot
  })

  // Volta para o REF anterior (primeira imagem)
  ipcMain.handle('workflow:prev-ref', () => {
    const snapshot = appState.prevRef()
    console.log(`[IPC] workflow:prev-ref: refIndex=${snapshot.currentRefIndex}`)
    return snapshot
  })

  // Reinicia as imagens do REF atual
  ipcMain.handle('workflow:restart-ref', () => {
    appState.restartCurrentRef()
    const snapshot = appState.getSnapshot()
    console.log(`[IPC] workflow:restart-ref: REF="${appState.getCurrentRef()}" reiniciado`)
    return snapshot
  })

  // Encerra o workflow: drena a fila antes de parar o worker
  ipcMain.handle('workflow:end', async () => {
    console.log('[IPC] workflow:end: aguardando drain (flush final do worker)')
    unregisterShortcuts()
    await writeQueue.drain()
    writeQueue.stop()
    appState.reset()
    console.log('[IPC] workflow:end: concluído')
  })

  // Dialog de confirmação com Cancelar como botão padrão
  ipcMain.handle('dialog:confirm', async (_event, message: string, positiveLabel: string) => {
    console.log(`[IPC] dialog:confirm: "${message.slice(0, 60)}..." positiveLabel="${positiveLabel}"`)
    const { response } = await dialog.showMessageBox(win, {
      type: 'question',
      message,
      buttons: ['Cancelar', positiveLabel],
      defaultId: 0,
      cancelId: 0
    })
    const confirmed = response === 1
    console.log(`[IPC] dialog:confirm: resposta=${confirmed ? positiveLabel : 'Cancelar'}`)
    return confirmed
  })
}

export function removeIpcHandlers(): void {
  const channels = [
    'dialog:select-file',
    'excel:read-columns',
    'workflow:start',
    'workflow:write-result',
    'workflow:clear-result',
    'workflow:next-ref',
    'workflow:prev-ref',
    'workflow:restart-ref',
    'workflow:end',
    'dialog:confirm'
  ]
  channels.forEach((ch) => ipcMain.removeAllListeners(ch))
  wbCache = null
  console.log('[IPC] handlers removidos')
}
