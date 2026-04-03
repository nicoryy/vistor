/**
 * Gerenciador do Worker Thread de escrita.
 * O main thread envia comandos; o worker executa de forma independente.
 */
import { Worker } from 'worker_threads'
import { join } from 'path'

type OutMsg =
  | { type: 'ready' }
  | { type: 'done';    msgId: number }
  | { type: 'error';   msgId: number; error: string }
  | { type: 'drained'; drainId: number }

class WriteQueueManager {
  private worker: Worker | null = null
  private _pending = 0
  private msgCounter = 0
  private drainCounter = 0
  private drainResolvers = new Map<number, () => void>()

  get pending(): number { return this._pending }

  // Inicia o worker e aguarda ele carregar o workbook
  start(filePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const workerPath = join(__dirname, 'writeWorker.js')
      console.log(`[WriteQueue] iniciando worker: ${workerPath}`)

      this.worker = new Worker(workerPath)

      this.worker.on('message', (msg: OutMsg) => {
        if (msg.type === 'ready') {
          console.log('[WriteQueue] worker pronto')
          resolve()
          return
        }
        if (msg.type === 'done') {
          this._pending--
          console.log(`[WriteQueue] msgId=${msg.msgId} concluído, pendentes=${this._pending}`)
          return
        }
        if (msg.type === 'error') {
          this._pending--
          console.error(`[WriteQueue] erro msgId=${msg.msgId}: ${msg.error}`)
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

      this.worker.postMessage({ type: 'init', filePath })
    })
  }

  // Enfileira uma escrita de célula — retorna imediatamente
  enqueue(sheetName: string, rowIndex: number, colIndex: number, value: string): void {
    if (!this.worker) {
      console.error('[WriteQueue] enqueue chamado sem worker ativo')
      return
    }
    const msgId = ++this.msgCounter
    this._pending++
    console.log(`[WriteQueue] enfileirando msgId=${msgId} pendentes=${this._pending}`)
    this.worker.postMessage({ type: 'write', msgId, sheetName, rowIndex, colIndex, value })
  }

  // Aguarda todos os writes pendentes completarem
  drain(): Promise<void> {
    if (!this.worker || this._pending === 0) {
      console.log('[WriteQueue] drain: nada pendente')
      return Promise.resolve()
    }
    return new Promise((resolve) => {
      const drainId = ++this.drainCounter
      console.log(`[WriteQueue] drain: aguardando ${this._pending} write(s) (drainId=${drainId})`)
      this.drainResolvers.set(drainId, resolve)
      this.worker?.postMessage({ type: 'drain', drainId })
    })
  }

  // Para o worker (sem esperar drains pendentes)
  stop(): void {
    if (this.worker) {
      console.log('[WriteQueue] encerrando worker')
      this.worker.terminate()
      this.worker = null
    }
    this._pending = 0
    this.drainResolvers.clear()
  }
}

export const writeQueue = new WriteQueueManager()
