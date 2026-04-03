import type { AppConfig, BaseRow, WorkflowSnapshot } from '../../shared/types'
import {
  loadWorkbook,
  readBaseSheet,
  readListSheet,
  getSheetHeaders
} from '../../shared/excel/excelService'
import { writeQueue } from './writeQueue'

class AppStateManager {
  private config: AppConfig | null = null
  private allRefs: string[] = []
  private currentRefIndex = 0
  private baseRows: BaseRow[] = []
  private currentImages: BaseRow[] = []
  private currentImageIndex = 0
  // Índice da coluna CONDICAO pré-computado — evita re-parse a cada write
  private condicaoColIndex = -1

  async initialize(config: AppConfig): Promise<void> {
    console.log(`[AppState] initialize: arquivo="${config.filePath}"`)
    console.log(`[AppState] initialize: baseSheet="${config.baseSheet.name}" listSheet="${config.listSheet.name}"`)
    const t0 = Date.now()

    this.config = config

    // Para qualquer worker anterior antes de iniciar um novo
    writeQueue.stop()

    // Carrega workbook no main thread só para leitura de dados
    const wb = loadWorkbook(config.filePath)
    this.baseRows = readBaseSheet(wb, config)
    this.allRefs = readListSheet(wb, config)
    this.currentRefIndex = 0

    // Pré-computa o índice da coluna CONDICAO
    const headers = getSheetHeaders(wb, config.baseSheet.name)
    this.condicaoColIndex = headers.findIndex(
      (h) => h.toLowerCase().trim() === config.baseSheet.colCondicao.toLowerCase().trim()
    )
    console.log(`[AppState] initialize: condicaoColIndex=${this.condicaoColIndex}`)

    this.loadCurrentRefImages()
    console.log(`[AppState] initialize: leitura concluída em ${Date.now() - t0}ms — ${this.allRefs.length} REFs, ${this.baseRows.length} linhas`)

    // Inicia o worker de escrita em paralelo (ele carrega o workbook independentemente)
    await writeQueue.start(config.filePath)
    console.log(`[AppState] initialize: worker de escrita pronto. Total: ${Date.now() - t0}ms`)
  }

  private loadCurrentRefImages(): void {
    if (!this.config) return
    const currentRef = this.allRefs[this.currentRefIndex]
    this.currentImages = this.baseRows.filter((r) => r.ref === currentRef)
    this.currentImageIndex = 0
    console.log(`[AppState] loadCurrentRefImages: REF="${currentRef}" → ${this.currentImages.length} imagens`)
  }

  getCurrentRef(): string {
    return this.allRefs[this.currentRefIndex] ?? ''
  }

  getCurrentImage(): BaseRow | null {
    return this.currentImages[this.currentImageIndex] ?? null
  }

  getSnapshot(): WorkflowSnapshot {
    return {
      allRefs: this.allRefs,
      currentRefIndex: this.currentRefIndex,
      currentImages: this.currentImages,
      currentImageIndex: this.currentImageIndex,
      isFinished: this.currentRefIndex >= this.allRefs.length
    }
  }

  advanceImage(): 'next' | 'last' {
    if (this.currentImageIndex < this.currentImages.length - 1) {
      this.currentImageIndex++
      console.log(`[AppState] advanceImage: imagem ${this.currentImageIndex + 1}/${this.currentImages.length}`)
      return 'next'
    }
    console.log('[AppState] advanceImage: última imagem do REF')
    return 'last'
  }

  restartCurrentRef(): void {
    this.currentImageIndex = 0
    console.log(`[AppState] restartCurrentRef: REF="${this.getCurrentRef()}" reiniciado`)
  }

  advanceRef(): WorkflowSnapshot {
    this.currentRefIndex++
    const finished = this.currentRefIndex >= this.allRefs.length
    if (!finished) {
      this.loadCurrentRefImages()
    }
    console.log(`[AppState] advanceRef: index=${this.currentRefIndex}/${this.allRefs.length} finished=${finished}`)
    return this.getSnapshot()
  }

  /**
   * Grava a condição para a imagem atual.
   * - Atualiza o estado local em memória (instantâneo)
   * - Enfileira a escrita no Worker Thread (não bloca — retorna antes de escrever)
   */
  writeCurrentResult(): { ref: string; selectedId: string } {
    const image = this.getCurrentImage()
    if (!image || !this.config) {
      throw new Error('[AppState] writeCurrentResult: estado inválido')
    }

    const ref = this.getCurrentRef()
    console.log(`[AppState] writeCurrentResult: ID="${image.id}" REF="${ref}" row=${image.rowIndex} col=${this.condicaoColIndex} valor="${this.config.condicaoValue}"`)

    // Atualiza estado local (sync, instantâneo)
    image.condicao = this.config.condicaoValue

    // Enfileira write no Worker Thread — retorna imediatamente
    writeQueue.enqueue(
      this.config.baseSheet.name,
      image.rowIndex,
      this.condicaoColIndex,
      this.config.condicaoValue
    )

    return { ref, selectedId: image.id }
  }

  reset(): void {
    console.log('[AppState] reset')
    this.config = null
    this.allRefs = []
    this.currentRefIndex = 0
    this.baseRows = []
    this.currentImages = []
    this.currentImageIndex = 0
    this.condicaoColIndex = -1
    // NÃO para o worker aqui — pode ter writes pendentes
    // O worker é parado em workflow:end após o drain
  }
}

export const appState = new AppStateManager()
