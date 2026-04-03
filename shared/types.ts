// Configuração feita pelo usuário na tela de setup
export interface AppConfig {
  filePath: string

  baseSheet: {
    name: string
    colId: string
    colRef: string
    colFoto: string
    colCondicao: string
  }

  listSheet: {
    name: string
    colRef: string
  }

  // Valor a gravar na coluna CONDICAO ao selecionar um ponto
  condicaoValue: string
}

// Uma linha da aba base (N), mapeada após leitura
export interface BaseRow {
  id: string
  ref: string
  fotoUrl: string
  condicao: string | null
  // Índice real da linha na planilha (base 0, sem considerar cabeçalho)
  rowIndex: number
}

// Estado do workflow em execução
export interface WorkflowSnapshot {
  allRefs: string[]
  currentRefIndex: number
  currentImages: BaseRow[]
  currentImageIndex: number
  isFinished: boolean
}

// Payload para gravar resultado no Excel
export interface WriteResultPayload {
  ref: string
  selectedId: string
  baseRowIndex: number
}

// Resultado do carregamento inicial
export interface WorkflowStartResult {
  allRefs: string[]
  currentRef: string
  currentImages: BaseRow[]
}

// Canais de shortcut emitidos pelo main para o renderer
export type ShortcutChannel = 'shortcut:f1' | 'shortcut:f2' | 'shortcut:f3'

// API exposta via contextBridge
export interface ElectronAPI {
  selectFile: () => Promise<{ filePath: string; sheetNames: string[] } | null>
  readColumns: (filePath: string, sheetName: string) => Promise<{ columns: string[]; preview: Record<string, string>[] }>
  startWorkflow: (config: AppConfig) => Promise<WorkflowStartResult>
  writeResult: () => Promise<{ success: boolean }>
  nextRef: () => Promise<WorkflowSnapshot>
  restartRef: () => Promise<WorkflowSnapshot>
  endWorkflow: () => Promise<void>
  showConfirm: (message: string, positiveLabel: string) => Promise<boolean>
  // onShortcut retorna o listener criado internamente (para uso no offShortcut)
  onShortcut: (channel: ShortcutChannel, callback: () => void) => () => void
  offShortcut: (channel: ShortcutChannel, listener: () => void) => void
  removeAllShortcuts: (channel: ShortcutChannel) => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
