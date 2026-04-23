import type { AppConfig, BaseRow, WorkflowSnapshot } from '../../shared/types'
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

    // O worker carrega o workbook e lê os dados — main thread não faz leitura dupla
    const { baseRows, allRefs, condicaoColIndex } = await writeQueue.start(config.filePath, config)

    this.baseRows = baseRows
    this.allRefs = allRefs
    this.currentRefIndex = 0
    this.condicaoColIndex = condicaoColIndex

    console.log(`[AppState] initialize: condicaoColIndex=${this.condicaoColIndex}`)

    this.loadCurrentRefImages()
    console.log(
      `[AppState] initialize: concluído em ${Date.now() - t0}ms — ${this.allRefs.length} REFs, ${this.baseRows.length} linhas`
    )
  }

  private loadCurrentRefImages(): void {
    if (!this.config) return
    const currentRef = this.allRefs[this.currentRefIndex]
    this.currentImages = this.baseRows.filter((r) => r.ref.toLowerCase() === currentRef.toLowerCase())
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
    // Pula REFs sem imagens correspondentes na base (evita tela "Carregando..." infinita)
    while (this.currentRefIndex < this.allRefs.length) {
      this.loadCurrentRefImages()
      if (this.currentImages.length > 0) break
      console.warn(`[AppState] advanceRef: REF="${this.allRefs[this.currentRefIndex]}" sem imagens na base — pulando`)
      this.currentRefIndex++
    }
    const finished = this.currentRefIndex >= this.allRefs.length
    console.log(`[AppState] advanceRef: index=${this.currentRefIndex}/${this.allRefs.length} finished=${finished}`)
    return this.getSnapshot()
  }

  prevRef(): WorkflowSnapshot {
    if (this.currentRefIndex > 0) {
      this.currentRefIndex--
      this.loadCurrentRefImages()
    }
    console.log(`[AppState] prevRef: index=${this.currentRefIndex}/${this.allRefs.length}`)
    return this.getSnapshot()
  }

  /**
   * Grava a condição para a imagem atual.
   * - Atualiza o estado local em memória (instantâneo)
   * - Enfileira a escrita no Worker Thread (não bloca — retorna antes de escrever no disco)
   */
  writeCurrentResult(): { ref: string; selectedId: string } {
    const image = this.getCurrentImage()
    if (!image || !this.config) {
      throw new Error('[AppState] writeCurrentResult: estado inválido')
    }

    const ref = this.getCurrentRef()
    console.log(
      `[AppState] writeCurrentResult: ID="${image.id}" REF="${ref}" row=${image.rowIndex} col=${this.condicaoColIndex} valor="${this.config.condicaoValue}"`
    )

    image.condicao = this.config.condicaoValue
    writeQueue.enqueue(
      this.config.baseSheet.name,
      image.rowIndex,
      this.condicaoColIndex,
      this.config.condicaoValue
    )

    return { ref, selectedId: image.id }
  }

  clearCurrentResult(): { ref: string; selectedId: string } {
    const image = this.getCurrentImage()
    if (!image || !this.config) {
      throw new Error('[AppState] clearCurrentResult: estado inválido')
    }

    const ref = this.getCurrentRef()
    console.log(
      `[AppState] clearCurrentResult: ID="${image.id}" REF="${ref}" row=${image.rowIndex} col=${this.condicaoColIndex}`
    )

    image.condicao = null
    writeQueue.enqueue(
      this.config.baseSheet.name,
      image.rowIndex,
      this.condicaoColIndex,
      ''
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
    // NÃO para o worker aqui — pode ter writes pendentes no debounce
    // O worker é parado em workflow:end após o drain
  }
}

export const appState = new AppStateManager()
