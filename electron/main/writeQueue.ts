/**
 * Gerenciador do Worker Thread de escrita.
 * O main thread envia comandos; o worker executa de forma independente.
 *
 * O worker agora é responsável por carregar o workbook e ler os dados
 * da planilha — start() retorna baseRows, allRefs e condicaoColIndex
 * para que o main thread não precise fazer leitura duplicada.
 */
import { Worker } from 'worker_threads'
import { join } from 'path'
import type { AppConfig, BaseRow } from '../../shared/types'

type OutMsg =
  | { type: 'ready'; baseRows: BaseRow[]; allRefs: string[]; condicaoColIndex: number }
  | { type: 'done';    msgId: number }
  | { type: 'error';   msgId: number; error: string }
  | { type: 'drained'; drainId: number }

class WriteQueueManager {
  private worker: Worker | null = null
  private msgCounter = 0
  private drainCounter = 0
  private drainResolvers = new Map<number, () => void>()

  // Inicia o worker, aguarda ele carregar o workbook e retorna os dados lidos
  start(filePath: string, config: AppConfig): Promise<{ baseRows: BaseRow[]; allRefs: string[]; condicaoColIndex: number }> {
    return new Promise((resolve, reject) => {
      const workerPath = join(__dirname, 'writeWorker.js')
      console.log(`[WriteQueue] iniciando worker: ${workerPath}`)

      this.worker = new Worker(workerPath)

      this.worker.on('message', (msg: OutMsg) => {
        if (msg.type === 'ready') {
          console.log(`[WriteQueue] worker pronto — ${msg.baseRows.length} linhas, ${msg.allRefs.length} REFs`)
          resolve({ baseRows: msg.baseRows, allRefs: msg.allRefs, condicaoColIndex: msg.condicaoColIndex })
          return
        }
        if (msg.type === 'done') {
          console.log(`[WriteQueue] msgId=${msg.msgId} — memória atualizada`)
          return
        }
        if (msg.type === 'error') {
          console.error(`[WriteQueue] erro msgId=${msg.msgId}: ${msg.error}`)
          // Se o erro ocorreu no init (msgId === -1), rejeita a promise de start
          if (msg.msgId === -1) {
            reject(new Error(msg.error))
          }
          return
        }
        if (msg.type === 'drained') {
          const res = this.drainResolvers.get(msg.drainId)
          if (res) {
            res()
            this.drainResolvers.delete(msg.drainId)
          }
        }
      })

      this.worker.on('error', (err) => {
        console.error('[WriteQueue] erro no worker:', err)
        reject(err)
      })

      this.worker.on('exit', (code) => {
        console.log(`[WriteQueue] worker encerrado com código ${code}`)
        this.worker = null
      })

      this.worker.postMessage({ type: 'init', filePath, config })
    })
  }

  // Enfileira uma escrita de célula — retorna imediatamente
  enqueue(sheetName: string, rowIndex: number, colIndex: number, value: string): void {
    if (!this.worker) {
      console.error('[WriteQueue] enqueue chamado sem worker ativo')
      return
    }
    const msgId = ++this.msgCounter
    console.log(`[WriteQueue] enfileirando msgId=${msgId}`)
    this.worker.postMessage({ type: 'write', msgId, sheetName, rowIndex, colIndex, value })
  }

  // Força flush imediato de qualquer write pendente no disco e aguarda conclusão
  drain(): Promise<void> {
    if (!this.worker) {
      console.log('[WriteQueue] drain: sem worker ativo')
      return Promise.resolve()
    }
    return new Promise((resolve) => {
      const drainId = ++this.drainCounter
      console.log(`[WriteQueue] drain: aguardando flush (drainId=${drainId})`)
      this.drainResolvers.set(drainId, resolve)
      this.worker?.postMessage({ type: 'drain', drainId })
    })
  }

  // Para o worker sem esperar drains pendentes
  stop(): void {
    if (this.worker) {
      console.log('[WriteQueue] encerrando worker')
      this.worker.terminate()
      this.worker = null
    }
    this.drainResolvers.clear()
  }
}

export const writeQueue = new WriteQueueManager()
