/**
 * Worker Thread dedicado para serialização e escrita do Excel.
 * Roda em thread separada — nunca bloca o main thread ou o IPC.
 *
 * Protocolo de mensagens:
 *   Parent → Worker:  InitMsg | WriteMsg | DrainMsg
 *   Worker → Parent:  ReadyMsg | DoneMsg | ErrorMsg | DrainedMsg
 */
import { parentPort } from 'worker_threads'
import * as XLSX from 'xlsx'
import { writeFile } from 'fs/promises'

interface InitMsg  { type: 'init';  filePath: string }
interface WriteMsg { type: 'write'; msgId: number; sheetName: string; rowIndex: number; colIndex: number; value: string }
interface DrainMsg { type: 'drain'; drainId: number }

type InMsg = InitMsg | WriteMsg | DrainMsg

let wb: XLSX.WorkBook | null = null
let filePath = ''

// Fila interna sequencial — garante que writes não concorrem
let queue: Promise<void> = Promise.resolve()
let pendingCount = 0

// Map para resolvers de drain (aguarda zero pendentes)
const drainResolvers: Map<number, () => void> = new Map()

function checkDrain(): void {
  if (pendingCount === 0) {
    drainResolvers.forEach((resolve) => resolve())
    drainResolvers.clear()
  }
}

parentPort?.on('message', (msg: InMsg) => {
  // ─── INIT ───────────────────────────────────────────────────────────
  if (msg.type === 'init') {
    try {
      filePath = msg.filePath
      console.log(`[WriteWorker] init: carregando "${filePath}"`)
      const t0 = Date.now()
      wb = XLSX.readFile(filePath, { cellStyles: false, cellNF: false })
      console.log(`[WriteWorker] init: workbook carregado em ${Date.now() - t0}ms`)
      parentPort?.postMessage({ type: 'ready' })
    } catch (err) {
      console.error('[WriteWorker] init error:', err)
      parentPort?.postMessage({ type: 'error', msgId: -1, error: String(err) })
    }
    return
  }

  // ─── WRITE ──────────────────────────────────────────────────────────
  if (msg.type === 'write') {
    const { msgId, sheetName, rowIndex, colIndex, value } = msg
    pendingCount++
    console.log(`[WriteWorker] write enfileirado: msgId=${msgId} pendentes=${pendingCount}`)

    queue = queue.then(async () => {
      try {
        if (!wb) throw new Error('Workbook não inicializado')
        const ws = wb.Sheets[sheetName]
        if (!ws) throw new Error(`Aba "${sheetName}" não encontrada`)

        // Modifica célula
        const cellAddress = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex })
        ws[cellAddress] = { v: value, t: 's' }

        const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1')
        if (rowIndex > range.e.r) {
          range.e.r = rowIndex
          ws['!ref'] = XLSX.utils.encode_range(range)
        }

        // Serializa e escreve (tudo na thread do worker, sem bloquear main)
        const t0 = Date.now()
        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
        console.log(`[WriteWorker] serializado em ${Date.now() - t0}ms, escrevendo no disco...`)
        await writeFile(filePath, buffer)
        console.log(`[WriteWorker] escrita concluída em ${Date.now() - t0}ms total (msgId=${msgId})`)

        parentPort?.postMessage({ type: 'done', msgId })
      } catch (err) {
        console.error(`[WriteWorker] erro na escrita (msgId=${msgId}):`, err)
        parentPort?.postMessage({ type: 'error', msgId, error: String(err) })
      } finally {
        pendingCount--
        console.log(`[WriteWorker] pendentes restantes: ${pendingCount}`)
        checkDrain()
      }
    })
    return
  }

  // ─── DRAIN ──────────────────────────────────────────────────────────
  if (msg.type === 'drain') {
    const { drainId } = msg
    if (pendingCount === 0) {
      parentPort?.postMessage({ type: 'drained', drainId })
    } else {
      drainResolvers.set(drainId, () => {
        parentPort?.postMessage({ type: 'drained', drainId })
      })
    }
  }
})
