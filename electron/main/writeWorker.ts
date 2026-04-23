/**
 * Worker Thread dedicado para serialização e escrita do Excel.
 * Roda em thread separada — nunca bloca o main thread ou o IPC.
 *
 * Na inicialização, carrega o workbook e lê base+list sheets,
 * eliminando a carga duplicada no main thread.
 *
 * Escrita em disco usa debounce de 500ms — acumula writes e serializa
 * apenas uma vez, reduzindo drasticamente I/O em sessões intensas.
 *
 * Protocolo de mensagens:
 *   Parent → Worker:  InitMsg | WriteMsg | DrainMsg
 *   Worker → Parent:  ReadyMsg | DoneMsg | ErrorMsg | DrainedMsg
 */
import { parentPort } from 'worker_threads'
import * as XLSX from 'xlsx'
import { writeFile } from 'fs/promises'
import { readBaseSheet, readListSheet, getSheetHeaders } from '../../shared/excel/excelService'
import type { AppConfig, BaseRow } from '../../shared/types'

interface InitMsg  { type: 'init';  filePath: string; config: AppConfig }
interface WriteMsg { type: 'write'; msgId: number; sheetName: string; rowIndex: number; colIndex: number; value: string }
interface DrainMsg { type: 'drain'; drainId: number }

type InMsg = InitMsg | WriteMsg | DrainMsg

let wb: XLSX.WorkBook | null = null
let filePath = ''
let isDirty = false
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let flushChain: Promise<void> = Promise.resolve()

const DEBOUNCE_MS = 500

// Modifica a célula em memória de forma síncrona e imediata (~1ms)
function modifyCell(sheetName: string, rowIndex: number, colIndex: number, value: string): void {
  if (!wb) return
  const ws = wb.Sheets[sheetName]
  if (!ws || colIndex === -1) return
  const cellAddress = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex })
  ws[cellAddress] = { v: value, t: 's' }
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1')
  if (rowIndex > range.e.r) {
    range.e.r = rowIndex
    ws['!ref'] = XLSX.utils.encode_range(range)
  }
}

// Serializa e persiste no disco — só executa se houver mudanças pendentes
async function flushToDisk(): Promise<void> {
  if (!wb || !filePath || !isDirty) return
  isDirty = false
  const t0 = Date.now()
  try {
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
    console.log(`[WriteWorker] serializado em ${Date.now() - t0}ms, escrevendo no disco...`)
    await writeFile(filePath, buffer)
    console.log(`[WriteWorker] flush concluído em ${Date.now() - t0}ms total`)
  } catch (err) {
    // Marca como dirty de volta para tentar no próximo flush
    isDirty = true
    throw err
  }
}

// Agenda um flush com debounce — múltiplos writes acumulam em um único flush
function scheduleFlush(): void {
  isDirty = true
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    flushChain = flushChain.then(() => flushToDisk()).catch((err) => {
      console.error('[WriteWorker] erro no flush agendado:', err)
    })
  }, DEBOUNCE_MS)
}

// Cancela o debounce e força flush imediato; envia 'drained' ao concluir
function forceFlush(drainId: number): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  flushChain = flushChain.then(async () => {
    try {
      await flushToDisk()
    } catch (err) {
      console.error('[WriteWorker] erro no drain flush:', err)
    }
    parentPort?.postMessage({ type: 'drained', drainId })
  })
}

parentPort?.on('message', (msg: InMsg) => {
  // ─── INIT ───────────────────────────────────────────────────────────────
  if (msg.type === 'init') {
    filePath = msg.filePath
    const t0 = Date.now()
    console.log(`[WriteWorker] init: carregando "${filePath}"`)
    try {
      wb = XLSX.readFile(filePath, { cellStyles: false, cellNF: false })
      const baseRows: BaseRow[] = readBaseSheet(wb, msg.config)
      const allRefs: string[] = readListSheet(wb, msg.config)
      const headers = getSheetHeaders(wb, msg.config.baseSheet.name)
      const condicaoColIndex = headers.findIndex(
        (h) => h.toLowerCase().trim() === msg.config.baseSheet.colCondicao.toLowerCase().trim()
      )
      console.log(
        `[WriteWorker] init: ${baseRows.length} linhas, ${allRefs.length} REFs, condicaoColIndex=${condicaoColIndex} — ${Date.now() - t0}ms`
      )
      parentPort?.postMessage({ type: 'ready', baseRows, allRefs, condicaoColIndex })
    } catch (err) {
      console.error('[WriteWorker] init error:', err)
      parentPort?.postMessage({ type: 'error', msgId: -1, error: String(err) })
    }
    return
  }

  // ─── WRITE ──────────────────────────────────────────────────────────────
  if (msg.type === 'write') {
    const { msgId, sheetName, rowIndex, colIndex, value } = msg
    // Modificação em memória: síncrona e imediata
    modifyCell(sheetName, rowIndex, colIndex, value)
    // Confirma ao caller que a memória foi atualizada
    parentPort?.postMessage({ type: 'done', msgId })
    // Agenda escrita em disco com debounce
    scheduleFlush()
    return
  }

  // ─── DRAIN ──────────────────────────────────────────────────────────────
  if (msg.type === 'drain') {
    forceFlush(msg.drainId)
  }
})
